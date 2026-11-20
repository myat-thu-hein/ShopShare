'use client';

import { useState } from 'react';
import type { ProductImageDto } from '@shopsense/shared';
import { cn } from '@/lib/utils';
import { ProductImage } from '@/components/product-image';

export function Gallery({ images, title }: { images: ProductImageDto[]; title: string }) {
  const [active, setActive] = useState(0);
  const current = images[active];
  return (
    <div className="lg:sticky lg:top-32 lg:self-start">
      <ProductImage
        src={current?.url}
        alt={current?.alt ?? title}
        size={1200}
        priority
        className="rounded-3xl border border-line"
        imgClassName="p-6"
      />
      {images.length > 1 ? (
        <div
          className="mt-3 flex gap-3 overflow-x-auto scrollbar-none"
          role="tablist"
          aria-label="Product photos"
        >
          {images.map((img, i) => (
            <button
              key={img.id}
              role="tab"
              aria-selected={i === active}
              aria-label={`Show photo ${i + 1}`}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'size-20 shrink-0 overflow-hidden rounded-xl border-2',
                i === active ? 'border-marigold' : 'border-line opacity-80 hover:opacity-100',
              )}
            >
              <ProductImage src={img.url} alt="" imgClassName="p-1.5" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
