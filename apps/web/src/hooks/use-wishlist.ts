'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/stores/auth';

export function useWishlist() {
  const { status } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const ids = useQuery({
    queryKey: ['wishlist', 'ids'],
    queryFn: () => api<string[]>('/wishlist/ids'),
    enabled: status === 'authenticated',
  });

  const toggle = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) =>
      api(`/wishlist/${id}`, { method: on ? 'POST' : 'DELETE' }),
    onMutate: async ({ id, on }) => {
      qc.setQueryData<string[]>(['wishlist', 'ids'], (old = []) =>
        on ? [...old, id] : old.filter((x) => x !== id),
      );
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      qc.invalidateQueries({ queryKey: ['wishlist'] });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['wishlist', 'list'] }),
  });

  return {
    has: (id: string) => ids.data?.includes(id) ?? false,
    toggle: (id: string) => {
      if (status !== 'authenticated') {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const on = !(ids.data?.includes(id) ?? false);
      toggle.mutate({ id, on });
      toast.success(on ? 'Saved to wishlist' : 'Removed from wishlist');
    },
  };
}
