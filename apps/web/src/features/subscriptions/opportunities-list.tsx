'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { StatusBadge } from '@/components/app/status-badge';
import { formatAmount, formatBusinessDate } from '@/features/issuances/format';
import type { IssuanceView } from '@/features/issuances/types';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

const PAGE_SIZE = 25;

/** Issuances the investor is invited to (SPEC §14.2): the API only returns those. */
export function OpportunitiesList() {
  const t = useTranslations('subscriptions.opportunities');
  const tIssuances = useTranslations('issuances');
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const opportunities = useQuery({
    queryKey: ['issuances', 'opportunities', page],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/issuances', {
        params: { query: { page, pageSize: PAGE_SIZE } },
      });
      if (error) throw error;
      return data;
    },
    placeholderData: (previous) => previous,
  });
  return (
    <div className="flex flex-col gap-4">
      {opportunities.isError ? <ApiError error={opportunities.error} /> : null}
      <DataTable<IssuanceView>
        caption={t('caption')}
        loading={opportunities.isPending}
        rows={opportunities.data?.data ?? []}
        getRowId={(row) => row.id}
        emptyMessage={t('empty')}
        pagination={opportunities.data?.meta}
        onPageChange={setPage}
        columns={[
          {
            id: 'name',
            header: tIssuances('columns.name'),
            cell: (row) => (
              <Link
                href={`/portal/opportunities/${row.id}`}
                className="text-primary-text hover:underline"
              >
                {row.name}
                <span className="ml-2 font-mono text-xs text-muted">{row.code}</span>
              </Link>
            ),
          },
          {
            id: 'status',
            header: tIssuances('columns.status'),
            cell: (row) => <StatusBadge domain="issuance" status={row.status} />,
          },
          {
            id: 'category',
            header: tIssuances('columns.category'),
            cell: (row) =>
              row.assetCategory ? tIssuances(`categories.${row.assetCategory}`) : '—',
          },
          {
            id: 'minimum',
            header: tIssuances('fields.minSubscriptionAmount'),
            numeric: true,
            cell: (row) => formatAmount(row.terms.minSubscriptionAmount, row.currency, locale),
          },
          {
            id: 'window',
            header: tIssuances('columns.window'),
            cell: (row) =>
              `${formatBusinessDate(row.terms.subscriptionStartDate, locale)} → ${formatBusinessDate(row.terms.subscriptionEndDate, locale)}`,
          },
        ]}
      />
    </div>
  );
}
