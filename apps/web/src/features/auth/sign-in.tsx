'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import type { operations } from '@/lib/api/schema';
import { ApiError } from '@/components/app/api-error';
import { useAfterSignIn } from './use-after-sign-in';

export type DemoAccounts =
  operations['AuthController_demoAccountsList']['responses'][200]['content']['application/json'];

/** Sign-in form, with the demonstration accounts beside it in demo mode (D-016, SPEC §28). */
export function SignIn({ demo, next }: { demo: DemoAccounts | null; next: string | null }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const afterSignIn = useAfterSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const signIn = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/auth/sign-in', { body: { email, password } });
      if (error) throw error;
      return data;
    },
    onSuccess: async (result) => {
      if (result.status === 'MFA_REQUIRED') {
        router.push(next ? { pathname: '/login/mfa', query: { next } } : '/login/mfa');
      } else {
        await afterSignIn(next);
      }
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    signIn.mutate();
  }

  return (
    <div className="flex flex-col gap-8 md:flex-row md:items-start">
      <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-4" noValidate>
        <FormField label={t('signIn.email')}>
          <Input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
        <FormField label={t('signIn.password')}>
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
        {signIn.isError ? <ApiError error={signIn.error} /> : null}
        <Button type="submit" disabled={signIn.isPending || !email || !password}>
          {t('signIn.submit')}
        </Button>
        <Link href="/forgot-password" className="text-sm text-primary-text hover:underline">
          {t('signIn.forgotPassword')}
        </Link>
      </form>
      {demo ? (
        <DemoAccountsPanel
          initial={demo}
          onPick={(account) => {
            setEmail(account);
            setPassword(demo.password);
          }}
        />
      ) : null}
    </div>
  );
}

function DemoAccountsPanel({
  initial,
  onPick,
}: {
  initial: DemoAccounts;
  onPick: (email: string) => void;
}) {
  const t = useTranslations('auth');
  // The current authenticator codes change every 30 seconds.
  const { data } = useQuery({
    queryKey: ['demo-accounts'],
    queryFn: async () => (await api.GET('/api/v1/auth/demo-accounts')).data ?? initial,
    initialData: initial,
    refetchInterval: 10_000,
  });
  return (
    <aside
      aria-labelledby="demo-accounts-title"
      className="flex w-full flex-col gap-3 rounded-xl border border-warning/30 bg-surface p-5 text-sm"
    >
      <h2 id="demo-accounts-title" className="font-semibold text-warning">
        {t('demo.title')}
      </h2>
      <p className="text-muted">{t('demo.description')}</p>
      <p className="font-mono text-foreground">{t('demo.password', { password: data.password })}</p>
      <p className="text-xs text-muted">{t('demo.codeRenewal')}</p>
      <ul className="flex flex-col divide-y divide-border">
        {data.accounts.map((account) => (
          <li
            key={account.email}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <div className="min-w-0">
              <p className="font-medium text-foreground">{account.name}</p>
              <p className="text-xs text-muted">
                {t(`roles.${account.role}`)} ·{' '}
                {account.tenant ? account.tenant : t('demo.platform')} · {account.email}
              </p>
              {account.totpCode ? (
                <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-accent">
                  <KeyRound aria-hidden="true" className="size-3" />
                  {t('demo.code', { code: account.totpCode })}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-label={t('demo.useAccount', { name: account.name })}
              onClick={() => onPick(account.email)}
            >
              {t('demo.use')}
            </Button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
