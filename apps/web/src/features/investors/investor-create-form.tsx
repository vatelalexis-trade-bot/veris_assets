'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { bodyOf, EMPTY_INVESTOR, InvestorFields } from './investor-form';

/** New investor profile (SPEC §8.1); its KYC/KYB case is opened from its page. */
export function InvestorCreateForm() {
  const t = useTranslations('investors');
  const router = useRouter();
  const idempotency = useIdempotencyKey();
  const [values, setValues] = useState(EMPTY_INVESTOR);
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/investors', {
        params: { header: idempotency.header() },
        body: bodyOf(values),
      });
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: (created) => router.push(`/issuer/investors/${created.id}`),
  });
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        create.mutate();
      }}
      className="flex max-w-3xl flex-col gap-4 rounded-xl border border-border bg-surface p-5"
      noValidate
    >
      <InvestorFields values={values} onChange={setValues} />
      {create.isError ? <ApiError error={create.error} /> : null}
      <Button
        type="submit"
        className="self-start"
        disabled={create.isPending || !values.legalName.trim() || !values.countryOfIncorporation}
      >
        {t('form.create')}
      </Button>
    </form>
  );
}
