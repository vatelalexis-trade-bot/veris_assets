'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { FormField } from '@/components/app/form-field';
import { PageHeader } from '@/components/app/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { LocaleSelect, OrganizationTypeSelect, TimezoneSelect } from './tenant-fields';
import type { TenantView } from './types';

function Notice({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg border border-success/40 p-3 text-sm"
    >
      <CircleCheck aria-hidden="true" className="size-4 text-success" />
      {message}
    </p>
  );
}

/** One organisation: settings, activation, other administrators (Platform Administrator). */
export function TenantDetail({
  id,
  canManage,
  invited,
}: {
  id: string;
  canManage: boolean;
  invited?: string;
}) {
  const t = useTranslations('tenants');
  const queryClient = useQueryClient();
  const tenant = useQuery({
    queryKey: ['tenant', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/tenants/{id}', { params: { path: { id } } });
      if (error) throw error;
      return data;
    },
  });
  const refresh = (updated: TenantView) => {
    queryClient.setQueryData(['tenant', id], updated);
    void queryClient.invalidateQueries({ queryKey: ['tenants'] });
  };

  const statusKey = useIdempotencyKey();
  const setStatus = useMutation({
    mutationFn: async (action: 'activate' | 'deactivate') => {
      const path =
        action === 'activate' ? '/api/v1/tenants/{id}/activate' : '/api/v1/tenants/{id}/deactivate';
      const { data, error } = await api.POST(path, {
        params: { path: { id }, header: statusKey.header() },
      });
      statusKey.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: refresh,
  });

  const save = useMutation({
    mutationFn: async (form: TenantView) => {
      const { data, error } = await api.PATCH('/api/v1/tenants/{id}', {
        params: { path: { id } },
        // Optimistic locking: the version read is sent back (docs/API.md §1).
        headers: { 'If-Match': `"${tenant.data!.version}"` },
        body: {
          legalName: form.legalName,
          tradeName: form.tradeName || null,
          defaultLocale: form.defaultLocale,
          timezone: form.timezone,
          organizationType: form.organizationType,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: refresh,
  });

  if (tenant.isError) return <ApiError error={tenant.error} />;
  if (!tenant.data) return <Skeleton className="h-40 w-full" />;
  const current = tenant.data;
  const active = current.status === 'ACTIVE';

  return (
    <div className="flex flex-col gap-6">
      <Link href="/platform/tenants" className="text-sm text-primary-text hover:underline">
        ← {t('detail.back')}
      </Link>
      <PageHeader
        title={current.legalName}
        description={`${t(`status.${current.status}`)} · ${current.countryCode} · ${current.baseCurrency}`}
        actions={
          canManage ? (
            <ConfirmDialog
              trigger={
                <Button variant={active ? 'destructive' : 'primary'}>
                  {active ? t('detail.deactivate') : t('detail.activate')}
                </Button>
              }
              title={t(active ? 'detail.deactivateTitle' : 'detail.activateTitle', {
                name: current.legalName,
              })}
              description={t(
                active ? 'detail.deactivateDescription' : 'detail.activateDescription',
              )}
              confirmLabel={active ? t('detail.deactivate') : t('detail.activate')}
              destructive={active}
              onConfirm={() => setStatus.mutateAsync(active ? 'deactivate' : 'activate')}
            />
          ) : undefined
        }
      />
      {invited ? <Notice message={t('detail.invitationSent', { email: invited })} /> : null}
      {setStatus.isError ? <ApiError error={setStatus.error} /> : null}
      {canManage ? <TenantSettingsForm key={current.version} tenant={current} save={save} /> : null}
      {canManage && active ? <InviteAdministrator id={id} /> : null}
    </div>
  );
}

function TenantSettingsForm({
  tenant,
  save,
}: {
  tenant: TenantView;
  save: UseMutationResult<TenantView, unknown, TenantView>;
}) {
  const t = useTranslations('tenants.form');
  const tCommon = useTranslations('common');
  const [form, setForm] = useState(tenant);
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        save.mutate(form);
      }}
      className="grid max-w-2xl gap-4 rounded-xl border border-border bg-surface p-5 md:grid-cols-2"
      noValidate
    >
      <h2 className="font-heading font-semibold md:col-span-2">{t('organisation')}</h2>
      <FormField label={t('legalName')}>
        <Input
          value={form.legalName}
          onChange={(event) => setForm({ ...form, legalName: event.target.value })}
        />
      </FormField>
      <FormField label={t('tradeName')}>
        <Input
          value={form.tradeName ?? ''}
          onChange={(event) => setForm({ ...form, tradeName: event.target.value })}
        />
      </FormField>
      <FormField label={t('type')}>
        <OrganizationTypeSelect
          value={form.organizationType}
          onChange={(event) =>
            setForm({
              ...form,
              organizationType: event.target.value as TenantView['organizationType'],
            })
          }
        />
      </FormField>
      <FormField label={t('defaultLocale')}>
        <LocaleSelect
          value={form.defaultLocale}
          onChange={(event) =>
            setForm({ ...form, defaultLocale: event.target.value as TenantView['defaultLocale'] })
          }
        />
      </FormField>
      <FormField label={t('timezone')}>
        <TimezoneSelect
          value={form.timezone}
          onChange={(event) => setForm({ ...form, timezone: event.target.value })}
        />
      </FormField>
      <div className="flex flex-col gap-2 md:col-span-2">
        {save.isError ? <ApiError error={save.error} /> : null}
        {save.isSuccess ? <Notice message={tCommon('saved')} /> : null}
        <Button type="submit" className="self-start" disabled={save.isPending}>
          {tCommon('save')}
        </Button>
      </div>
    </form>
  );
}

function InviteAdministrator({ id }: { id: string }) {
  const t = useTranslations('tenants');
  const [person, setPerson] = useState({
    name: '',
    email: '',
    locale: 'en-GB' as 'en-GB' | 'fr-FR',
  });
  const idempotency = useIdempotencyKey();
  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/tenants/{id}/administrators', {
        params: { path: { id }, header: idempotency.header() },
        body: person,
      });
      idempotency.answered();
      if (error) throw error;
      return data;
    },
  });
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        invite.mutate();
      }}
      className="grid max-w-2xl gap-4 rounded-xl border border-border bg-surface p-5 md:grid-cols-2"
      noValidate
    >
      <h2 className="font-heading font-semibold md:col-span-2">
        {t('detail.inviteAdministrator')}
      </h2>
      <FormField label={t('form.adminName')}>
        <Input
          value={person.name}
          onChange={(event) => setPerson({ ...person, name: event.target.value })}
        />
      </FormField>
      <FormField label={t('form.adminEmail')}>
        <Input
          type="email"
          value={person.email}
          onChange={(event) => setPerson({ ...person, email: event.target.value })}
        />
      </FormField>
      <FormField label={t('form.adminLocale')}>
        <LocaleSelect
          value={person.locale}
          onChange={(event) =>
            setPerson({ ...person, locale: event.target.value as 'en-GB' | 'fr-FR' })
          }
        />
      </FormField>
      <div className="flex flex-col gap-2 md:col-span-2">
        {invite.isError ? <ApiError error={invite.error} /> : null}
        {invite.isSuccess ? (
          <Notice message={t('detail.invitationSent', { email: person.email })} />
        ) : null}
        <Button
          type="submit"
          className="self-start"
          disabled={invite.isPending || !person.name || !person.email}
        >
          {t('detail.invite')}
        </Button>
      </div>
    </form>
  );
}
