'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
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
import type { SubscriptionStatus, SubscriptionView } from './types';

export interface SubscriptionRights {
  /** The investor itself (portal), rather than the staff of the issuer. */
  investor: boolean;
  canReview: boolean;
  canApprove: boolean;
  canCancel: boolean;
}

const CANCELLABLE_BY_INVESTOR: SubscriptionStatus[] = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'];
const CANCELLABLE_BY_ISSUER: SubscriptionStatus[] = [
  ...CANCELLABLE_BY_INVESTOR,
  'APPROVED',
  'PAYMENT_PENDING',
];

/** One subscription: what was requested, the explicit actions of its life cycle, its history. */
export function SubscriptionDetail({ id, rights }: { id: string; rights: SubscriptionRights }) {
  const t = useTranslations('subscriptions');
  const locale = useLocale();
  const format = useFormatter();
  const queryClient = useQueryClient();
  const subscription = useQuery({
    queryKey: ['subscription', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/subscriptions/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
  const refresh = async (updated: SubscriptionView) => {
    queryClient.setQueryData(['subscription', id], updated);
    await queryClient.invalidateQueries({ queryKey: ['subscription', id, 'transitions'] });
    await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
  };

  if (subscription.isError) return <ApiError error={subscription.error} />;
  if (!subscription.data) return <Skeleton className="h-60 w-full" />;
  const current = subscription.data;
  const status = current.status;
  const basePath = rights.investor ? '/portal/subscriptions' : '/issuer/subscriptions';
  const dateTime = (value: string | null) =>
    value ? format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const rows: [string, ReactNode][] = [
    [
      t('fields.issuance'),
      <Link
        key="issuance"
        href={
          rights.investor
            ? `/portal/opportunities/${current.issuanceId}`
            : `/issuer/issuances/${current.issuanceId}`
        }
        className="text-primary-text hover:underline"
      >
        {current.issuanceName} ({current.issuanceCode})
      </Link>,
    ],
    ...(rights.investor
      ? []
      : ([
          [
            t('fields.investor'),
            <Link
              key="investor"
              href={`/issuer/investors/${current.investorId}`}
              className="text-primary-text hover:underline"
            >
              {current.investorName}
            </Link>,
          ],
        ] as [string, ReactNode][])),
    [t('fields.units'), current.requestedUnits],
    [t('fields.amount'), formatAmount(current.requestedAmount, current.currency, locale)],
    [t('fields.paymentReference'), current.paymentReference ?? '—'],
    [t('fields.submittedAt'), dateTime(current.submittedAt)],
    [t('fields.decidedAt'), dateTime(current.decidedAt)],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href={basePath} className="text-sm text-primary-text hover:underline">
        ← {t('back')}
      </Link>
      <PageHeader
        title={t('detailTitle', { code: current.issuanceCode })}
        description={rights.investor ? current.issuanceName : current.investorName}
        actions={<StatusBadge domain="subscription" status={status} />}
      />
      {current.rejectionReason ? (
        <p className="rounded-lg border border-error/40 p-3 text-sm">
          <span className="font-medium">{t('rejectionReason')}</span> {current.rejectionReason}
        </p>
      ) : null}
      {current.cancellationReason ? (
        <p className="rounded-lg border border-warning/40 p-3 text-sm">
          <span className="font-medium">{t('cancellationReason')}</span>{' '}
          {current.cancellationReason === 'ISSUANCE_CANCELLED'
            ? t('issuanceCancelled')
            : current.cancellationReason}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {status === 'SUBMITTED' && rights.canReview ? (
          <ActionButton id={id} action="start-review" onDone={refresh} />
        ) : null}
        {status === 'UNDER_REVIEW' && rights.canApprove ? (
          <>
            <ActionButton id={id} action="approve" onDone={refresh} />
            <ReasonButton id={id} action="reject" onDone={refresh} />
          </>
        ) : null}
        {rights.investor && rights.canCancel && CANCELLABLE_BY_INVESTOR.includes(status) ? (
          <ActionButton id={id} action="cancel" onDone={refresh} />
        ) : null}
        {!rights.investor && rights.canCancel && CANCELLABLE_BY_ISSUER.includes(status) ? (
          <ReasonButton id={id} action="cancel" onDone={refresh} />
        ) : null}
      </div>
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
          {current.comment ? (
            <p className="mt-3 text-sm whitespace-pre-wrap">
              <span className="text-muted">{t('fields.comment')}</span> {current.comment}
            </p>
          ) : null}
          {current.eligibilityAssessmentId ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-success">
              <CircleCheck aria-hidden="true" className="size-4" />
              {t('eligibilityChecked')}
            </p>
          ) : null}
        </section>
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 font-heading font-semibold">{t('history')}</h2>
          <History id={id} />
        </section>
      </div>
    </div>
  );
}

type Action = 'start-review' | 'approve' | 'cancel';

function ActionButton({
  id,
  action,
  onDone,
}: {
  id: string;
  action: Action;
  onDone: (updated: SubscriptionView) => Promise<void>;
}) {
  const t = useTranslations('subscriptions.actions');
  const idempotency = useIdempotencyKey();
  const run = useMutation({
    mutationFn: async () => {
      const params = { path: { id }, header: idempotency.header() };
      const { data, error } =
        action === 'start-review'
          ? await api.POST('/api/v1/subscriptions/{id}/start-review', { params })
          : action === 'approve'
            ? await api.POST('/api/v1/subscriptions/{id}/approve', { params })
            : await api.POST('/api/v1/subscriptions/{id}/cancel', { params, body: {} });
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

/** Rejection and cancellation by the issuer: the reason is required and shown to the investor. */
function ReasonButton({
  id,
  action,
  onDone,
}: {
  id: string;
  action: 'reject' | 'cancel';
  onDone: (updated: SubscriptionView) => Promise<void>;
}) {
  const t = useTranslations('subscriptions.actions');
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
          ? await api.POST('/api/v1/subscriptions/{id}/reject', options)
          : await api.POST('/api/v1/subscriptions/{id}/cancel', options);
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
  const label = action === 'reject' ? t('reject') : t('cancel');
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
            {action === 'reject' ? t('rejectTitle') : t('cancelTitle')}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted">
            {action === 'reject' ? t('rejectDescription') : t('cancelByIssuerDescription')}
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
  const t = useTranslations('subscriptions');
  const tStatus = useTranslations('status.subscription');
  const format = useFormatter();
  const history = useQuery({
    queryKey: ['subscription', id, 'transitions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/subscriptions/{id}/transitions', {
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
