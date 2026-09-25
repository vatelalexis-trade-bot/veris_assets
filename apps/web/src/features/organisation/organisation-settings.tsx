'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { LocaleSelect, TimezoneSelect } from '@/features/tenants/tenant-fields';
import { api } from '@/lib/api/client';
import type { operations } from '@/lib/api/schema';

/** Settings of the signed-in administrator's organisation (tenant-settings:manage). */
export function OrganisationSettings() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/settings');
      if (error) throw error;
      return data;
    },
  });
  const save = useMutation({
    mutationFn: async (form: SettingsForm) => {
      const { data, error } = await api.PATCH('/api/v1/settings', {
        headers: { 'If-Match': `"${settings.data!.version}"` },
        body: { ...form, tradeName: form.tradeName || null },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (updated) => queryClient.setQueryData(['settings'], updated),
  });

  if (settings.isError) return <ApiError error={settings.error} />;
  if (!settings.data) return <Skeleton className="h-32 w-full" />;
  // A new version read from the API recreates the form with its values (no copy in an effect).
  return <SettingsFormFields key={settings.data.version} settings={settings.data} save={save} />;
}

type Settings =
  operations['SettingsController_get']['responses'][200]['content']['application/json'];
interface SettingsForm {
  tradeName: string;
  defaultLocale: 'en-GB' | 'fr-FR';
  timezone: string;
}

function SettingsFormFields({
  settings,
  save,
}: {
  settings: Settings;
  save: UseMutationResult<Settings, unknown, SettingsForm>;
}) {
  const t = useTranslations();
  const [form, setForm] = useState<SettingsForm>({
    tradeName: settings.tradeName ?? '',
    defaultLocale: settings.defaultLocale,
    timezone: settings.timezone,
  });
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        save.mutate(form);
      }}
      className="grid max-w-2xl gap-4 rounded-xl border border-border bg-surface p-5 md:grid-cols-2"
      noValidate
    >
      <h2 className="font-heading font-semibold md:col-span-2">{t('settings.organisation')}</h2>
      <p className="text-sm text-muted md:col-span-2">
        {t('settings.legalName', { name: settings.legalName })}
      </p>
      <FormField label={t('tenants.form.tradeName')}>
        <Input
          value={form.tradeName}
          onChange={(event) => setForm({ ...form, tradeName: event.target.value })}
        />
      </FormField>
      <FormField label={t('tenants.form.defaultLocale')}>
        <LocaleSelect
          value={form.defaultLocale}
          onChange={(event) =>
            setForm({ ...form, defaultLocale: event.target.value as 'en-GB' | 'fr-FR' })
          }
        />
      </FormField>
      <FormField label={t('tenants.form.timezone')}>
        <TimezoneSelect
          value={form.timezone}
          onChange={(event) => setForm({ ...form, timezone: event.target.value })}
        />
      </FormField>
      <div className="flex flex-col gap-2 md:col-span-2">
        {save.isError ? <ApiError error={save.error} /> : null}
        {save.isSuccess ? (
          <p role="status" className="text-sm text-success">
            {t('common.saved')}
          </p>
        ) : null}
        <Button type="submit" className="self-start" disabled={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
