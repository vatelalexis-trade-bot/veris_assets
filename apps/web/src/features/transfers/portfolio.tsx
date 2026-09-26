'use client';

import { useQuery } from '@tanstack/react-query';
import { parseDecimal } from '@virtus/shared';
import { useLocale, useTranslations } from 'next-intl';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { Button } from '@/components/ui/button';
import { formatAmount } from '@/features/issuances/format';
import type { PositionView } from '@/features/registry/types';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { TransfersList } from './transfers-list';

/** The investor's positions (SPEC §14.2) and its transfer requests (SPEC §11). */
export function Portfolio({ canTransfer }: { canTransfer: boolean }) {
  const t = useTranslations('transfers.portfolio');
  const locale = useLocale();
  const positions = useQuery({
    queryKey: ['positions', 'own'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/positions', {
        params: { query: { pageSize: 100 } },
      });
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        {positions.isError ? <ApiError error={positions.error} /> : null}
        <DataTable<PositionView>
          caption={t('caption')}
          loading={positions.isPending}
          rows={positions.data?.data ?? []}
          getRowId={(row) => row.id}
          emptyMessage={t('empty')}
          columns={[
            {
              id: 'issuance',
              header: t('columns.issuance'),
              cell: (row) => (
                <>
                  {row.issuanceName}
                  <span className="ml-2 font-mono text-xs text-muted">{row.issuanceCode}</span>
                </>
              ),
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
              id: 'amount',
              header: t('columns.acquisitionAmount'),
              numeric: true,
              cell: (row) => formatAmount(row.acquisitionAmount, row.currency, locale),
            },
            ...(canTransfer
              ? [
                  {
                    id: 'actions',
                    header: t('columns.actions'),
                    cell: (row: PositionView) =>
                      parseDecimal(row.quantityAvailable).gt(0) ? (
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/portal/transfers/new?issuanceId=${row.issuanceId}`}>
                            {t('transfer')}
                            <span className="sr-only"> {row.issuanceName}</span>
                          </Link>
                        </Button>
                      ) : null,
                  },
                ]
              : []),
          ]}
        />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">{t('requests')}</h2>
        <TransfersList basePath="/portal/transfers" staff={false} />
      </section>
    </div>
  );
}
