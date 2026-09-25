'use client';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import type { operations } from '@/lib/api/schema';
import { downloadDocument } from './api';

type Row =
  operations['DocumentsController_list']['responses'][200]['content']['application/json']['data'][number];

const PAGE_SIZE = 25;

/** Size in a readable unit (kB, MB). */
function readableSize(bytes: number, format: ReturnType<typeof useFormatter>): string {
  return bytes >= 1024 * 1024
    ? `${format.number(bytes / (1024 * 1024), { maximumFractionDigits: 1 })} MB`
    : `${format.number(Math.max(1, Math.round(bytes / 1024)))} kB`;
}

/** Documents the user may see (filtered by investor when given), with their download. */
export function DocumentsTable({ investorId }: { investorId?: string }) {
  const t = useTranslations('documents');
  const format = useFormatter();
  const [page, setPage] = useState(1);
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const documents = useQuery({
    queryKey: ['documents', investorId ?? 'all', page],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/documents', {
        params: { query: { page, pageSize: PAGE_SIZE, ...(investorId ? { investorId } : {}) } },
      });
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="flex flex-col gap-3">
      {documents.isError ? <ApiError error={documents.error} /> : null}
      {downloadError ? <ApiError error={downloadError} /> : null}
      <DataTable<Row>
        caption={t('caption')}
        loading={documents.isPending}
        rows={documents.data?.data ?? []}
        getRowId={(row) => row.id}
        emptyMessage={t('empty')}
        pagination={documents.data?.meta}
        onPageChange={setPage}
        columns={[
          { id: 'name', header: t('columns.name'), cell: (row) => row.name },
          { id: 'type', header: t('columns.type'), cell: (row) => t(`types.${row.type}`) },
          {
            id: 'confidentiality',
            header: t('columns.confidentiality'),
            cell: (row) => t(`confidentiality.${row.confidentiality}`),
          },
          {
            id: 'file',
            header: t('columns.file'),
            cell: (row) => (
              <span className="text-xs text-muted">
                {row.current.fileName} · {readableSize(row.current.sizeBytes, format)} · v
                {row.currentVersion}
              </span>
            ),
          },
          {
            id: 'uploadedAt',
            header: t('columns.uploadedAt'),
            cell: (row) =>
              format.dateTime(new Date(row.current.uploadedAt), { dateStyle: 'medium' }),
          },
          {
            id: 'download',
            header: t('columns.download'),
            cell: (row) => (
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => setDownloadError(await downloadDocument(row.id))}
              >
                <Download aria-hidden="true" />
                <span className="sr-only">{row.name}</span>
                {t('download')}
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
