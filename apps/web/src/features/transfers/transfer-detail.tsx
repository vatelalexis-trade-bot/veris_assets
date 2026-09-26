'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { FormField } from '@/components/app/form-field';
import { PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { formatAmount } from '@/features/issuances/format';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import type { TransferStatus, TransferView } from './types';

export interface TransferRights {
  investor: boolean;
  canApprove: boolean;
  canCancel: boolean;
}

const OPEN: TransferStatus[] = ['DRAFT', 'SUBMITTED', 'COMPLIANCE_REVIEW'];

/** One transfer request: what was asked, the review actions, the history. */
export function TransferDetail({ id, rights }: { id: string; rights: TransferRights }) {
  const t = useTranslations('transfers');
  const locale = useLocale();
  const format = useFormatter();
  const queryClient = useQueryClient();
  const transfer = useQuery({
    queryKey: ['transfer', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/transfers/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
  const refresh = async (updated: TransferView) => {
    queryClient.setQueryData(['transfer', id], updated);
    await queryClient.invalidateQueries({ queryKey: ['transfer', id, 'transitions'] });
    await queryClient.invalidateQueries({ queryKey: ['transfers'] });
    await queryClient.invalidateQueries({ queryKey: ['positions'] });
  };
  if (transfer.isError) return <ApiError error={transfer.error} />;
  if (!transfer.data) return <Skeleton className="h-60 w-full" />;
  const current = transfer.data;
  const status = current.status;
  const dateTime = (value: string | null) =>
    value ? format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const rows: [string, ReactNode][] = [
    [t('fields.issuance'), `${current.issuanceName} (${current.issuanceCode})`],
    ...(rights.investor
      ? ([
          [
            t('fields.recipientCode'),
            <span key="code" className="font-mono">
              {current.recipientCode}
            </span>,
          ],
        ] as [string, ReactNode][])
      : ([
          [t('fields.from'), current.fromInvestorName],
          [t('fields.to'), current.toInvestorName ?? '—'],
        ] as [string, ReactNode][])),
    [t('fields.quantity'), current.quantity],
    [
      t('fields.indicativePrice'),
      current.indicativePrice
        ? formatAmount(current.indicativePrice, current.indicativePriceCurrency, locale)
        : '—',
    ],
    [t('fields.submittedAt'), dateTime(current.submittedAt)],
    [t('fields.reviewedAt'), dateTime(current.reviewedAt)],
  ];
  const cancellable = OPEN.includes(status) && rights.canCancel;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={rights.investor ? '/portal/portfolio' : '/issuer/transfers'}
        className="text-sm text-primary-text hover:underline"
      >
        ← {rights.investor ? t('backToPortfolio') : t('back')}
      </Link>
      <PageHeader
        title={t('detailTitle', { code: current.issuanceCode })}
        description={t('detailDescription', { quantity: current.quantity })}
        actions={<StatusBadge domain="transfer" status={status} />}
      />
      {current.rejectionReason ? (
        <p className="rounded-lg border border-error/40 p-3 text-sm">
          <span className="font-medium">{t('rejectionReason')}</span> {current.rejectionReason}
        </p>
      ) : null}
      {current.cancellationReason && current.cancellationReason !== 'CANCELLED_BY_INVESTOR' ? (
        <p className="rounded-lg border border-warning/40 p-3 text-sm">
          <span className="font-medium">{t('cancellationReason')}</span>{' '}
          {current.cancellationReason}
        </p>
      ) : null}
      {rights.investor && OPEN.includes(status) && status !== 'DRAFT' ? (
        <p className="text-sm text-muted">{t('blockedWhileReviewed')}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {status === 'COMPLIANCE_REVIEW' && rights.canApprove ? (
          <>
            <Action id={id} action="approve" onDone={refresh} />
            <ReasonAction id={id} action="reject" onDone={refresh} />
          </>
        ) : null}
        {cancellable && rights.investor ? (
          <Action id={id} action="cancel" onDone={refresh} />
        ) : null}
        {cancellable && !rights.investor ? (
          <ReasonAction id={id} action="cancel" onDone={refresh} />
        ) : null}
      </div>
      {!rights.investor && current.eligibilityAssessmentId ? (
        <p className="text-sm text-muted">{t('recipientChecked')}</p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 font-heading font-semibold">{t('summary')}</h2>
          <dl className="flex flex-col text-sm">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-3 border-b border-border py-1 last:border-0"
              >
                <dt className="text-muted">{label}</dt>
                <dd className="text-right tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 font-heading font-semibold">{t('history')}</h2>
          <History id={id} />
        </section>
      </div>
    </div>
  );
}

function Action({
  id,
  action,
  onDone,
}: {
  id: string;
  action: 'approve' | 'cancel';
  onDone: (updated: TransferView) => Promise<void>;
}) {
  const t = useTranslations('transfers.actions');
  const idempotency = useIdempotencyKey();
  const run = useMutation({
    mutationFn: async () => {
      const params = { path: { id }, header: idempotency.header() };
      const { data, error } =
        action === 'approve'
          ? await api.POST('/api/v1/transfers/{id}/approve', { params })
          : await api.POST('/api/v1/transfers/{id}/cancel', { params, body: {} });
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: onDone,
  });
  return (
    <div className="flex flex-col gap-2">
      <ConfirmDialog
        trigger={
          <Button variant={action === 'cancel' ? 'destructive' : 'primary'}>{t(action)}</Button>
        }
        title={t(`${action}Title`)}
        description={t(`${action}Description`)}
        confirmLabel={t(action)}
        destructive={action === 'cancel'}
        onConfirm={() => run.mutateAsync()}
      />
      {run.isError ? <ApiError error={run.error} /> : null}
    </div>
  );
}

function ReasonAction({
  id,
  action,
  onDone,
}: {
  id: string;
  action: 'reject' | 'cancel';
  onDone: (updated: TransferView) => Promise<void>;
}) {
  const t = useTranslations('transfers.actions');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const idempotency = useIdempotencyKey();
  const run = useMutation({
    mutationFn: async () => {
      const options = {
        params: { path: { id }, header: idempotency.header() },
        body: { reason: reason.trim() },
      };
      const { data, error } =
        action === 'reject'
          ? await api.POST('/api/v1/transfers/{id}/reject', options)
          : await api.POST('/api/v1/transfers/{id}/cancel', options);
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: async (updated) => {
      setOpen(false);
      setReason('');
      await onDone(updated);
    },
  });
  const label = t(action === 'reject' ? 'reject' : 'cancel');
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        run.reset();
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant="destructive">{label}</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-surface p-6">
          <Dialog.Title className="text-lg font-semibold">
            {t(action === 'reject' ? 'rejectTitle' : 'cancelTitle')}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted">
            {t(action === 'reject' ? 'rejectDescription' : 'cancelByIssuerDescription')}
          </Dialog.Description>
          <FormField label={t('reasonRequired')}>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
            />
          </FormField>
          {run.isError ? <ApiError error={run.error} /> : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{tCommon('cancel')}</Button>
            </Dialog.Close>
            <Button
              variant="destructive"
              disabled={!reason.trim() || run.isPending}
              onClick={() => run.mutate()}
            >
              {label}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function History({ id }: { id: string }) {
  const t = useTranslations('transfers');
  const tStatus = useTranslations('status.transfer');
  const format = useFormatter();
  const history = useQuery({
    queryKey: ['transfer', id, 'transitions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/transfers/{id}/transitions', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="flex flex-col gap-2">
      {history.isError ? <ApiError error={history.error} /> : null}
      <ol className="flex flex-col gap-3 border-l border-border pl-4 text-sm">
        {(history.data ?? []).map((row, index) => (
          <li key={`${row.occurredAt}-${index}`}>
            <p className="font-medium">
              {row.fromStatus ? `${tStatus(row.fromStatus)} → ` : ''}
              {tStatus(row.toStatus)}
            </p>
            <p className="text-muted">
              {format.dateTime(new Date(row.occurredAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}{' '}
              · {row.actorName ?? (row.actorUserId ? t('unknownUser') : t('system'))}
            </p>
            {row.comment ? <p className="whitespace-pre-wrap">{row.comment}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
