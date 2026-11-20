'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { registerSchema } from '@shopsense/shared';
import { errorMessage } from '@/lib/api';
import { homeFor, useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function RegisterForm() {
  const params = useSearchParams();
  const { register } = useSession();
  const [role, setRole] = useState<'BUYER' | 'SELLER'>(params.get('role') === 'seller' ? 'SELLER' : 'BUYER');
  const [form, setForm] = useState({ name: '', email: '', password: '', storeName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Same Zod schema the API uses, so errors show instantly.
    const parsed = registerSchema.safeParse({
      ...form,
      role,
      storeName: role === 'SELLER' ? form.storeName : undefined,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const u = await register(parsed.data);
      toast.success(
        role === 'SELLER' ? 'Store created — an admin will approve it shortly.' : 'Welcome to ShopShare!',
      );
      window.location.assign(homeFor(u.role));
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl sm:text-4xl">Create an account</h1>
      <p className="mt-2 text-muted-fg">
        Already have one?{' '}
        <Link href="/login" className="text-teal hover:underline">
          Log in
        </Link>
      </p>
      <div
        className="mt-8 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1"
        role="radiogroup"
        aria-label="Account type"
      >
        {(['BUYER', 'SELLER'] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={role === r}
            onClick={() => setRole(r)}
            className={cn(
              'rounded-xl py-2.5 text-sm font-medium',
              role === r ? 'bg-surface shadow-sm' : 'text-muted-fg',
            )}
          >
            {r === 'BUYER' ? 'I want to shop' : 'I want to sell'}
          </button>
        ))}
      </div>
      <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
        <Field label="Your name" htmlFor="name" error={errors.name}>
          <Input
            id="name"
            autoComplete="name"
            value={form.name}
            onChange={set('name')}
            aria-invalid={!!errors.name}
          />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={set('email')}
            aria-invalid={!!errors.email}
          />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            aria-invalid={!!errors.password}
          />
        </Field>
        {role === 'SELLER' ? (
          <Field
            label="Store name"
            htmlFor="storeName"
            error={errors.storeName}
            hint="Shown on your store page. An admin approves new stores."
          >
            <Input
              id="storeName"
              value={form.storeName}
              onChange={set('storeName')}
              aria-invalid={!!errors.storeName}
            />
          </Field>
        ) : null}
        {errors.form ? (
          <p role="alert" className="rounded-xl bg-chilli/10 px-3 py-2 text-sm text-chilli">
            {errors.form}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Creating account…' : role === 'SELLER' ? 'Create store' : 'Create account'}
        </Button>
      </form>
    </div>
  );
}
