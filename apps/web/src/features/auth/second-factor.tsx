'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { api, errorCodeOf } from '@/lib/api/client';
import { ApiError } from '@/components/app/api-error';
import { useAfterSignIn } from './use-after-sign-in';

/** Second step of sign-in: authenticator code, or a single-use backup code. */
export function SecondFactor({ next }: { next: string | null }) {
  const t = useTranslations('auth.mfa');
  const afterSignIn = useAfterSignIn();
  const [method, setMethod] = useState<'totp' | 'backup'>('totp');
  const [code, setCode] = useState('');

  const verify = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/auth/mfa/verify', { body: { code, method } });
      if (error) throw error;
    },
    onSuccess: () => afterSignIn(next),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    verify.mutate();
  }

  const expired = verify.isError && errorCodeOf(verify.error) === 'SESSION_EXPIRED';
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted">
        {method === 'totp' ? t('description') : t('backupDescription')}
      </p>
      <FormField label={t('code')}>
        <Input
          inputMode={method === 'totp' ? 'numeric' : 'text'}
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value.trim())}
        />
      </FormField>
      {verify.isError ? <ApiError error={verify.error} /> : null}
      <Button type="submit" disabled={verify.isPending || code.length < 6}>
        {t('submit')}
      </Button>
      <Button
        type="button"
        variant="link"
        className="self-start px-0"
        onClick={() => {
          setMethod(method === 'totp' ? 'backup' : 'totp');
          setCode('');
        }}
      >
        {method === 'totp' ? t('useBackupCode') : t('useAuthenticator')}
      </Button>
      {expired ? (
        <Link href="/login" className="text-sm text-primary-text hover:underline">
          {t('backToSignIn')}
        </Link>
      ) : null}
    </form>
  );
}
