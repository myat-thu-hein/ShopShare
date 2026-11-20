import type { OrderStatus } from '@shopsense/shared';
import { Badge } from './ui/misc';

const MAP: Record<
  OrderStatus,
  { label: string; tone: 'default' | 'accent' | 'teal' | 'danger' | 'outline' }
> = {
  PENDING: { label: 'Awaiting payment', tone: 'accent' },
  PAID: { label: 'Paid', tone: 'teal' },
  SHIPPED: { label: 'Shipped', tone: 'default' },
  DELIVERED: { label: 'Delivered', tone: 'outline' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = MAP[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const STEPS: OrderStatus[] = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED'];
