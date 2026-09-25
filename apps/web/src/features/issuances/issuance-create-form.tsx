'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';

/** A new draft: a name and a short code, then the wizard takes over (SPEC §6.2). */
export function IssuanceCreateForm() {
  const t = useTranslations('issuances');
  const router = useRouter();
  const idempotency = useIdempotencyKey();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/issuances', {
        params: { header: idempotency.header() },
        body: { name: name.trim(), code: code.trim().toUpperCase() },
      });
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: (created) => router.push(`/issuer/issuances/${created.id}/edit`),
  });
  const codeValid = /^[A-Za-z0-9-]{2,20}$/.test(code.trim());
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        create.mutate();
      }}
      className="flex max-w-xl flex-col gap-4 rounded-xl border border-border bg-surface p-5"
      noValidate
    >
      <FormField label={t('fields.name')}>
        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
      </FormField>
      <FormField
        label={t('fields.code')}
        hint={t('fields.codeHint')}
        error={code && !codeValid ? t('fields.codeInvalid') : undefined}
      >
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={20}
        />
      </FormField>
      {create.isError ? <ApiError error={create.error} /> : null}
      <Button
        type="submit"
        className="self-start"
        disabled={!name.trim() || !codeValid || create.isPending}
      >
        {t('createDraft')}
      </Button>
    </form>
  );
}
