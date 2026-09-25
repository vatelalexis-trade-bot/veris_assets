'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toDataURL } from 'qrcode';
import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { ApiError } from '@/components/app/api-error';
import { useAfterSignIn } from './use-after-sign-in';

interface Enrollment {
  qrCode: string;
  secretKey: string;
  backupCodes: string[];
}

/** Set-up of two-factor authentication, mandatory for administration and compliance roles. */
export function MfaSetup() {
  const t = useTranslations('auth');
  const afterSignIn = useAfterSignIn();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  const start = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/auth/mfa/enroll', { body: { password } });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      setEnrollment({
        qrCode: await toDataURL(data.totpUri, { margin: 2, width: 200 }),
        secretKey: data.secretKey,
        backupCodes: data.backupCodes,
      });
      setPassword('');
    },
  });

  const confirm = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/auth/mfa/confirm', { body: { code } });
      if (error) throw error;
    },
    onSuccess: () => afterSignIn(null),
  });

  if (!enrollment) {
    return (
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          start.mutate();
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        <p className="text-sm text-muted">{t('mfaSetup.intro')}</p>
        <p className="text-sm text-foreground">{t('mfaSetup.passwordStep')}</p>
        <FormField label={t('signIn.password')}>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
        {start.isError ? <ApiError error={start.error} /> : null}
        <Button type="submit" disabled={start.isPending || !password}>
          {t('mfaSetup.continue')}
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        confirm.mutate();
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <p className="text-sm text-foreground">{t('mfaSetup.scan')}</p>
      {/* Generated QR code (data URL): not a remote image, so next/image brings nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={enrollment.qrCode}
        alt={t('mfaSetup.qrAlt')}
        width={200}
        height={200}
        className="self-center rounded-lg"
      />
      <p className="font-mono text-xs break-all text-muted">
        {t('mfaSetup.manualKey', { key: enrollment.secretKey })}
      </p>
      <div className="flex flex-col gap-2 rounded-lg border border-warning/30 p-3">
        <h2 className="text-sm font-semibold text-warning">{t('mfaSetup.backupCodes')}</h2>
        <p className="text-xs text-muted">{t('mfaSetup.backupCodesHelp')}</p>
        <ul className="grid grid-cols-2 gap-1 font-mono text-sm text-foreground">
          {enrollment.backupCodes.map((backupCode) => (
            <li key={backupCode}>{backupCode}</li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-foreground">{t('mfaSetup.confirmStep')}</p>
      <FormField label={t('mfa.code')}>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value.trim())}
        />
      </FormField>
      {confirm.isError ? <ApiError error={confirm.error} /> : null}
      <Button type="submit" disabled={confirm.isPending || code.length !== 6}>
        {t('mfaSetup.confirm')}
      </Button>
    </form>
  );
}
