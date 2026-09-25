'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ASSET_CATEGORIES,
  ISSUANCE_STATUSES,
  type AssetCategory,
  type IssuanceStatus,
} from '@virtus/shared';
import { Plus, Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { formatAmount, formatBusinessDate } from './format';
import type { IssuanceView } from './types';

const PAGE_SIZE = 25;

/** Issuances of the organisation (P10-5): filters kept in the URL, so a view can be shared. */
export function IssuancesList({ canCreate, basePath }: { canCreate: boolean; basePath: string }) {
  const t = useTranslations('issuances');
  const tStatus = useTranslations('status.issuance');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = (params.get('status') ?? '') as '' | IssuanceStatus;
  const category = (params.get('category') ?? '') as '' | AssetCategory;
  const q = params.get('q') ?? '';
  const page = Number.parseInt(params.get('page') ?? '1', 10) || 1;
  const [search, setSearch] = useState(q);

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

  const issuances = useQuery({
    queryKey: ['issuances', status, category, q, page],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/issuances', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            ...(status ? { status } : {}),
            ...(category ? { assetCategory: category } : {}),
            ...(q ? { q } : {}),
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          role="search"
          className="flex flex-wrap gap-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setFilter({ q: search.trim() });
          }}
        >
          <Input
            type="search"
            aria-label={tCommon('search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-56"
          />
          <Select
            aria-label={t('columns.status')}
            value={status}
            className="w-48"
            onChange={(event) => setFilter({ status: event.target.value })}
          >
            <option value="">{t('allStatuses')}</option>
            {ISSUANCE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {tStatus(value)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('columns.category')}
            value={category}
            className="w-48"
            onChange={(event) => setFilter({ category: event.target.value })}
          >
            <option value="">{t('allCategories')}</option>
            {ASSET_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t(`categories.${value}`)}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            <Search aria-hidden="true" />
            {tCommon('search')}
          </Button>
        </form>
        {canCreate ? (
          <Button asChild>
            <Link href={`${basePath}/new`}>
              <Plus aria-hidden="true" />
              {t('new')}
            </Link>
          </Button>
        ) : null}
      </div>
      {issuances.isError ? <ApiError error={issuances.error} /> : null}
      <DataTable<IssuanceView>
        caption={t('caption')}
        loading={issuances.isPending}
        rows={issuances.data?.data ?? []}
        getRowId={(row) => row.id}
        emptyMessage={t('empty')}
        pagination={issuances.data?.meta}
        onPageChange={(next) => setFilter({ page: String(next) })}
        columns={[
          {
            id: 'name',
            header: t('columns.name'),
            cell: (row) => (
              <Link href={`${basePath}/${row.id}`} className="text-primary-text hover:underline">
                {row.name}
                <span className="ml-2 font-mono text-xs text-muted">{row.code}</span>
              </Link>
            ),
          },
          {
            id: 'status',
            header: t('columns.status'),
            cell: (row) => <StatusBadge domain="issuance" status={row.status} />,
          },
          {
            id: 'category',
            header: t('columns.category'),
            cell: (row) => (row.assetCategory ? t(`categories.${row.assetCategory}`) : '—'),
          },
          {
            id: 'target',
            header: t('columns.target'),
            numeric: true,
            cell: (row) => formatAmount(row.terms.targetAmount, row.currency, locale),
          },
          {
            id: 'window',
            header: t('columns.window'),
            cell: (row) =>
              `${formatBusinessDate(row.terms.subscriptionStartDate, locale)} → ${formatBusinessDate(row.terms.subscriptionEndDate, locale)}`,
          },
        ]}
      />
    </div>
  );
}
