'use client';

import { useEffect } from 'react';
import { useAuth } from '@/stores/auth';
import { api } from '@/lib/api';

/** Records a view once auth is known, so "Recommended for you" can learn from it. */
export function ViewTracker({ productId }: { productId: string }) {
  const status = useAuth((s) => s.status);
  useEffect(() => {
    if (status === 'loading') return;
    api(`/products/${productId}/view`, { method: 'POST' }).catch(() => undefined);
  }, [productId, status]);
  return null;
}
