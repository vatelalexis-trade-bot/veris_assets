'use client';

import { useQuery } from '@tanstack/react-query';
import { parseDecimal } from '@virtus/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { formatAmount, formatBusinessDate } from '@/features/issuances/format';
import { api } from '@/lib/api/client';
import {
  CorrectEntryButton,
  CorrectionsList,
  ReconciliationStatus,
  type CorrectionRights,
} from './corrections';
import type { LedgerEntryView, PositionView } from './types';

const LEDGER_PAGE_SIZE = 50;

/**
 * Registry of one issuance (SPEC §10.2, §10.3): who holds how many units, blocked or available,
 * and every movement of the append-only ledger with its chained hash.
 */
export function RegistryView({
  issuanceId,
  totalUnits,
  corrections,
}: {
  issuanceId: string;
  totalUnits?: string | null;
  /** Rights on corrections; the reconciliation and corrections are shown to the issuer only. */
  corrections: CorrectionRights;
}) {
  const t = useTranslations('registry');
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const positions = useQuery({
    queryKey: ['positions', issuanceId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/positions', {
        params: { query: { issuanceId, pageSize: 100 } },
      });
      if (error) throw error;
      return data;
    },
  });
  const ledger = useQuery({
    queryKey: ['ledger', issuanceId, page],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/ledger', {
        params: { query: { issuanceId, page, pageSize: LEDGER_PAGE_SIZE } },
      });
      if (error) throw error;
      return data;
    },
    placeholderData: (previous) => previous,
  });
  const rows = positions.data?.data ?? [];
  const investorUnits = rows
    .filter((row) => row.accountType === 'INVESTOR')
    .reduce((sum, row) => sum.plus(parseDecimal(row.quantityHeld)), parseDecimal('0'))
    .toString();
  const accountName = (side: LedgerEntryView['source']) =>
    side.type === null
      ? '—'
      : side.type === 'ISSUER_TREASURY'
        ? t('treasury')
        : (side.investorName ?? t('otherInvestor'));

  const positionLabel = (position: PositionView) =>
    position.accountType === 'ISSUER_TREASURY' ? t('treasury') : (position.investorName ?? '—');

  return (
    <div className="flex flex-col gap-6">
      <ReconciliationStatus issuanceId={issuanceId} />
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">{t('positions')}</h2>
        {positions.data ? (
          <p className="text-sm text-muted" role="status">
            {totalUnits
              ? t('heldByInvestors', { held: investorUnits, total: totalUnits })
              : t('heldByInvestorsNoTotal', { held: investorUnits })}
          </p>
        ) : null}
        {positions.isError ? <ApiError error={positions.error} /> : null}
        <DataTable<PositionView>
          caption={t('positionsCaption')}
          loading={positions.isPending}
          rows={rows}
          getRowId={(row) => row.id}
          emptyMessage={t('noPosition')}
          columns={[
            {
              id: 'account',
              header: t('columns.account'),
              cell: (row) =>
                row.accountType === 'ISSUER_TREASURY' ? t('treasury') : (row.investorName ?? '—'),
            },
            {
              id: 'held',
              header: t('columns.held'),
              numeric: true,
              cell: (row) => row.quantityHeld,
            },
            {
              id: 'blocked',
              header: t('columns.blocked'),
              numeric: true,
              cell: (row) => row.quantityBlocked,
            },
            {
              id: 'available',
              header: t('columns.available'),
              numeric: true,
              cell: (row) => row.quantityAvailable,
            },
            {
              id: 'acquisition',
              header: t('columns.acquisitionAmount'),
              numeric: true,
              cell: (row) => formatAmount(row.acquisitionAmount, row.currency, locale),
            },
          ]}
        />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">{t('ledger')}</h2>
        <p className="text-sm text-muted">{t('ledgerHelp')}</p>
        {ledger.isError ? <ApiError error={ledger.error} /> : null}
        <DataTable<LedgerEntryView>
          caption={t('ledgerCaption')}
          loading={ledger.isPending}
          rows={ledger.data?.data ?? []}
          getRowId={(row) => row.id}
          emptyMessage={t('noEntry')}
          pagination={ledger.data?.meta}
          onPageChange={setPage}
          columns={[
            { id: 'sequence', header: '#', numeric: true, cell: (row) => row.sequenceNo },
            {
              id: 'date',
              header: t('columns.effectiveDate'),
              cell: (row) => formatBusinessDate(row.effectiveDate, locale),
            },
            { id: 'type', header: t('columns.type'), cell: (row) => t(`types.${row.type}`) },
            { id: 'from', header: t('columns.from'), cell: (row) => accountName(row.source) },
            { id: 'to', header: t('columns.to'), cell: (row) => accountName(row.destination) },
            {
              id: 'quantity',
              header: t('columns.quantity'),
              numeric: true,
              cell: (row) => row.quantity,
            },
            {
              id: 'hash',
              header: t('columns.hash'),
              cell: (row) => (
                <span className="font-mono text-xs text-muted" title={row.entryHash}>
                  {row.entryHash.slice(0, 12)}…
                </span>
              ),
            },
            ...(corrections.canRequest
              ? [
                  {
                    id: 'actions',
                    header: t('columns.actions'),
                    cell: (row: LedgerEntryView) =>
                      row.type === 'BLOCK' || row.type === 'UNBLOCK' ? null : (
                        <CorrectEntryButton
                          entry={row}
                          accounts={rows}
                          accountLabel={positionLabel}
                        />
                      ),
                  },
                ]
              : []),
          ]}
        />
      </section>
      <CorrectionsList issuanceId={issuanceId} rights={corrections} />
    </div>
  );
}
