'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { AuthUser, Role } from '@shopsense/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { useGuestCart } from '@/stores/guest-cart';

type AuthResponse = { user: AuthUser };

/** Login, logout and demo login. After login, the guest cart is merged into the account. */
export function useSession() {
  const { user, status, setUser } = useAuth();
  const qc = useQueryClient();

  const afterLogin = useCallback(
    async (u: AuthUser) => {
      setUser(u);
      const guest = useGuestCart.getState().items;
      if (guest.length && u.role === 'BUYER') {
        try {
          await api('/cart/merge', {
            method: 'POST',
            body: {
              items: guest.map((i) => ({
                productId: i.productId,
                variantId: i.variantId,
                quantity: i.quantity,
              })),
            },
          });
          useGuestCart.getState().clear();
        } catch {
          /* keep guest cart if merge fails */
        }
      }
      await qc.invalidateQueries();
    },
    [qc, setUser],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { user: u } = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      await afterLogin(u);
      return u;
    },
    [afterLogin],
  );

  const demoLogin = useCallback(
    async (role: Role) => {
      const { user: u } = await api<AuthResponse>('/auth/demo', { method: 'POST', body: { role } });
      await afterLogin(u);
      return u;
    },
    [afterLogin],
  );

  const register = useCallback(
    async (body: {
      name: string;
      email: string;
      password: string;
      role: 'BUYER' | 'SELLER';
      storeName?: string;
    }) => {
      const { user: u } = await api<AuthResponse>('/auth/register', { method: 'POST', body });
      await afterLogin(u);
      return u;
    },
    [afterLogin],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    qc.clear();
    window.location.assign('/');
  }, [qc, setUser]);

  return { user, status, login, demoLogin, register, logout, setUser };
}

export function homeFor(role: Role) {
  return role === 'ADMIN' ? '/admin' : role === 'SELLER' ? '/seller' : '/';
}
