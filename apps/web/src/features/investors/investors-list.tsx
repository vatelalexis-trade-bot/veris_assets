'use client';

import { useQuery } from '@tanstack/react-query';
import { KYC_STATUSES, type KycStatus } from '@veris/shared';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import type { InvestorView } from './types';

const PAGE_SIZE = 25;

/** Investors of the organisation, searched and filtered by the API (SPEC §8.1). */
export function InvestorsList({ canManage }: { canManage: boolean }) {
  const t = useTranslations('investors');
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('status.kyc');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [kycStatus, setKycStatus] = useState<'' | KycStatus>('');

  const investors = useQuery({
    queryKey: ['investors', page, query, kycStatus],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/investors', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            ...(query ? { q: query } : {}),
            ...(kycStatus ? { kycStatus } : {}),
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
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <Input
            type="search"
            aria-label={tCommon('search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-64"
          />
          <Select
            aria-label={t('columns.kycStatus')}
            value={kycStatus}
            className="w-52"
            onChange={(event) => {
              setPage(1);
              setKycStatus(event.target.value as '' | KycStatus);
            }}
          >
            <option value="">{t('allKycStatuses')}</option>
            {KYC_STATUSES.map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            <Search aria-hidden="true" />
            {tCommon('search')}
          </Button>
        </form>
        {canManage ? (
          <Button asChild>
            <Link href="/issuer/investors/new">
              <Plus aria-hidden="true" />
              {t('new')}
            </Link>
          </Button>
        ) : null}
      </div>
      {investors.isError ? <ApiError error={investors.error} /> : null}
      <DataTable<InvestorView>
        caption={t('caption')}
        loading={investors.isPending}
        rows={investors.data?.data ?? []}
        getRowId={(row) => row.id}
        emptyMessage={t('empty')}
        pagination={investors.data?.meta}
        onPageChange={setPage}
        columns={[
          {
            id: 'legalName',
            header: t('columns.legalName'),
            cell: (row) => (
              <Link
                href={`/issuer/investors/${row.id}`}
                className="text-primary-text hover:underline"
              >
                {row.legalName}
              </Link>
            ),
          },
          {
            id: 'country',
            header: t('columns.country'),
            cell: (row) => row.countryOfIncorporation,
          },
          {
            id: 'classification',
            header: t('columns.classification'),
            cell: (row) => t(`classification.${row.classification}`),
          },
          {
            id: 'profileStatus',
            header: t('columns.profileStatus'),
            cell: (row) => t(`profileStatus.${row.profileStatus}`),
          },
          {
            id: 'kycStatus',
            header: t('columns.kycStatus'),
            cell: (row) => <StatusBadge domain="kyc" status={row.kycStatus} />,
          },
          {
            id: 'kycExpiryDate',
            header: t('columns.kycExpiryDate'),
            cell: (row) => row.kycExpiryDate ?? '—',
          },
        ]}
      />
    </div>
  );
}
