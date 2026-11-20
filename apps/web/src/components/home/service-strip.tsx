import { BadgeCheck, CreditCard, RotateCcw, Truck } from 'lucide-react';

const ITEMS = [
  { icon: Truck, title: 'Free shipping', body: 'On every order, 1–3 days in Bangkok' },
  { icon: CreditCard, title: 'Secure payment', body: 'Cards and PromptPay via Stripe' },
  { icon: RotateCcw, title: '7-day returns', body: 'Changed your mind? Send it back' },
  { icon: BadgeCheck, title: 'Verified sellers', body: 'Every store is approved by us' },
];

export function ServiceStrip() {
  return (
    <ul className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Why shop with us">
      {ITEMS.map(({ icon: Icon, title, body }) => (
        <li
          key={title}
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
        >
          <Icon className="size-6 shrink-0 text-teal" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{title}</span>
            <span className="block truncate text-xs text-muted-fg">{body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
