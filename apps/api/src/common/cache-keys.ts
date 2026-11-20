import { RedisService } from '../redis/redis.service';

export const CacheKeys = {
  categories: 'categories:all',
  product: (slug: string) => `product:${slug}`,
  productList: (q: unknown) => `products:list:${RedisService.hashKey(q)}`,
  search: (q: unknown) => `search:${RedisService.hashKey(q)}`,
  similar: (id: string) => `similar:${id}`,
  trending: 'trending:v1',
  reviewSummary: (id: string, count: number) => `review-summary:${id}:${count}`,
  store: (slug: string) => `store:${slug}`,
};

/** Clears every cache entry that could contain this product. */
export async function invalidateProductCaches(redis: RedisService, slugs: string[] = []) {
  await Promise.all([
    redis.del(CacheKeys.categories, CacheKeys.trending, ...slugs.map(CacheKeys.product)),
    redis.delPattern('products:list:*'),
    redis.delPattern('search:*'),
    redis.delPattern('similar:*'),
    redis.delPattern('store:*'),
  ]);
}
