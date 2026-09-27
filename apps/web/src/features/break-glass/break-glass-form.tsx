'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';

/**
 * Opens an emergency access (SPEC §4.1, D-103): one active organisation, a reason of at least
 * 10 characters; the Platform Administrator then lands in the issuer portal, read-only.
 */
export function BreakGlassForm() {
  const t = useTranslations('breakGlass');
  const router = useRouter();
  const [tenantId, setTenantId] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const send = useIdempotencyKey();
  const tenants = useQuery({
    queryKey: ['tenants', 'break-glass'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/tenants', {
        params: { query: { pageSize: 100 } },
      });
      if (error) throw error;
      return data.data.filter((tenant) => tenant.status === 'ACTIVE');
    },
  });
  const start = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/tenants/{id}/break-glass', {
        params: { path: { id: tenantId }, header: send.header() },
        body: { reason: reason.trim() },
      });
      send.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      router.replace('/issuer/dashboard');
      router.refresh();
    },
  });
  const errors = {
    tenant: tenantId ? undefined : t('errors.tenant'),
    reason: reason.trim().length >= 10 ? undefined : t('errors.reason'),
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!errors.tenant && !errors.reason) start.mutate();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-2xl flex-col gap-5">
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
        <li>{t('rules.readOnly')}</li>
        <li>{t('rules.duration')}</li>
        <li>{t('rules.traced')}</li>
        <li>{t('rules.notified')}</li>
      </ul>
      {tenants.isError ? <ApiError error={tenants.error} /> : null}
      <FormField label={t('tenant')} error={submitted ? errors.tenant : undefined}>
        <Select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
          <option value="">{t('chooseTenant')}</option>
          {(tenants.data ?? []).map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.legalName}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField
        label={t('reason')}
        hint={t('reasonHint')}
        error={submitted ? errors.reason : undefined}
      >
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={500}
        />
      </FormField>
      {start.isError ? <ApiError error={start.error} /> : null}
      <div>
        <Button type="submit" variant="destructive" disabled={start.isPending}>
          <KeyRound aria-hidden="true" />
          {t('start')}
        </Button>
      </div>
    </form>
  );
}
