'use client';

import { create } from 'zustand';
import type { AuthUser } from '@shopsense/shared';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  user: AuthUser | null;
  status: Status;
  setUser: (user: AuthUser | null) => void;
}

/** Who is logged in. Tokens themselves live in httpOnly cookies, never in JS. */
export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'anonymous' }),
}));
