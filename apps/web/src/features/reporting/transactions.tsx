'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { formatBusinessDate } from '@/features/issuances/format';
import type { LedgerEntryView } from '@/features/registry/types';
import { api } from '@/lib/api/client';

/** The investor's movements, every issuance together (SPEC §14.2 "Transactions"). */
export function Transactions() {
  const t = useTranslations('registry');
  const tPage = useTranslations('reporting.transactions');
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const ledger = useQuery({
    queryKey: ['ledger', 'own', page],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/ledger', {
        params: { query: { page, pageSize: 50 } },
      });
      if (error) throw error;
      return data;
    },
    placeholderData: (previous) => previous,
  });
  const side = (value: LedgerEntryView['source']) =>
    value.type === null
      ? '—'
      : value.type === 'ISSUER_TREASURY'
        ? t('treasury')
        : (value.investorName ?? t('otherInvestor'));
  return (
    <div className="flex flex-col gap-2">
      {ledger.isError ? <ApiError error={ledger.error} /> : null}
      <DataTable<LedgerEntryView>
        caption={tPage('caption')}
        loading={ledger.isPending}
        rows={ledger.data?.data ?? []}
        getRowId={(row) => row.id}
        emptyMessage={tPage('empty')}
        pagination={ledger.data?.meta}
        onPageChange={setPage}
        columns={[
          {
            id: 'date',
            header: t('columns.effectiveDate'),
            cell: (row) => formatBusinessDate(row.effectiveDate, locale),
          },
          {
            id: 'issuance',
            header: tPage('issuance'),
            cell: (row) => <span className="font-mono">{row.issuanceCode}</span>,
          },
          { id: 'type', header: t('columns.type'), cell: (row) => t(`types.${row.type}`) },
          { id: 'from', header: t('columns.from'), cell: (row) => side(row.source) },
          { id: 'to', header: t('columns.to'), cell: (row) => side(row.destination) },
          {
            id: 'quantity',
            header: t('columns.quantity'),
            numeric: true,
            cell: (row) => row.quantity,
          },
        ]}
      />
    </div>
  );
}
