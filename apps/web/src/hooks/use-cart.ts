'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CartDto, CartItemDto } from '@shopsense/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { useGuestCart, type GuestCartItem } from '@/stores/guest-cart';

export type AddInput = Omit<GuestCartItem, 'quantity'> & { quantity?: number };

/**
 * One cart API for the whole app:
 * - logged-in buyers use the server cart (persistent across devices, stock-checked)
 * - guests use a localStorage cart that merges on login
 */
export function useCart() {
  const { status, user } = useAuth();
  const serverMode = status === 'authenticated' && user?.role === 'BUYER';
  const guest = useGuestCart();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['cart'],
    queryFn: () => api<CartDto>('/cart'),
    enabled: serverMode,
  });

  const setCart = (cart: CartDto) => qc.setQueryData(['cart'], cart);

  const addMutation = useMutation({
    mutationFn: (i: AddInput) =>
      api<CartDto>('/cart/items', {
        method: 'POST',
        body: { productId: i.productId, variantId: i.variantId, quantity: i.quantity ?? 1 },
      }),
    onSuccess: setCart,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      api<CartDto>(`/cart/items/${id}`, { method: 'PATCH', body: { quantity } }),
    onSuccess: setCart,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const guestItems: CartItemDto[] = guest.items.map((i) => ({
    id: `${i.productId}:${i.variantId ?? ''}`,
    productId: i.productId,
    variantId: i.variantId,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    title: i.title,
    slug: i.slug,
    imageUrl: i.imageUrl,
    variantLabel: i.variantLabel,
    available: i.available,
  }));

  const items = serverMode ? (query.data?.items ?? []) : guestItems;
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  async function add(input: AddInput) {
    if (user && user.role !== 'BUYER') {
      toast.error('Switch to a buyer account to shop.');
      return false;
    }
    try {
      if (serverMode) await addMutation.mutateAsync(input);
      else {
        const already =
          guest.items.find((i) => i.productId === input.productId && i.variantId === input.variantId)
            ?.quantity ?? 0;
        if (already + (input.quantity ?? 1) > input.available)
          throw new Error(`Only ${input.available} left in stock`);
        guest.add({ ...input, quantity: input.quantity ?? 1 });
      }
      toast.success('Added to cart', {
        description: input.title,
        action: { label: 'View cart', onClick: () => (window.location.href = '/cart') },
      });
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  }

  function setQuantity(item: CartItemDto, quantity: number) {
    if (serverMode) updateMutation.mutate({ id: item.id, quantity });
    else guest.setQuantity(item.productId, item.variantId, quantity);
  }

  return {
    items,
    subtotal,
    itemCount,
    isLoading: serverMode && query.isLoading,
    serverMode,
    add,
    setQuantity,
    remove: (item: CartItemDto) => setQuantity(item, 0),
    adding: addMutation.isPending,
  };
}
