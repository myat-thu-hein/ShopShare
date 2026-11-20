'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function DashboardShell({
  title,
  nav,
  children,
}: {
  title: string;
  nav: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
      <aside>
        <p className="mb-3 font-display text-lg font-semibold">{title}</p>
        <nav className="flex gap-1 overflow-x-auto scrollbar-none lg:flex-col" aria-label={title}>
          {nav.map((n) => {
            const active = n.href === pathname || (n.href !== nav[0].href && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'shrink-0 rounded-xl px-3 py-2 text-sm hover:bg-muted',
                  active && 'bg-ink text-paper hover:bg-ink',
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
