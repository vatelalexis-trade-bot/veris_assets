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
import {
  CountrySelect,
  CurrencySelect,
  LocaleSelect,
  OrganizationTypeSelect,
  TimezoneSelect,
} from './tenant-fields';

type Locale = 'en-GB' | 'fr-FR';
type OrganizationType = 'ASSET_MANAGER' | 'ISSUER' | 'FUND';

/** New organisation and invitation of its first administrator (SPEC §6.1). */
export function TenantCreateForm() {
  const t = useTranslations('tenants.form');
  const router = useRouter();
  const [form, setForm] = useState({
    legalName: '',
    tradeName: '',
    countryCode: '',
    baseCurrency: 'EUR',
    defaultLocale: 'en-GB' as Locale,
    timezone: 'Europe/Paris',
    organizationType: 'ASSET_MANAGER' as OrganizationType,
    adminName: '',
    adminEmail: '',
    adminLocale: 'en-GB' as Locale,
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const idempotency = useIdempotencyKey();
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/tenants', {
        params: { header: idempotency.header() },
        body: {
          legalName: form.legalName,
          tradeName: form.tradeName || null,
          countryCode: form.countryCode,
          baseCurrency: form.baseCurrency,
          defaultLocale: form.defaultLocale,
          timezone: form.timezone,
          organizationType: form.organizationType,
          firstAdministrator: {
            name: form.adminName,
            email: form.adminEmail,
            locale: form.adminLocale,
          },
        },
      });
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: (created) =>
      router.push({
        pathname: `/platform/tenants/${created.id}`,
        query: { invited: form.adminEmail },
      }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  const complete = form.legalName && form.countryCode && form.adminName && form.adminEmail;
  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6" noValidate>
      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 font-heading font-semibold">{t('organisation')}</legend>
        <FormField label={t('legalName')}>
          <Input value={form.legalName} onChange={set('legalName')} required />
        </FormField>
        <FormField label={t('tradeName')}>
          <Input value={form.tradeName} onChange={set('tradeName')} />
        </FormField>
        <FormField label={t('country')}>
          <CountrySelect value={form.countryCode} onChange={set('countryCode')} required />
        </FormField>
        <FormField label={t('currency')}>
          <CurrencySelect value={form.baseCurrency} onChange={set('baseCurrency')} />
        </FormField>
        <FormField label={t('type')}>
          <OrganizationTypeSelect
            value={form.organizationType}
            onChange={set('organizationType')}
          />
        </FormField>
        <FormField label={t('defaultLocale')}>
          <LocaleSelect value={form.defaultLocale} onChange={set('defaultLocale')} />
        </FormField>
        <FormField label={t('timezone')}>
          <TimezoneSelect value={form.timezone} onChange={set('timezone')} />
        </FormField>
      </fieldset>
      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-1 font-heading font-semibold">{t('firstAdministrator')}</legend>
        <p className="text-sm text-muted md:col-span-2">{t('firstAdministratorHelp')}</p>
        <FormField label={t('adminName')}>
          <Input value={form.adminName} onChange={set('adminName')} required />
        </FormField>
        <FormField label={t('adminEmail')}>
          <Input type="email" value={form.adminEmail} onChange={set('adminEmail')} required />
        </FormField>
        <FormField label={t('adminLocale')}>
          <LocaleSelect value={form.adminLocale} onChange={set('adminLocale')} />
        </FormField>
      </fieldset>
      {create.isError ? <ApiError error={create.error} /> : null}
      <Button type="submit" className="self-start" disabled={create.isPending || !complete}>
        {t('create')}
      </Button>
    </form>
  );
}
