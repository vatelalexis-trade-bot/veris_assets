'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import type { TenantView } from './types';

const PAGE_SIZE = 25;

/** Organisations of the platform, searched and paginated by the API. */
export function TenantsList({ canManage }: { canManage: boolean }) {
  const t = useTranslations('tenants');
  const tTypes = useTranslations('organizationTypes');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  const tenants = useQuery({
    queryKey: ['tenants', page, query],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/tenants', {
        params: { query: { page, pageSize: PAGE_SIZE, ...(query ? { q: query } : {}) } },
      });
      if (error) throw error;
      return data;
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={submit} role="search" className="flex gap-2">
          <Input
            type="search"
            aria-label={tCommon('search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-64"
          />
          <Button type="submit" variant="secondary">
            <Search aria-hidden="true" />
            {tCommon('search')}
          </Button>
        </form>
        {canManage ? (
          <Button asChild>
            <Link href="/platform/tenants/new">
              <Plus aria-hidden="true" />
              {t('new')}
            </Link>
          </Button>
        ) : null}
      </div>
      {tenants.isError ? <ApiError error={tenants.error} /> : null}
      <DataTable<TenantView>
        caption={t('caption')}
        loading={tenants.isPending}
        rows={tenants.data?.data ?? []}
        getRowId={(row) => row.id}
        pagination={
          tenants.data ? { page, pageSize: PAGE_SIZE, total: tenants.data.meta.total } : undefined
        }
        onPageChange={setPage}
        columns={[
          {
            id: 'legalName',
            header: t('columns.legalName'),
            cell: (row) => (
              <Link
                href={`/platform/tenants/${row.id}`}
                className="text-primary-text hover:underline"
              >
                {row.legalName}
              </Link>
            ),
          },
          { id: 'country', header: t('columns.country'), cell: (row) => row.countryCode },
          { id: 'type', header: t('columns.type'), cell: (row) => tTypes(row.organizationType) },
          { id: 'status', header: t('columns.status'), cell: (row) => t(`status.${row.status}`) },
          {
            id: 'createdAt',
            header: t('columns.createdAt'),
            cell: (row) => format.dateTime(new Date(row.createdAt), { dateStyle: 'medium' }),
          },
        ]}
      />
    </div>
  );
}
