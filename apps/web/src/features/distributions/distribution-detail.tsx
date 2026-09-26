'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { DataTable } from '@/components/app/data-table';
import { FormField } from '@/components/app/form-field';
import { PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { formatAmount, formatBusinessDate, formatRate } from '@/features/issuances/format';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import type { DistributionView, LineView } from './types';

export interface DistributionRights {
  investor: boolean;
  canPrepare: boolean;
  canApprove: boolean;
  canCancel: boolean;
  canConfirmPayment: boolean;
  currentUserId: string;
}

type Action =
  | 'calculate'
  | 'submit-for-review'
  | 'approve'
  | 'payment-instruction'
  | 'payment-instruction/prepare'
  | 'payment-instruction/confirm';

const CANCELLABLE = ['DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED'];

/** One distribution (SPEC §12.5): figures, lines, the explicit actions and the validation trail. */
export function DistributionDetail({ id, rights }: { id: string; rights: DistributionRights }) {
  const t = useTranslations('distributions');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const distribution = useQuery({
    queryKey: ['distribution', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/distributions/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
  const lines = useQuery({
    queryKey: ['distribution', id, 'lines', distribution.data?.version],
    enabled: distribution.data !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/distributions/{id}/lines', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
  const refresh = async (updated: DistributionView) => {
    queryClient.setQueryData(['distribution', id], updated);
    await queryClient.invalidateQueries({ queryKey: ['distribution', id, 'transitions'] });
    await queryClient.invalidateQueries({ queryKey: ['distributions'] });
    await queryClient.invalidateQueries({ queryKey: ['coupon-schedule', updated.issuanceId] });
  };
  if (distribution.isError) return <ApiError error={distribution.error} />;
  if (!distribution.data) return <Skeleton className="h-60 w-full" />;
  const current = distribution.data;
  const status = current.status;
  const money = (value: string | null) => formatAmount(value, current.currency, locale);
  const preparedByMe = current.preparedBy === rights.currentUserId;
  const instructionPreparedByMe = current.instruction?.preparedBy === rights.currentUserId;
  const figures: [string, string][] = [
    [
      t('fields.period'),
      `${formatBusinessDate(current.schedule.periodStart, locale)} → ${formatBusinessDate(current.schedule.periodEnd, locale)}`,
    ],
    [t('fields.recordDate'), formatBusinessDate(current.schedule.recordDate, locale)],
    [t('fields.paymentDate'), formatBusinessDate(current.schedule.paymentDate, locale)],
    ...(rights.investor
      ? []
      : ([
          [t('fields.dayCount'), current.dayCount ? t(`dayCounts.${current.dayCount}`) : '—'],
          [t('fields.periodFraction'), formatAmount(current.periodFraction, null, locale)],
          [t('fields.rate'), formatRate(current.rate, locale)],
          [t('fields.nominalValue'), money(current.nominalValue)],
          [t('fields.total'), money(current.totalGrossAmount)],
          // All the decimals of the difference, not rounded to the currency.
          [t('fields.roundingDifference'), formatAmount(current.roundingDifference, null, locale)],
          [
            t('fields.beneficiaries'),
            current.beneficiaryCount === null ? '—' : String(current.beneficiaryCount),
          ],
          [t('fields.calculationVersion'), current.calculationVersion ?? '—'],
        ] as [string, string][])),
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={rights.investor ? '/portal/distributions' : '/issuer/distributions'}
        className="text-sm text-primary-text hover:underline"
      >
        ← {t('back')}
      </Link>
      <PageHeader
        title={t('detailTitle', {
          code: current.issuanceCode,
          sequence: current.schedule.sequence,
        })}
        description={`${current.issuanceName} · ${t(`schedule.types.${current.type}`)}`}
        actions={<StatusBadge domain="distribution" status={status} />}
      />
      {current.statusComment ? (
        <p className="rounded-lg border border-warning/40 p-3 text-sm">
          <span className="font-medium">{t('statusComment')}</span> {current.statusComment}
        </p>
      ) : null}
      {!rights.investor ? (
        <div className="flex flex-wrap gap-2">
          {status === 'DRAFT' && rights.canPrepare ? (
            <Step id={id} action="calculate" onDone={refresh} />
          ) : null}
          {status === 'CALCULATED' && rights.canPrepare ? (
            <Step id={id} action="submit-for-review" onDone={refresh} />
          ) : null}
          {status === 'UNDER_REVIEW' && rights.canApprove && !preparedByMe ? (
            <>
              <Step id={id} action="approve" onDone={refresh} />
              <Commented id={id} action="return-to-draft" onDone={refresh} />
            </>
          ) : null}
          {(status === 'APPROVED' || status === 'FAILED') && rights.canPrepare ? (
            <Step id={id} action="payment-instruction" onDone={refresh} />
          ) : null}
          {status === 'PAYMENT_INSTRUCTION_GENERATED' &&
          current.instruction?.status === 'GENERATED' &&
          rights.canPrepare ? (
            <Step id={id} action="payment-instruction/prepare" onDone={refresh} />
          ) : null}
          {status === 'PAYMENT_INSTRUCTION_GENERATED' &&
          current.instruction?.status === 'PREPARED' &&
          rights.canConfirmPayment &&
          !instructionPreparedByMe ? (
            <Step id={id} action="payment-instruction/confirm" onDone={refresh} />
          ) : null}
          {current.instruction && rights.canPrepare ? (
            <Button asChild variant="secondary">
              <a href={`/api/v1/distributions/${id}/payment-instruction/csv`} download>
                {t('downloadCsv')}
              </a>
            </Button>
          ) : null}
          {CANCELLABLE.includes(status) && rights.canCancel ? (
            <Commented id={id} action="cancel" onDone={refresh} />
          ) : null}
        </div>
      ) : null}
      {!rights.investor && status === 'UNDER_REVIEW' && preparedByMe && rights.canApprove ? (
        <p className="text-sm text-muted">{t('fourEyes')}</p>
      ) : null}
      {!rights.investor && current.instruction?.status === 'PREPARED' && instructionPreparedByMe ? (
        <p className="text-sm text-muted">{t('paymentFourEyes')}</p>
      ) : null}
      {current.instruction ? (
        <p className="text-sm text-muted">
          {t(`instruction.${current.instruction.status}`, {
            total: money(current.instruction.totalAmount),
            lines: current.instruction.lineCount,
          })}
          {current.instruction.providerReference
            ? ` · ${current.instruction.providerReference}`
            : ''}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 font-heading font-semibold">{t('figures')}</h2>
          <dl className="flex flex-col text-sm">
            {figures.map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-3 border-b border-border py-1 last:border-0"
              >
                <dt className="text-muted">{label}</dt>
                <dd className="text-right tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {!rights.investor && current.snapshotId ? <RecalculationCheck id={id} /> : null}
        </section>
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 font-heading font-semibold">{t('history')}</h2>
          <History id={id} />
        </section>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">
          {rights.investor ? t('ownLine') : t('lines')}
        </h2>
        {lines.isError ? <ApiError error={lines.error} /> : null}
        <DataTable<LineView>
          caption={t('linesCaption')}
          loading={lines.isPending}
          rows={lines.data ?? []}
          getRowId={(row) => row.investorId}
          emptyMessage={t('noLine')}
          columns={[
            {
              id: 'investor',
              header: t('columns.investor'),
              cell: (row) => row.investorName ?? '—',
            },
            {
              id: 'quantity',
              header: t('columns.quantity'),
              numeric: true,
              cell: (row) => row.eligibleQuantity,
            },
            ...(rights.investor
              ? []
              : [
                  {
                    id: 'unrounded',
                    header: t('columns.unrounded'),
                    numeric: true,
                    cell: (row: LineView) => (
                      <span className="font-mono text-xs">{row.grossAmountUnrounded}</span>
                    ),
                  },
                ]),
            {
              id: 'amount',
              header: t('columns.amount'),
              numeric: true,
              cell: (row) => formatAmount(row.grossAmount, row.currency, locale),
            },
            ...(rights.investor
              ? []
              : [
                  {
                    id: 'anomaly',
                    header: t('columns.anomaly'),
                    cell: (row: LineView) =>
                      row.anomalyCode ? t(`anomalies.${row.anomalyCode}`) : '',
                  },
                ]),
          ]}
        />
      </section>
    </div>
  );
}

function Step({
  id,
  action,
  onDone,
}: {
  id: string;
  action: Action;
  onDone: (updated: DistributionView) => Promise<void>;
}) {
  const t = useTranslations('distributions.actions');
  const idempotency = useIdempotencyKey();
  const run = useMutation({
    mutationFn: async () => {
      const params = { path: { id }, header: idempotency.header() };
      const { data, error } =
        action === 'calculate'
          ? await api.POST('/api/v1/distributions/{id}/calculate', { params })
          : action === 'submit-for-review'
            ? await api.POST('/api/v1/distributions/{id}/submit-for-review', { params })
            : action === 'approve'
              ? await api.POST('/api/v1/distributions/{id}/approve', { params })
              : action === 'payment-instruction'
                ? await api.POST('/api/v1/distributions/{id}/payment-instruction', { params })
                : action === 'payment-instruction/prepare'
                  ? await api.POST('/api/v1/distributions/{id}/payment-instruction/prepare', {
                      params,
                    })
                  : await api.POST('/api/v1/distributions/{id}/payment-instruction/confirm', {
                      params,
                    });
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: onDone,
  });
  return (
    <div className="flex flex-col gap-2">
      <ConfirmDialog
        trigger={<Button>{t(`${action}.label`)}</Button>}
        title={t(`${action}.title`)}
        description={t(`${action}.description`)}
        confirmLabel={t(`${action}.label`)}
        onConfirm={() => run.mutateAsync()}
      />
      {run.isError ? <ApiError error={run.error} /> : null}
    </div>
  );
}

function Commented({
  id,
  action,
  onDone,
}: {
  id: string;
  action: 'return-to-draft' | 'cancel';
  onDone: (updated: DistributionView) => Promise<void>;
}) {
  const t = useTranslations('distributions.actions');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const idempotency = useIdempotencyKey();
  const run = useMutation({
    mutationFn: async () => {
      const options = {
        params: { path: { id }, header: idempotency.header() },
        body: { comment: comment.trim() },
      };
      const { data, error } =
        action === 'cancel'
          ? await api.POST('/api/v1/distributions/{id}/cancel', options)
          : await api.POST('/api/v1/distributions/{id}/return-to-draft', options);
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: async (updated) => {
      setOpen(false);
      setComment('');
      await onDone(updated);
    },
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        run.reset();
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant={action === 'cancel' ? 'destructive' : 'secondary'}>
          {t(`${action}.label`)}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-surface p-6">
          <Dialog.Title className="text-lg font-semibold">{t(`${action}.title`)}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted">
            {t(`${action}.description`)}
          </Dialog.Description>
          <FormField label={t('commentRequired')}>
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={2000}
            />
          </FormField>
          {run.isError ? <ApiError error={run.error} /> : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{tCommon('cancel')}</Button>
            </Dialog.Close>
            <Button
              variant={action === 'cancel' ? 'destructive' : 'primary'}
              disabled={!comment.trim() || run.isPending}
              onClick={() => run.mutate()}
            >
              {t(`${action}.label`)}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Control recalculation from the snapshot (SPEC §12.3), on demand. */
function RecalculationCheck({ id }: { id: string }) {
  const t = useTranslations('distributions.recalculation');
  const check = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/distributions/{id}/recalculate-check', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="mt-4 flex flex-col gap-2 text-sm">
      <div>
        <Button
          size="sm"
          variant="secondary"
          disabled={check.isPending}
          onClick={() => check.mutate()}
        >
          {t('run')}
        </Button>
      </div>
      {check.isError ? <ApiError error={check.error} /> : null}
      {check.data ? (
        <p
          role="status"
          className={`flex items-center gap-2 ${check.data.identical && check.data.snapshotReproducible ? 'text-success' : 'text-error-text'}`}
        >
          {check.data.identical && check.data.snapshotReproducible ? (
            <CircleCheck aria-hidden="true" className="size-4" />
          ) : (
            <CircleAlert aria-hidden="true" className="size-4" />
          )}
          {check.data.identical && check.data.snapshotReproducible
            ? t('identical')
            : t('different', { count: check.data.differences.length })}
        </p>
      ) : null}
    </div>
  );
}

function History({ id }: { id: string }) {
  const t = useTranslations('distributions');
  const tStatus = useTranslations('status.distribution');
  const format = useFormatter();
  const history = useQuery({
    queryKey: ['distribution', id, 'transitions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/distributions/{id}/transitions', {
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
