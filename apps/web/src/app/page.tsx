import { Suspense } from 'react';
import type { CategoryDto, Paginated, ProductCardDto } from '@shopsense/shared';
import Link from 'next/link';
import { serverGet } from '@/lib/server-api';
import { SearchBox } from '@/components/search-box';
import { HeroDemo } from '@/components/hero-demo';
import { RecommendedForYou } from '@/components/recommended';
import { Button } from '@/components/ui/button';
import { PromoCarousel } from '@/components/home/promo-carousel';
import { ServiceStrip } from '@/components/home/service-strip';
import { CategoryTiles } from '@/components/home/category-tiles';
import { FlashDeals } from '@/components/home/flash-deals';
import { ProductRow } from '@/components/home/product-row';
import { StoreShowcase, type StoreSummary } from '@/components/home/store-showcase';

// Rendered per request; the API data itself is cached (fetch revalidate + Redis), so a
// sleeping API at build time (free hosting) can never freeze an empty homepage into the build.
export const dynamic = 'force-dynamic';

const row = (q: string) =>
  serverGet<Paginated<ProductCardDto>>(`/products?${q}`, 300).then((r) => r?.items ?? null);

export default async function HomePage() {
  const [categories, trending, deals, electronics, fashion, home, stores] = await Promise.all([
    serverGet<CategoryDto[]>('/categories', 300),
    serverGet<ProductCardDto[]>('/recommendations/trending?limit=10', 300),
    row('onSale=true&sort=popular&limit=14'),
    row('category=electronics&sort=popular&limit=5'),
    row('category=fashion&sort=popular&limit=5'),
    row('category=home-kitchen&sort=popular&limit=5'),
    serverGet<StoreSummary[]>('/stores', 600),
  ]);

  if (!categories && !trending) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-6 text-muted-fg">
        The catalogue is empty or the API is offline. Start the API and run <code>pnpm db:seed</code>.
      </p>
    );
  }

  return (
    <>
      <PromoCarousel />
      <ServiceStrip />

      <section
        aria-labelledby="ai-search"
        className="mt-10 grid gap-6 rounded-3xl border border-line bg-surface p-6 sm:p-8 lg:grid-cols-[1fr_1.1fr] lg:items-center"
      >
        <div>
          <h1 id="ai-search" className="text-balance text-3xl sm:text-4xl">
            Say what you’re shopping for. We’ll find it.
          </h1>
          <p className="mt-3 max-w-lg text-muted-fg">
            Type it the way you’d ask a shop assistant: colour, budget, fit, what it’s for. ShopShare turns
            your sentence into filters and searches every store at once.
          </p>
        </div>
        <div>
          <Suspense>
            <SearchBox size="lg" />
          </Suspense>
          <HeroDemo />
        </div>
      </section>

      {categories?.length ? <CategoryTiles categories={categories} /> : null}
      {deals?.length ? <FlashDeals products={deals} /> : null}
      <RecommendedForYou />
      <ProductRow
        title="Trending this week"
        subtitle="Most viewed and bought in the last 7 days."
        products={trending}
      />
      <ProductRow title="Top in electronics" href="/c/electronics" products={electronics} />
      <ProductRow title="Fashion picks" href="/c/fashion" products={fashion} />
      {stores?.length ? <StoreShowcase stores={stores} /> : null}
      <ProductRow title="For your home" href="/c/home-kitchen" products={home} />

      <section className="mt-16 grid gap-6 rounded-3xl bg-ink p-8 text-paper sm:p-12 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div>
          <h2 className="text-3xl">Have something to sell?</h2>
          <p className="mt-3 max-w-lg text-paper/75">
            Open a store in minutes. Add a title, a few keywords and a photo, and ShopShare drafts the
            description and search tags for you.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 md:justify-end">
          <Button asChild variant="accent" size="lg">
            <Link href="/register?role=seller">Open a store</Link>
          </Button>
          <Button asChild size="lg" className="bg-paper/10 text-paper hover:bg-paper/20">
            <Link href="/login">Try the demo seller</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
