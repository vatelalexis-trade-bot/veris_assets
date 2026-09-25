'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { FormField } from '@/components/app/form-field';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AddressFields, type InvestorFormValues } from '@/features/investors/investor-form';
import type { InvestorView } from '@/features/investors/types';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';

interface ContactValues {
  tradeName: string;
  contactEmail: string;
  phone: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  addressCountry: string;
}

/** Profile of the signed-in investor (SPEC §4.5, §14): identity, KYC, recipient code, contact. */
export function OwnProfile() {
  const t = useTranslations('profile');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['me', 'investor'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/me/investor');
      if (error) throw error;
      return data;
    },
  });
  const regenerateKey = useIdempotencyKey();
  const regenerate = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/me/investor/recipient-code/regenerate', {
        params: { header: regenerateKey.header() },
      });
      regenerateKey.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: (updated) => queryClient.setQueryData(['me', 'investor'], updated),
  });
  const save = useMutation({
    mutationFn: async (values: ContactValues) => {
      const address =
        values.line1 && values.postalCode && values.city && values.addressCountry
          ? {
              line1: values.line1.trim(),
              line2: values.line2.trim() || null,
              postalCode: values.postalCode.trim(),
              city: values.city.trim(),
              countryCode: values.addressCountry,
            }
          : null;
      const { data, error } = await api.PATCH('/api/v1/me/investor', {
        headers: { 'If-Match': `"${profile.data!.version}"` },
        body: {
          tradeName: values.tradeName.trim() || null,
          contactEmail: values.contactEmail.trim() || null,
          phone: values.phone.trim() || null,
          address,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (updated) => queryClient.setQueryData(['me', 'investor'], updated),
  });

  if (profile.isError) return <ApiError error={profile.error} />;
  if (!profile.data) return <Skeleton className="h-40 w-full" />;
  const investor = profile.data;

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="identity-title"
        className="rounded-xl border border-border bg-surface p-5"
      >
        <h2 id="identity-title" className="mb-3 font-heading text-lg font-semibold">
          {investor.legalName}
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">{t('kycStatus')}</dt>
            <dd>
              <StatusBadge domain="kyc" status={investor.kycStatus} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('kycExpiry')}</dt>
            <dd>
              {investor.kycExpiryDate
                ? format.dateTime(new Date(`${investor.kycExpiryDate}T00:00:00`), {
                    dateStyle: 'long',
                  })
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('registrationNumber')}</dt>
            <dd>{investor.registrationNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('country')}</dt>
            <dd>{investor.countryOfIncorporation}</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="recipient-title"
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
      >
        <h2 id="recipient-title" className="font-heading text-lg font-semibold">
          {t('recipientCode.title')}
        </h2>
        <p className="text-sm text-muted">{t('recipientCode.help')}</p>
        <p className="font-mono text-2xl tracking-wider" aria-live="polite">
          {investor.recipientCode}
        </p>
        {regenerate.isError ? <ApiError error={regenerate.error} /> : null}
        <ConfirmDialog
          trigger={
            <Button variant="secondary" className="self-start">
              {t('recipientCode.regenerate')}
            </Button>
          }
          title={t('recipientCode.confirmTitle')}
          description={t('recipientCode.confirmDescription')}
          confirmLabel={t('recipientCode.regenerate')}
          onConfirm={() => regenerate.mutateAsync()}
        />
      </section>

      <ContactForm key={investor.version} investor={investor} save={save} />
    </div>
  );
}

function ContactForm({
  investor,
  save,
}: {
  investor: InvestorView;
  save: UseMutationResult<InvestorView, unknown, ContactValues>;
}) {
  const t = useTranslations('profile');
  const tForm = useTranslations('investors.form');
  const tCommon = useTranslations('common');
  const [values, setValues] = useState<ContactValues>({
    tradeName: investor.tradeName ?? '',
    contactEmail: investor.contactEmail ?? '',
    phone: investor.phone ?? '',
    line1: investor.address?.line1 ?? '',
    line2: investor.address?.line2 ?? '',
    postalCode: investor.address?.postalCode ?? '',
    city: investor.address?.city ?? '',
    addressCountry: investor.address?.countryCode ?? '',
  });
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        save.mutate(values);
      }}
      className="grid gap-4 rounded-xl border border-border bg-surface p-5 md:grid-cols-2"
      noValidate
    >
      <h2 className="font-heading text-lg font-semibold md:col-span-2">{t('contact')}</h2>
      <FormField label={tForm('tradeName')}>
        <Input
          value={values.tradeName}
          onChange={(event) => setValues({ ...values, tradeName: event.target.value })}
        />
      </FormField>
      <FormField label={tForm('contactEmail')}>
        <Input
          type="email"
          value={values.contactEmail}
          onChange={(event) => setValues({ ...values, contactEmail: event.target.value })}
        />
      </FormField>
      <FormField label={tForm('phone')}>
        <Input
          type="tel"
          value={values.phone}
          onChange={(event) => setValues({ ...values, phone: event.target.value })}
        />
      </FormField>
      <AddressFields
        values={values}
        onChange={(next: InvestorFormValues) =>
          setValues({
            ...values,
            line1: next.line1,
            line2: next.line2,
            postalCode: next.postalCode,
            city: next.city,
            addressCountry: next.addressCountry,
          })
        }
      />
      <div className="flex flex-col gap-2 md:col-span-2">
        {save.isError ? <ApiError error={save.error} /> : null}
        {save.isSuccess ? (
          <p role="status" className="text-sm text-success">
            {tCommon('saved')}
          </p>
        ) : null}
        <Button type="submit" className="self-start" disabled={save.isPending}>
          {tCommon('save')}
        </Button>
      </div>
    </form>
  );
}
