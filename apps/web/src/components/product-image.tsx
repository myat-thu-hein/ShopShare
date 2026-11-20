'use client';

import { useState } from 'react';
import { cn, imageUrl } from '@/lib/utils';

/**
 * Product photo on a white "studio" tile. Falls back to a neutral placeholder if the image
 * host is unreachable, so a broken CDN never leaves a broken-image icon in the grid.
 */
export function ProductImage({
  src,
  alt,
  size = 400,
  className,
  imgClassName,
  priority,
}: {
  src: string | null | undefined;
  alt: string;
  size?: 400 | 800 | 1200;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn('relative overflow-hidden bg-white', className)}>
      <img
        src={failed ? '/placeholder.svg' : imageUrl(src, size)}
        alt={alt}
        width={size}
        height={size}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailed(true)}
        className={cn('aspect-square size-full object-contain p-3', imgClassName)}
      />
    </div>
  );
}
