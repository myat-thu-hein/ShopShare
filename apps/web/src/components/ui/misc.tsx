import * as React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-pulse rounded-xl bg-muted', className)} {...props} />;
}

export function Badge({
  className,
  tone = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'default' | 'accent' | 'teal' | 'danger' | 'outline' }) {
  const tones = {
    default: 'bg-muted text-ink',
    accent: 'bg-marigold-soft text-ink',
    teal: 'bg-teal/12 text-teal',
    danger: 'bg-chilli/12 text-chilli',
    outline: 'border border-line',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-line bg-surface', className)} {...props} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line px-6 py-12 sm:items-center sm:text-center">
      {icon ? <div className="text-muted-fg [&_svg]:size-8">{icon}</div> : null}
      <h2 className="text-xl">{title}</h2>
      {body ? <p className="max-w-md text-sm text-muted-fg">{body}</p> : null}
      {action}
    </div>
  );
}

export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-muted-fg">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
