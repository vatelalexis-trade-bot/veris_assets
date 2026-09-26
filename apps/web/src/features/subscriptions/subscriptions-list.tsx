'use client';

import { useQuery } from '@tanstack/react-query';
import { STATUS_TONES } from '@virtus/shared';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { StatusBadge } from '@/components/app/status-badge';
import { Select } from '@/components/ui/select';
import { formatAmount } from '@/features/issuances/format';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import type { SubscriptionStatus, SubscriptionView } from './types';

const PAGE_SIZE = 25;
const STATUSES = Object.keys(STATUS_TONES.subscription) as SubscriptionStatus[];

/**
 * Subscriptions: all those of the organisation for the issuer, its own for an investor (the API
 * applies the scope). Filters are kept in the URL, so a view can be shared.
 */
export function SubscriptionsList({
  basePath,
  showInvestor,
}: {
  basePath: string;
  showInvestor: boolean;
}) {
  const t = useTranslations('subscriptions');
  const tStatus = useTranslations('status.subscription');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = (params.get('status') ?? '') as '' | SubscriptionStatus;
  const issuanceId = params.get('issuanceId') ?? '';
  const page = Number.parseInt(params.get('page') ?? '1', 10) || 1;

  const setFilter = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [name, value] of Object.entries(changes)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    if (!('page' in changes)) next.delete('page');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const subscriptions = useQuery({
    queryKey: ['subscriptions', status, issuanceId, page],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/subscriptions', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            ...(status ? { status } : {}),
            ...(issuanceId ? { issuanceId } : {}),
          },
        },
      });
      if (error) throw error;
      return data;
    },
    placeholderData: (previous) => previous,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Select
          aria-label={t('columns.status')}
          value={status}
          className="w-52"
          onChange={(event) => setFilter({ status: event.target.value })}
        >
          <option value="">{t('allStatuses')}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {tStatus(value)}
            </option>
          ))}
        </Select>
        {issuanceId ? (
          <button
            type="button"
            className="text-sm text-primary-text hover:underline"
            onClick={() => setFilter({ issuanceId: '' })}
          >
            {t('allIssuances')}
          </button>
        ) : null}
      </div>
      {subscriptions.isError ? <ApiError error={subscriptions.error} /> : null}
      <DataTable<SubscriptionView>
        caption={t('caption')}
        loading={subscriptions.isPending}
        rows={subscriptions.data?.data ?? []}
        getRowId={(row) => row.id}
        emptyMessage={t('empty')}
        pagination={subscriptions.data?.meta}
        onPageChange={(next) => setFilter({ page: String(next) })}
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
          ...(showInvestor
            ? [
                {
                  id: 'investor',
                  header: t('columns.investor'),
                  cell: (row: SubscriptionView) => row.investorName,
                },
              ]
            : []),
          {
            id: 'units',
            header: t('columns.units'),
            numeric: true,
            cell: (row) => row.requestedUnits,
          },
          {
            id: 'amount',
            header: t('columns.amount'),
            numeric: true,
            cell: (row) => formatAmount(row.requestedAmount, row.currency, locale),
          },
          {
            id: 'status',
            header: t('columns.status'),
            cell: (row) => <StatusBadge domain="subscription" status={row.status} />,
          },
          {
            id: 'submittedAt',
            header: t('columns.submittedAt'),
            cell: (row) =>
              row.submittedAt
                ? format.dateTime(new Date(row.submittedAt), { dateStyle: 'medium' })
                : '—',
          },
        ]}
      />
    </div>
  );
}
