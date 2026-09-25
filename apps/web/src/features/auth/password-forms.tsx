'use client';

import { useMutation } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { ApiError } from '@/components/app/api-error';
import { useAfterSignIn } from './use-after-sign-in';

function Success({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg border border-success/40 p-3 text-sm text-foreground"
    >
      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
      {message}
    </p>
  );
}

/** Two password fields that must match, with the password hint (SPEC §24). */
function NewPasswordFields({
  password,
  confirmation,
  onPassword,
  onConfirmation,
}: {
  password: string;
  confirmation: string;
  onPassword: (value: string) => void;
  onConfirmation: (value: string) => void;
}) {
  const t = useTranslations('auth');
  const mismatch = confirmation.length > 0 && confirmation !== password;
  return (
    <>
      <FormField label={t('reset.newPassword')} hint={t('passwordHint')}>
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => onPassword(event.target.value)}
        />
      </FormField>
      <FormField
        label={t('reset.confirmPassword')}
        error={mismatch ? t('reset.mismatch') : undefined}
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => onConfirmation(event.target.value)}
        />
      </FormField>
    </>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const request = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/auth/password/forgot', { body: { email } });
      if (error) throw error;
    },
  });
  if (request.isSuccess) return <Success message={t('forgot.sent')} />;
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        request.mutate();
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <p className="text-sm text-muted">{t('forgot.description')}</p>
      <FormField label={t('signIn.email')}>
        <Input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </FormField>
      {request.isError ? <ApiError error={request.error} /> : null}
      <Button type="submit" disabled={request.isPending || !email}>
        {t('forgot.submit')}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/auth/password/reset', {
        body: { token, newPassword: password },
      });
      if (error) throw error;
    },
  });
  if (reset.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <Success message={t('reset.done')} />
        <Button asChild>
          <Link href="/login">{t('signIn.submit')}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        reset.mutate();
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <NewPasswordFields
        password={password}
        confirmation={confirmation}
        onPassword={setPassword}
        onConfirmation={setConfirmation}
      />
      {reset.isError ? <ApiError error={reset.error} /> : null}
      <Button type="submit" disabled={reset.isPending || !password || password !== confirmation}>
        {t('reset.submit')}
      </Button>
    </form>
  );
}

export function AcceptInvitationForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const afterSignIn = useAfterSignIn();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/auth/invitations/{token}/accept', {
        params: { path: { token } },
        body: { password },
      });
      if (error) throw error;
    },
    onSuccess: () => afterSignIn(null),
  });
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        accept.mutate();
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <NewPasswordFields
        password={password}
        confirmation={confirmation}
        onPassword={setPassword}
        onConfirmation={setConfirmation}
      />
      {accept.isError ? <ApiError error={accept.error} /> : null}
      <Button type="submit" disabled={accept.isPending || !password || password !== confirmation}>
        {t('invitation.submit')}
      </Button>
    </form>
  );
}
