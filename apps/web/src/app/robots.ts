import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/utils';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/seller', '/cart', '/checkout', '/orders', '/profile', '/wishlist', '/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
