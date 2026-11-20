'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import type { AuthUser } from '@shopsense/shared';
import { api, refreshSession } from '@/lib/api';
import { useAuth } from '@/stores/auth';

function AuthBootstrap() {
  const setUser = useAuth((s) => s.setUser);
  useEffect(() => {
    // Ask who is logged in; if the access cookie expired but a refresh cookie exists, refresh once.
    (async () => {
      try {
        let s = await api<{ user: AuthUser | null; canRefresh: boolean }>('/auth/session');
        if (!s.user && s.canRefresh && (await refreshSession())) s = await api('/auth/session');
        setUser(s.user);
      } catch {
        setUser(null);
      }
    })();
  }, [setUser]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, err: any) => err?.status >= 500 && count < 2,
          },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <AuthBootstrap />
        {children}
        <Toaster position="bottom-left" richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
