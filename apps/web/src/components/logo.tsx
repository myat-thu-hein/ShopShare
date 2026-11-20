import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The bag mark: a marigold shopping bag with a white letter inside.
 * In the wordmark it stands in for the "o" of "Shop"; on its own (favicon) it holds an "S".
 */
export function BagMark({ letter = 'o', className }: { letter?: string; className?: string }) {
  return (
    <svg viewBox="4 0 32 48" className={className} aria-hidden="true">
      {/* handle */}
      <path
        d="M13 17V12a7 7 0 0 1 14 0v5"
        fill="none"
        stroke="var(--marigold)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* bag body */}
      <path d="M5 16.5h30l-1.9 25.2A4 4 0 0 1 29.1 45.5H10.9a4 4 0 0 1-4-3.8z" fill="var(--marigold)" />
      <text
        x="20"
        y={letter === 'o' ? 41 : 40}
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="var(--font-display)"
        fontWeight="800"
        fontSize={letter === 'o' ? 30 : 24}
      >
        {letter}
      </text>
    </svg>
  );
}

/** "Sh[bag]pShare" — bold dark wordmark with the shopping bag replacing the first "o". */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <Link href="/" className={cn('flex items-center leading-none', className)} aria-label="ShopShare home">
      <span
        aria-hidden
        className={cn(
          'flex items-baseline font-display font-extrabold tracking-[-0.04em] text-ink',
          size === 'lg' ? 'text-4xl' : 'text-[1.6rem]',
        )}
      >
        <span>Sh</span>
        <BagMark className="mx-[0.05em] h-[1.45em] w-auto self-baseline" />
        <span>pShare</span>
      </span>
    </Link>
  );
}
