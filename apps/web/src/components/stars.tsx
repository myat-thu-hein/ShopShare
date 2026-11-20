import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Stars({
  value,
  count,
  size = 'sm',
  className,
}: {
  value: number;
  count?: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const s = size === 'sm' ? 'size-3.5' : 'size-5';
  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      aria-label={`${value.toFixed(1)} out of 5 stars${count != null ? `, ${count} reviews` : ''}`}
    >
      <span className="inline-flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(s, i <= Math.round(value) ? 'fill-marigold text-marigold' : 'text-line')}
          />
        ))}
      </span>
      {count != null ? <span className="text-xs text-muted-fg">({count})</span> : null}
    </span>
  );
}
