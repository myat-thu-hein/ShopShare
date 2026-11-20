'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface GuestCartItem {
  productId: string;
  variantId: string | null;
  quantity: number;
  title: string;
  slug: string;
  unitPrice: number;
  imageUrl: string | null;
  variantLabel: string | null;
  available: number;
}

interface GuestCartState {
  items: GuestCartItem[];
  add: (item: GuestCartItem) => void;
  setQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  clear: () => void;
}

const same = (
  a: { productId: string; variantId: string | null },
  b: { productId: string; variantId: string | null },
) => a.productId === b.productId && (a.variantId ?? null) === (b.variantId ?? null);

/**
 * Cart for shoppers who are not logged in, saved in localStorage.
 * It is merged into the server cart right after login.
 */
export const useGuestCart = create<GuestCartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((s) => {
          const existing = s.items.find((i) => same(i, item));
          if (existing) {
            return {
              items: s.items.map((i) =>
                same(i, item)
                  ? { ...i, quantity: Math.min(i.quantity + item.quantity, item.available, 99) }
                  : i,
              ),
            };
          }
          return { items: [...s.items, { ...item, quantity: Math.min(item.quantity, item.available) }] };
        }),
      setQuantity: (productId, variantId, quantity) =>
        set((s) => ({
          items:
            quantity <= 0
              ? s.items.filter((i) => !same(i, { productId, variantId }))
              : s.items.map((i) =>
                  same(i, { productId, variantId }) ? { ...i, quantity: Math.min(quantity, i.available) } : i,
                ),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: 'shopsense-guest-cart' },
  ),
);
