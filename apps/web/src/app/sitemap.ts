import type { MetadataRoute } from 'next';
import type { CategoryDto, Paginated, ProductCardDto } from '@shopsense/shared';
import { serverGet } from '@/lib/server-api';
import { SITE_URL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, ...pages] = await Promise.all([
    serverGet<CategoryDto[]>('/categories', 3600),
    ...[1, 2, 3, 4, 5].map((page) =>
      serverGet<Paginated<ProductCardDto>>(`/products?limit=60&page=${page}`, 3600),
    ),
  ]);
  const products = pages.flatMap((p) => p?.items ?? []);
  const stores = [...new Set(products.map((p) => p.seller?.slug).filter(Boolean))] as string[];
  return [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    ...(categories ?? []).map((c) => ({
      url: `${SITE_URL}/c/${c.slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: `${SITE_URL}/p/${p.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...stores.map((s) => ({
      url: `${SITE_URL}/store/${s}`,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
  ];
}
