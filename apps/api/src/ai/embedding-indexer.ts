import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Embedder } from './embedding.service';
import { toVectorLiteral } from './embedding.service';

/** The text we embed for a product. Title and tags first because they matter most. */
export function productEmbeddingText(p: {
  title: string;
  brand?: string | null;
  description: string;
  tags: string[];
  category?: { name: string } | null;
  variants?: { colour: string | null; size: string | null }[];
}): string {
  const colours = [...new Set((p.variants ?? []).map((v) => v.colour).filter(Boolean))];
  return [
    p.title,
    p.title,
    p.brand ? `Brand: ${p.brand}` : '',
    p.category ? `Category: ${p.category.name}` : '',
    p.tags.length ? `Tags: ${p.tags.join(', ')}` : '',
    colours.length ? `Colours: ${colours.join(', ')}` : '',
    p.description,
  ]
    .filter(Boolean)
    .join('. ');
}

/**
 * (Re)computes embeddings for the given products (or all products).
 * Skips products whose text and model have not changed, using a content hash.
 */
export async function indexProductEmbeddings(
  prisma: PrismaClient,
  embedder: Embedder,
  productIds?: string[],
): Promise<{ indexed: number; skipped: number }> {
  const products = await prisma.product.findMany({
    where: productIds ? { id: { in: productIds } } : undefined,
    include: { category: true, variants: true, embedding: { select: { contentHash: true, model: true } } },
  });
  const todo = products
    .map((p) => {
      const text = productEmbeddingText(p);
      const hash = createHash('sha256').update(`${embedder.model}|${text}`).digest('hex');
      return { p, text, hash };
    })
    .filter(({ p, hash }) => p.embedding?.contentHash !== hash);

  for (let i = 0; i < todo.length; i += 32) {
    const batch = todo.slice(i, i + 32);
    const vectors = await embedder.embed(batch.map((b) => b.text));
    for (let j = 0; j < batch.length; j++) {
      const { p, hash } = batch[j];
      await prisma.$executeRaw`
        INSERT INTO product_embeddings (product_id, embedding, model, content_hash, updated_at)
        VALUES (${p.id}, ${toVectorLiteral(vectors[j])}::vector, ${embedder.model}, ${hash}, NOW())
        ON CONFLICT (product_id) DO UPDATE
          SET embedding = EXCLUDED.embedding, model = EXCLUDED.model,
              content_hash = EXCLUDED.content_hash, updated_at = NOW()`;
    }
  }
  return { indexed: todo.length, skipped: products.length - todo.length };
}
