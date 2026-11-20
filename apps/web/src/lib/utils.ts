import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { formatTHB } from '@shopsense/shared';

/**
 * Returns a resized image URL.
 * Cloudinary: inserts a transformation. Local uploads: uses the 400px "-sm" thumbnail.
 */
export function imageUrl(url: string | null | undefined, width: 400 | 800 | 1200 = 800): string {
  if (!url) return '/placeholder.svg';
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/w_${width},c_limit,q_auto,f_auto/`);
  }
  if (
    width === 400 &&
    url.startsWith('/api/uploads/') &&
    url.endsWith('.webp') &&
    !url.endsWith('-sm.webp')
  ) {
    return url.replace(/\.webp$/, '-sm.webp');
  }
  return url;
}

export function formatDate(
  iso: string,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
) {
  // toLocaleDateString() throws on time options (timeStyle, hour…); toLocaleString() accepts both.
  return new Date(iso).toLocaleString('en-GB', opts);
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
