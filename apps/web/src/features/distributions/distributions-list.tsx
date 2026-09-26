'use client';

import { useQuery } from '@tanstack/react-query';
import { STATUS_TONES } from '@virtus/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { StatusBadge } from '@/components/app/status-badge';
import { Select } from '@/components/ui/select';
import { formatAmount, formatBusinessDate } from '@/features/issuances/format';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import type { DistributionStatus, DistributionView } from './types';

const PAGE_SIZE = 25;
const STATUSES = Object.keys(STATUS_TONES.distribution) as DistributionStatus[];

/** Distributions: all of the organisation for its staff, the investor's own ones in the portal. */
export function DistributionsList({ basePath, staff }: { basePath: string; staff: boolean }) {
  const t = useTranslations('distributions');
  const tStatus = useTranslations('status.distribution');
  const locale = useLocale();
  const [status, setStatus] = useState<'' | DistributionStatus>('');
  const [page, setPage] = useState(1);
  const distributions = useQuery({
    queryKey: ['distributions', staff, status, page],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/distributions', {
        params: { query: { page, pageSize: PAGE_SIZE, ...(status ? { status } : {}) } },
      });
      if (error) throw error;
      return data;
    },
    placeholderData: (previous) => previous,
  });
  return (
    <div className="flex flex-col gap-3">
      {staff ? (
        <Select
          aria-label={t('columns.status')}
          value={status}
          className="w-64"
          onChange={(event) => {
            setStatus(event.target.value as '' | DistributionStatus);
            setPage(1);
          }}
        >
          <option value="">{t('allStatuses')}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {tStatus(value)}
            </option>
          ))}
        </Select>
      ) : null}
      {distributions.isError ? <ApiError error={distributions.error} /> : null}
      <DataTable<DistributionView>
        caption={t('caption')}
        loading={distributions.isPending}
        rows={distributions.data?.data ?? []}
        getRowId={(row) => row.id}
        emptyMessage={t('empty')}
        pagination={distributions.data?.meta}
        onPageChange={setPage}
        columns={[
          {
            id: 'issuance',
            header: t('columns.issuance'),
            cell: (row) => (
              <Link href={`${basePath}/${row.id}`} className="text-primary-text hover:underline">
                {row.issuanceName}
                <span className="ml-2 font-mono text-xs text-muted">{row.issuanceCode}</span>
              </Link>
            ),
          },
          { id: 'type', header: t('columns.type'), cell: (row) => t(`schedule.types.${row.type}`) },
          {
            id: 'paymentDate',
            header: t('columns.paymentDate'),
            cell: (row) => formatBusinessDate(row.schedule.paymentDate, locale),
          },
          ...(staff
            ? [
                {
                  id: 'total',
                  header: t('columns.total'),
                  numeric: true,
                  cell: (row: DistributionView) =>
                    formatAmount(row.totalGrossAmount, row.currency, locale),
                },
              ]
            : []),
          {
            id: 'status',
            header: t('columns.status'),
            cell: (row) => <StatusBadge domain="distribution" status={row.status} />,
          },
        ]}
      />
    </div>
  );
}
