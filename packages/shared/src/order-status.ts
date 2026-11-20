import type { OrderStatus } from './enums';

/**
 * The order lifecycle. Anything not listed here is an illegal move.
 *   PENDING -> PAID -> SHIPPED -> DELIVERED
 *   PENDING|PAID -> CANCELLED
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Moves a seller may make from their dashboard (payment moves come from Stripe). */
export const SELLER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canSellerTransition(from: OrderStatus, to: OrderStatus): boolean {
  return SELLER_TRANSITIONS[from]?.includes(to) ?? false;
}
