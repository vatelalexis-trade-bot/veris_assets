'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { DataTable } from '@/components/app/data-table';
import { StatusBadge } from '@/components/app/status-badge';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBusinessDate } from '@/features/issuances/format';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import type { ScheduleView } from './types';

/** Coupons and principal of an active issuance (SPEC §12.1), and their distributions. */
export function ScheduleTab({
  issuanceId,
  canPrepare,
  canRedeemEarly,
}: {
  issuanceId: string;
  canPrepare: boolean;
  /** The issuance is active and the user may operate it. */
  canRedeemEarly: boolean;
}) {
  const t = useTranslations('distributions.schedule');
  const locale = useLocale();
  const schedule = useQuery({
    queryKey: ['coupon-schedule', issuanceId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/issuances/{id}/coupon-schedule', {
        params: { path: { id: issuanceId } },
      });
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="flex flex-col gap-3">
      {canRedeemEarly ? <EarlyRedemption issuanceId={issuanceId} /> : null}
      {schedule.isError ? <ApiError error={schedule.error} /> : null}
      <DataTable<ScheduleView>
        caption={t('caption')}
        loading={schedule.isPending}
        rows={schedule.data ?? []}
        getRowId={(row) => row.id}
        emptyMessage={t('empty')}
        columns={[
          { id: 'sequence', header: '#', numeric: true, cell: (row) => row.sequence },
          { id: 'type', header: t('columns.type'), cell: (row) => t(`types.${row.type}`) },
          {
            id: 'period',
            header: t('columns.period'),
            cell: (row) =>
              `${formatBusinessDate(row.periodStart, locale)} → ${formatBusinessDate(row.periodEnd, locale)}`,
          },
          {
            id: 'recordDate',
            header: t('columns.recordDate'),
            cell: (row) => formatBusinessDate(row.recordDate, locale),
          },
          {
            id: 'paymentDate',
            header: t('columns.paymentDate'),
            cell: (row) => formatBusinessDate(row.paymentDate, locale),
          },
          {
            id: 'status',
            header: t('columns.status'),
            cell: (row) =>
              row.distributionId && row.distributionStatus ? (
                <Link
                  href={`/issuer/distributions/${row.distributionId}`}
                  className="hover:underline"
                >
                  <StatusBadge domain="distribution" status={row.distributionStatus} />
                </Link>
              ) : (
                t(`status.${row.status}`)
              ),
          },
          ...(canPrepare
            ? [
                {
                  id: 'actions',
                  header: t('columns.actions'),
                  cell: (row: ScheduleView) =>
                    row.status === 'SCHEDULED' && !row.distributionId ? (
                      <CreateDistribution scheduleId={row.id} issuanceId={issuanceId} />
                    ) : null,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

function CreateDistribution({
  scheduleId,
  issuanceId,
}: {
  scheduleId: string;
  issuanceId: string;
}) {
  const t = useTranslations('distributions.schedule');
  const router = useRouter();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/distributions', {
        params: { header: idempotency.header() },
        body: { couponScheduleId: scheduleId },
      });
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['coupon-schedule', issuanceId] });
      router.push(`/issuer/distributions/${created.id}`);
    },
  });
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={create.isPending}
        onClick={() => create.mutate()}
      >
        {t('create')}
      </Button>
      {create.isError ? <ApiError error={create.error} /> : null}
    </div>
  );
}

/** ALLOCATED → ACTIVE once every subscription is paid; generates the schedule (SPEC §7.1). */
export function ActivateButton({ issuanceId }: { issuanceId: string }) {
  const t = useTranslations('distributions.activation');
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const activate = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/issuances/{id}/activate', {
        params: { path: { id: issuanceId }, header: idempotency.header() },
      });
      idempotency.answered();
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['issuance', issuanceId] });
      await queryClient.invalidateQueries({ queryKey: ['issuance', issuanceId, 'transitions'] });
      await queryClient.invalidateQueries({ queryKey: ['coupon-schedule', issuanceId] });
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <ConfirmDialog
        trigger={<Button>{t('activate')}</Button>}
        title={t('title')}
        description={t('description')}
        confirmLabel={t('activate')}
        onConfirm={() => activate.mutateAsync()}
      />
      {activate.isError ? <ApiError error={activate.error} /> : null}
    </div>
  );
}

/** Total early redemption (SPEC §12.6): the principal is scheduled on the chosen date. */
function EarlyRedemption({ issuanceId }: { issuanceId: string }) {
  const t = useTranslations('distributions.earlyRedemption');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const redeem = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/issuances/{id}/early-redemption', {
        params: { path: { id: issuanceId }, header: idempotency.header() },
        body: { paymentDate: date },
      });
      idempotency.answered();
      if (error) throw error;
    },
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['coupon-schedule', issuanceId] });
    },
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        redeem.reset();
      }}
    >
      <div>
        <Dialog.Trigger asChild>
          <Button variant="secondary">{t('open')}</Button>
        </Dialog.Trigger>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-surface p-6">
          <Dialog.Title className="text-lg font-semibold">{t('title')}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted">{t('description')}</Dialog.Description>
          <FormField label={t('date')}>
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-48"
            />
          </FormField>
          {redeem.isError ? <ApiError error={redeem.error} /> : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{tCommon('cancel')}</Button>
            </Dialog.Close>
            <Button
              variant="destructive"
              disabled={!date || redeem.isPending}
              onClick={() => redeem.mutate()}
            >
              {t('confirm')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
