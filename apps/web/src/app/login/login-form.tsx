'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ShieldCheck, ShoppingBag, Store } from 'lucide-react';
import { toast } from 'sonner';
import type { Role } from '@shopsense/shared';
import { api, errorMessage } from '@/lib/api';
import { homeFor, useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';

const DEMOS: { role: Role; label: string; body: string; icon: React.ReactNode }[] = [
  { role: 'BUYER', label: 'Demo buyer', body: 'Shop, check out, review', icon: <ShoppingBag /> },
  { role: 'SELLER', label: 'Demo seller', body: 'Products, orders, stats', icon: <Store /> },
  { role: 'ADMIN', label: 'Demo admin', body: 'Users, approvals, platform', icon: <ShieldCheck /> },
];

const ERRORS: Record<string, string> = {
  invalid_state: 'Google sign-in expired. Please try again.',
  google_disabled: 'Google sign-in is not configured on this server.',
  email_not_verified: 'Your Google email is not verified.',
};

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next');
  const { login, demoLogin } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    params.get('error') ? (ERRORS[params.get('error')!] ?? 'Sign-in failed. Please try again.') : '',
  );
  const [busy, setBusy] = useState<string | null>(null);
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => api<{ google: boolean; demo: boolean }>('/auth/providers'),
  });

  const go = (role: Role) => {
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
    // Full navigation: drops any page the router prefetched while we were logged out
    // (a prefetched protected page is a cached redirect to /login).
    window.location.assign(safeNext ?? homeFor(role));
  };

  async function run(key: string, fn: () => Promise<{ role: Role; name: string }>) {
    setBusy(key);
    setError('');
    try {
      const u = await fn();
      toast.success(`Welcome, ${u.name.split(' ')[0]}`);
      go(u.role);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-2">
      <div>
        <h1 className="text-3xl sm:text-4xl">Log in</h1>
        <p className="mt-2 text-muted-fg">
          New here?{' '}
          <Link href="/register" className="text-teal hover:underline">
            Create an account
          </Link>
        </p>
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run('password', () => login(email, password));
          }}
        >
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error ? (
            <p role="alert" className="rounded-xl bg-chilli/10 px-3 py-2 text-sm text-chilli">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" size="lg" disabled={!!busy}>
            {busy === 'password' ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        {providers.data?.google ? (
          <Button asChild variant="outline" size="lg" className="mt-3 w-full">
            <a href="/api/auth/google">
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-8z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1-3.8 1-2.9 0-5.4-2-6.3-4.6H2v2.8A11 11 0 0 0 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.7 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.2H2a11 11 0 0 0 0 9.6L5.7 14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7.2L5.7 10c.9-2.7 3.4-4.6 6.3-4.6z"
                />
              </svg>
              Continue with Google
            </a>
          </Button>
        ) : null}
      </div>

      {providers.data?.demo !== false ? (
        <section
          aria-labelledby="demo-title"
          className="rounded-3xl border border-line bg-surface p-6 sm:p-8"
        >
          <h2 id="demo-title" className="text-xl">
            Explore with a demo account
          </h2>
          <p className="mt-1 text-sm text-muted-fg">
            One click, no sign-up. Each account comes with realistic orders and data.
          </p>
          <div className="mt-6 space-y-3">
            {DEMOS.map((d) => (
              <button
                key={d.role}
                type="button"
                disabled={!!busy}
                onClick={() => run(d.role, () => demoLogin(d.role))}
                className="flex w-full items-center gap-4 rounded-2xl border border-line p-4 text-left hover:border-ink/40 disabled:opacity-60 [&_svg]:size-5"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-marigold-soft text-ink">
                  {d.icon}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{busy === d.role ? 'Logging in…' : d.label}</span>
                  <span className="block text-sm text-muted-fg">{d.body}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-fg">
            Or log in manually: buyer@shopsense.dev, seller@shopsense.dev or admin@shopsense.dev with password
            Demo1234!
          </p>
        </section>
      ) : null}
    </div>
  );
}
