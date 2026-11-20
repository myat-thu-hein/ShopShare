import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  applyIgnoredChips,
  bahtToSatang,
  buildSearchChips,
  parsedSearchSchema,
  type ParsedSearch,
  type SearchQuery,
  type SearchResultDto,
} from '@shopsense/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LlmService } from '../ai/llm.service';
import { EmbeddingService, toVectorLiteral } from '../ai/embedding.service';
import { normaliseParsed, parseQueryWithRules } from '../ai/query-parser';
import { tokenize } from '../ai/local-embedder';
import { CategoriesService } from '../categories/categories.module';
import { CacheKeys } from '../common/cache-keys';
import { CARD_INCLUDE, toCard } from '../products/product.mapper';

/** Reciprocal Rank Fusion constant: higher = flatter blend of the two rankings. */
const RRF_K = 60;

export interface SearchFilters {
  categorySlug: string | null;
  colours: string[];
  sizes: string[];
  minPrice: number | null; // satang
  maxPrice: number | null; // satang
  inStock?: boolean;
  excludeIds?: string[];
}

/**
 * Natural-language search in three steps:
 *  1. Understand: the LLM turns the sentence into structured filters (JSON schema output).
 *     Without an LLM, a rule-based parser does the same job for common phrasing.
 *  2. Filter: hard filters (category, price, colour, size, stock) run in SQL.
 *  3. Rank: vector similarity (pgvector) and full-text keyword rank are fused with RRF.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly llm: LlmService,
    private readonly embeddings: EmbeddingService,
    private readonly categories: CategoriesService,
  ) {}

  async search(query: SearchQuery): Promise<SearchResultDto> {
    return this.redis.remember(CacheKeys.search(query), 120, () => this.run(query));
  }

  private async run(query: SearchQuery): Promise<SearchResultDto> {
    const { parsed, parser } = await this.understand(query.q);
    const ignore = (query.ignore ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const understood = applyIgnoredChips(parsed, ignore);

    const filters: SearchFilters = {
      categorySlug: understood.category,
      colours: understood.colours,
      sizes: understood.sizes,
      minPrice: understood.minPrice != null ? bahtToSatang(understood.minPrice) : null,
      maxPrice: understood.maxPrice != null ? bahtToSatang(understood.maxPrice) : null,
      inStock: query.inStock,
    };
    // After the user removes chips, rank by what is left rather than the raw sentence.
    const rankingText = ignore.length
      ? [...understood.keywords, understood.category?.replace(/-/g, ' '), ...understood.colours]
          .filter(Boolean)
          .join(' ') || query.q
      : query.q;
    const keywordText = [...understood.keywords, ...(ignore.length ? [] : [query.q])].join(' ');

    const ranked = await this.rank(rankingText, keywordText, filters);
    const sort = query.sort ?? understood.sort ?? 'relevance';

    let ids = ranked.map((r) => r.id);
    if (sort !== 'relevance' && ids.length) {
      const rows = await this.prisma.product.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          price: true,
          ratingAvg: true,
          ratingCount: true,
          salesCount: true,
          createdAt: true,
        },
      });
      const cmp: Record<string, (a: (typeof rows)[0], b: (typeof rows)[0]) => number> = {
        price_asc: (a, b) => a.price - b.price,
        price_desc: (a, b) => b.price - a.price,
        rating: (a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount,
        popular: (a, b) => b.salesCount - a.salesCount,
        newest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      };
      ids = rows.sort(cmp[sort]).map((r) => r.id);
    }

    const total = ids.length;
    const pageIds = ids.slice((query.page - 1) * query.limit, query.page * query.limit);
    const rows = await this.prisma.product.findMany({
      where: { id: { in: pageIds } },
      include: CARD_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, toCard(r)]));

    return {
      query: query.q,
      understood,
      chips: buildSearchChips(understood),
      parser,
      items: pageIds.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  /** Step 1 — sentence to structured filters. Cached for a day per sentence. */
  async understand(q: string): Promise<{ parsed: ParsedSearch; parser: 'llm' | 'rules' }> {
    const cats = await this.categories.list();
    const slugs = cats.map((c) => c.slug);
    const key = `parse:${this.llm.provider}:${RedisService.hashKey(q.toLowerCase())}`;
    const cached = await this.redis.getJson<{ parsed: ParsedSearch; parser: 'llm' | 'rules' }>(key);
    if (cached) return cached;

    let result: { parsed: ParsedSearch; parser: 'llm' | 'rules' } | null = null;
    if (this.llm.enabled) {
      const out = await this.llm.json({
        name: 'search_filters',
        schema: parsedSearchSchema,
        maxTokens: 400,
        system: [
          "You convert a shopper's search sentence for a Thai online marketplace into structured filters.",
          `category must be one of: ${slugs.join(', ')} — or null if unclear.`,
          'Prices are in Thai baht (THB). "under 2000" means maxPrice 2000. "2k" means 2000. Use null when not mentioned.',
          'colours: lowercase basic colour names only (e.g. red, black, navy).',
          'sizes: clothing (S, M, L, XL) or shoe sizes (e.g. 42) only if explicitly mentioned.',
          'keywords: 1-4 short product attributes or types NOT already covered by category/colour/price,',
          '  e.g. "running", "wide fit", "waterproof", "noise cancelling". Translate "wide feet" to "wide fit".',
          'sort: price_asc if they ask for cheapest, rating for best rated, popular for best selling, newest for new; else null.',
        ].join('\n'),
        user: q,
      });
      if (out) result = { parsed: normaliseParsed(out, slugs), parser: 'llm' };
    }
    if (!result) result = { parsed: normaliseParsed(parseQueryWithRules(q, slugs), slugs), parser: 'rules' };
    await this.redis.setJson(key, result, 86_400);
    return result;
  }

  /** Step 2 + 3 — hard filters in SQL, then vector + keyword ranking fused with RRF. */
  async rank(
    semanticText: string,
    keywordText: string,
    f: SearchFilters,
    limit = 200,
  ): Promise<{ id: string; score: number }[]> {
    const where = this.filterSql(f);
    const vector = semanticText.trim() ? await this.embeddings.embedOne(semanticText) : null;

    const semantic: { id: string; sim: number }[] = vector
      ? await this.prisma.$queryRaw<{ id: string; sim: number }[]>`
          SELECT p.id, (1 - (e.embedding <=> ${toVectorLiteral(vector)}::vector))::float AS sim
          FROM products p
          JOIN product_embeddings e ON e.product_id = p.id AND e.model = ${this.embeddings.model}
          ${where}
          ORDER BY e.embedding <=> ${toVectorLiteral(vector)}::vector
          LIMIT ${limit}`
      : [];

    const terms = [
      ...new Set(
        tokenize(keywordText)
          .map((t) => t.replace(/[^a-z0-9]/g, ''))
          .filter((t) => t.length > 1),
      ),
    ].slice(0, 12);
    const keyword: { id: string }[] = terms.length
      ? await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT p.id
          FROM products p, to_tsquery('english', ${terms.join(' | ')}) query
          ${where} AND products_search_document(p.title, p.description, p.tags) @@ query
          ORDER BY ts_rank_cd(products_search_document(p.title, p.description, p.tags), query) DESC
          LIMIT ${limit}`
      : [];

    // Keep only semantically relevant products: at least 40% as similar as the best match.
    const top = semantic[0]?.sim ?? 0;
    const cutoff = Math.max(0.08, top * 0.4);
    const scores = new Map<string, number>();
    semantic.forEach((r, i) => {
      if (r.sim >= cutoff) scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (RRF_K + i + 1));
    });
    keyword.forEach((r, i) => scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (RRF_K + i + 1)));

    // Pure filter queries ("red things under 500 baht") with no meaningful text: return all matches.
    if (!semanticText.trim() && !terms.length) {
      const all = await this.prisma.$queryRaw<
        { id: string }[]
      >`SELECT p.id FROM products p ${where} ORDER BY p.sales_count DESC LIMIT ${limit}`;
      return all.map((r, i) => ({ id: r.id, score: 1 / (RRF_K + i + 1) }));
    }
    return [...scores.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
  }

  /** Builds the shared WHERE clause. Every value is a bound parameter (no SQL injection). */
  filterSql(f: SearchFilters): Prisma.Sql {
    const parts: Prisma.Sql[] = [
      Prisma.sql`p.status = 'PUBLISHED'`,
      Prisma.sql`EXISTS (SELECT 1 FROM users u JOIN seller_profiles sp ON sp.user_id = u.id
                  WHERE u.id = p.seller_id AND u.is_banned = false AND sp.status = 'APPROVED')`,
    ];
    if (f.categorySlug)
      parts.push(Prisma.sql`p.category_id = (SELECT id FROM categories WHERE slug = ${f.categorySlug})`);
    if (f.minPrice != null) parts.push(Prisma.sql`p.price >= ${f.minPrice}`);
    if (f.maxPrice != null) parts.push(Prisma.sql`p.price <= ${f.maxPrice}`);
    if (f.inStock) parts.push(Prisma.sql`p.stock > 0`);
    if (f.colours.length) {
      parts.push(Prisma.sql`(EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND lower(v.colour) = ANY(${f.colours}))
        OR lower(p.title) ~ ${`\\m(${f.colours.join('|')})\\M`})`);
    }
    if (f.sizes.length) {
      parts.push(
        Prisma.sql`EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND upper(v.size) = ANY(${f.sizes}) AND v.stock > 0)`,
      );
    }
    if (f.excludeIds?.length) parts.push(Prisma.sql`p.id <> ALL(${f.excludeIds})`);
    return Prisma.sql`WHERE ${Prisma.join(parts, ' AND ')}`;
  }
}
