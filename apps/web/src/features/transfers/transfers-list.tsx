'use client';

import { useQuery } from '@tanstack/react-query';
import { STATUS_TONES } from '@virtus/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { StatusBadge } from '@/components/app/status-badge';
import { Select } from '@/components/ui/select';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import type { TransferStatus, TransferView } from './types';

const PAGE_SIZE = 25;
const STATUSES = Object.keys(STATUS_TONES.transfer) as TransferStatus[];

/** Transfer requests: the investor's own, or all of the organisation for its staff. */
export function TransfersList({ basePath, staff }: { basePath: string; staff: boolean }) {
  const t = useTranslations('transfers');
  const tStatus = useTranslations('status.transfer');
  const format = useFormatter();
  const [status, setStatus] = useState<'' | TransferStatus>(staff ? 'COMPLIANCE_REVIEW' : '');
  const [page, setPage] = useState(1);
  const transfers = useQuery({
    queryKey: ['transfers', staff, status, page],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/transfers', {
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
          className="w-56"
          onChange={(event) => {
            setStatus(event.target.value as '' | TransferStatus);
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
      {transfers.isError ? <ApiError error={transfers.error} /> : null}
      <DataTable<TransferView>
        caption={t('caption')}
        loading={transfers.isPending}
        rows={transfers.data?.data ?? []}
        getRowId={(row) => row.id}
        emptyMessage={t('empty')}
        pagination={transfers.data?.meta}
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
          ...(staff
            ? [
                {
                  id: 'parties',
                  header: t('columns.parties'),
                  cell: (row: TransferView) =>
                    `${row.fromInvestorName} → ${row.toInvestorName ?? '—'}`,
                },
              ]
            : [
                {
                  id: 'recipient',
                  header: t('columns.recipientCode'),
                  cell: (row: TransferView) => (
                    <span className="font-mono">{row.recipientCode}</span>
                  ),
                },
              ]),
          {
            id: 'quantity',
            header: t('columns.quantity'),
            numeric: true,
            cell: (row) => row.quantity,
          },
          {
            id: 'status',
            header: t('columns.status'),
            cell: (row) => <StatusBadge domain="transfer" status={row.status} />,
          },
          {
            id: 'updated',
            header: t('columns.updatedAt'),
            cell: (row) => format.dateTime(new Date(row.updatedAt), { dateStyle: 'medium' }),
          },
        ]}
      />
    </div>
  );
}
