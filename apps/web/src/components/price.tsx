import { discountPercent } from '@shopsense/shared';
import { cn, formatTHB } from '@/lib/utils';

/** Selling price, with the original price crossed out when the item is on sale. */
export function Price({
  price,
  compareAtPrice,
  size = 'md',
  className,
}: {
  price: number;
  compareAtPrice?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const off = discountPercent(price, compareAtPrice);
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      <span
        className={cn(
          'price',
          off ? 'text-chilli' : '',
          size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-lg' : 'text-sm',
        )}
      >
        {formatTHB(price)}
      </span>
      {off ? (
        <>
          <s className={cn('text-muted-fg', size === 'lg' ? 'text-lg' : 'text-xs')}>
            <span className="sr-only">Original price </span>
            {formatTHB(compareAtPrice!)}
          </s>
          {size === 'lg' ? (
            <span className="rounded-md bg-chilli/12 px-2 py-0.5 text-sm font-semibold text-chilli">
              -{off}%
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  );
}

export function DiscountBadge({
  price,
  compareAtPrice,
  className,
}: {
  price: number;
  compareAtPrice?: number | null;
  className?: string;
}) {
  const off = discountPercent(price, compareAtPrice);
  if (!off) return null;
  return (
    <span className={cn('rounded-md bg-chilli px-1.5 py-0.5 text-xs font-bold text-white', className)}>
      -{off}%
    </span>
  );
}
