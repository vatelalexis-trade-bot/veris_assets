'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { DataTable } from '@/components/app/data-table';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { formatBusinessDate } from '@/features/issuances/format';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import type { ScheduleView } from './types';

/** Coupons and principal of an active issuance (SPEC §12.1), and their distributions. */
export function ScheduleTab({
  issuanceId,
  canPrepare,
}: {
  issuanceId: string;
  canPrepare: boolean;
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
