'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ErrorResponseBody } from '@veris/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EligibilityResult, type RuleOutcome } from '@/features/eligibility/eligibility-result';
import { api, errorCodeOf } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import type { IssuanceView } from './types';

/** The failed rules of an ELIGIBILITY_FAILED error, for the EligibilityResult component. */
export function failedRulesOf(error: unknown): RuleOutcome[] {
  const details = (error as Partial<ErrorResponseBody> | undefined)?.error?.details ?? [];
  return details.map((detail) => {
    // The identifier of the recorded decision is not a value to show.
    const values = Object.fromEntries(
      Object.entries(detail.meta ?? {}).filter(([key]) => key !== 'assessmentId'),
    ) as Record<string, string | number | null>;
    return { code: detail.code, passed: false, detail: values };
  });
}

/** Whitelist of the issuance (SPEC §8.4): each invitation follows an eligibility check. */
export function InvitationsTab({ issuance }: { issuance: IssuanceView }) {
  const t = useTranslations('issuances.invitations');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const id = issuance.id;
  const open = issuance.status === 'APPROVED' || issuance.status === 'SUBSCRIPTION_OPEN';
  const invitations = useQuery({
    queryKey: ['issuance', id, 'invitations'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/issuances/{id}/invitations', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
  const investors = useQuery({
    queryKey: ['investors', 'for-invitation'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/investors', {
        params: { query: { pageSize: 100 } },
      });
      if (error) throw error;
      return data.data;
    },
    enabled: open,
  });
  const invited = new Set(
    (invitations.data ?? []).filter((row) => row.status === 'INVITED').map((row) => row.investorId),
  );
  const candidates = (investors.data ?? []).filter((row) => !invited.has(row.id));
  const [investorId, setInvestorId] = useState('');
  const idempotency = useIdempotencyKey();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['issuance', id, 'invitations'] });
  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/issuances/{id}/invitations', {
        params: { path: { id }, header: idempotency.header() },
        body: { investorId },
      });
      idempotency.answered();
      if (error) throw error;
    },
    onSuccess: async () => {
      setInvestorId('');
      await refresh();
    },
  });
  const revokeKey = useIdempotencyKey();
  const revoke = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await api.DELETE('/api/v1/issuances/{id}/invitations/{invitationId}', {
        params: { path: { id, invitationId }, header: revokeKey.header() },
      });
      revokeKey.answered();
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const refused = invite.isError && errorCodeOf(invite.error) === 'ELIGIBILITY_FAILED';

  return (
    <div className="flex flex-col gap-4">
      {open ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-[2fr_auto] sm:items-end">
            <FormField label={t('investor')}>
              <Select
                value={investorId}
                onChange={(event) => {
                  setInvestorId(event.target.value);
                  invite.reset();
                }}
              >
                <option value="" disabled />
                {candidates.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.legalName}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button disabled={!investorId || invite.isPending} onClick={() => invite.mutate()}>
              {t('invite')}
            </Button>
          </div>
          <p className="text-sm text-muted">{t('help')}</p>
          {refused ? (
            <div role="alert" className="rounded-lg border border-error-text/40 p-3">
              <p className="mb-2 text-sm font-medium">{t('refused')}</p>
              <EligibilityResult result="NOT_ELIGIBLE" rules={failedRulesOf(invite.error)} />
            </div>
          ) : invite.isError ? (
            <ApiError error={invite.error} />
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">{t('closed')}</p>
      )}
      {invitations.isError ? <ApiError error={invitations.error} /> : null}
      {revoke.isError ? <ApiError error={revoke.error} /> : null}
      {invitations.data?.length === 0 ? <p className="text-sm text-muted">{t('none')}</p> : null}
      <ul className="flex flex-col divide-y divide-border text-sm">
        {(invitations.data ?? []).map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              {row.investorName}
              <span className="text-muted">
                {' · '}
                {t(`status.${row.status}`)} ·{' '}
                {format.dateTime(
                  new Date(
                    row.status === 'REVOKED' && row.revokedAt ? row.revokedAt : row.invitedAt,
                  ),
                  {
                    dateStyle: 'medium',
                  },
                )}
              </span>
            </span>
            {row.status === 'INVITED' ? (
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="ghost">
                    {t('revoke')}
                    <span className="sr-only"> {row.investorName}</span>
                  </Button>
                }
                title={t('revokeTitle', { name: row.investorName })}
                description={t('revokeDescription')}
                confirmLabel={t('revoke')}
                destructive
                onConfirm={() => revoke.mutateAsync(row.id)}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
