import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, ChevronRight } from 'lucide-react';
import { notFound } from 'next/navigation';
import { formatSold, formatTHB, type ProductCardDto, type ProductDetailDto } from '@shopsense/shared';
import { serverGet } from '@/lib/server-api';
import { SITE_URL, imageUrl } from '@/lib/utils';
import { ProductGrid } from '@/components/product-card';
import { Stars } from '@/components/stars';
import { Gallery } from './gallery';
import { Purchase } from './purchase';
import { Reviews } from './reviews';
import { ViewTracker } from './view-tracker';

type Params = Promise<{ slug: string }>;

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = await serverGet<ProductDetailDto>(`/products/${slug}`, 120);
  if (!p) return { title: 'Product not found' };
  const description = p.description.slice(0, 155);
  const image = p.images[0]?.url ? new URL(imageUrl(p.images[0].url, 1200), SITE_URL).toString() : undefined;
  return {
    title: p.title,
    description,
    alternates: { canonical: `/p/${p.slug}` },
    openGraph: {
      title: `${p.title} — ${formatTHB(p.price)}`,
      description,
      images: image ? [image] : undefined,
      type: 'website',
    },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await serverGet<ProductDetailDto>(`/products/${slug}`, 120);
  if (!product) notFound();
  const similar =
    (await serverGet<ProductCardDto[]>(`/recommendations/similar/${product.id}?limit=5`, 600)) ?? [];

  // Structured data so search engines can show price, stock and rating.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    image: product.images.map((i) => new URL(i.url, SITE_URL).toString()),
    sku: product.id,
    brand: product.seller ? { '@type': 'Brand', name: product.seller.storeName } : undefined,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'THB',
      price: (product.price / 100).toFixed(2),
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${SITE_URL}/p/${product.slug}`,
    },
    aggregateRating: product.ratingCount
      ? { '@type': 'AggregateRating', ratingValue: product.ratingAvg, reviewCount: product.ratingCount }
      : undefined,
  };

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <ViewTracker productId={product.id} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-fg">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        {product.category ? (
          <>
            {' / '}
            <Link href={`/c/${product.category.slug}`} className="hover:text-ink">
              {product.category.name}
            </Link>
          </>
        ) : null}
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <Gallery images={product.images} title={product.title} />
        <div>
          {product.seller ? (
            <Link href={`/store/${product.seller.slug}`} className="text-sm text-teal hover:underline">
              {product.seller.storeName}
            </Link>
          ) : null}
          <h1 className="mt-1 text-3xl sm:text-4xl">{product.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            {product.ratingCount ? (
              <a href="#reviews" className="hover:underline">
                <Stars value={product.ratingAvg} count={product.ratingCount} size="md" />
              </a>
            ) : (
              <span className="text-muted-fg">No reviews yet</span>
            )}
            {product.salesCount > 0 ? (
              <>
                <span aria-hidden className="h-4 w-px bg-line" />
                <span className="text-muted-fg">{formatSold(product.salesCount)} sold</span>
              </>
            ) : null}
            {product.brand ? (
              <>
                <span aria-hidden className="h-4 w-px bg-line" />
                <Link
                  href={`/search?q=${encodeURIComponent(product.brand)}`}
                  className="text-muted-fg hover:text-teal"
                >
                  Brand: {product.brand}
                </Link>
              </>
            ) : null}
          </div>
          <Purchase product={product} />
          {product.seller ? (
            <Link
              href={`/store/${product.seller.slug}`}
              className="mt-6 flex items-center gap-3 rounded-2xl border border-line p-4 hover:border-ink/30"
            >
              <span
                className="grid size-11 shrink-0 place-items-center rounded-full bg-ink font-display text-lg font-bold text-paper"
                aria-hidden
              >
                {product.seller.storeName.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-medium">
                  {product.seller.storeName}{' '}
                  <BadgeCheck className="size-4 text-teal" aria-label="Verified store" />
                </span>
                <span className="block text-sm text-muted-fg">Visit the store for more products</span>
              </span>
              <ChevronRight className="size-4 text-muted-fg" aria-hidden />
            </Link>
          ) : null}
          <section className="mt-10" aria-labelledby="desc">
            <h2 id="desc" className="text-xl">
              About this product
            </h2>
            <div className="prose-desc mt-3 max-w-[65ch] whitespace-pre-line text-[15px] leading-relaxed text-ink/90">
              {product.description}
            </div>
            {product.tags.length ? (
              <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
                {product.tags.map((t) => (
                  <li key={t}>
                    <Link
                      href={`/search?q=${encodeURIComponent(t)}`}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs hover:bg-line"
                    >
                      {t}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      </div>

      <Reviews productId={product.id} />

      {similar.length ? (
        <section className="mt-20" aria-labelledby="similar">
          <h2 id="similar" className="mb-6 text-2xl">
            Similar products
          </h2>
          <ProductGrid products={similar} />
        </section>
      ) : null}
    </article>
  );
}
