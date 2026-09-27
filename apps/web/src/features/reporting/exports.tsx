'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EXPORT_KINDS, type ExportKind } from '@veris/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { FormField } from '@/components/app/form-field';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { downloadDocument } from '@/features/documents/api';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import type { operations } from '@/lib/api/schema';

type ExportView =
  operations['ExportsController_get']['responses'][200]['content']['application/json'];

/** Checked again every few seconds while an export is being generated. */
const REFRESH_MS = 3000;

/**
 * CSV exports (SPEC §18, P15-3): asked for here, generated in the background, then downloaded.
 * The user is also notified when an export is ready.
 */
export function Exports() {
  const t = useTranslations('reporting.exports');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ExportKind>('REGISTRY');
  const [issuanceId, setIssuanceId] = useState('');
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const send = useIdempotencyKey();

  const issuances = useQuery({
    queryKey: ['issuances', 'export-options'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/issuances', {
        params: { query: { pageSize: 100 } },
      });
      if (error) throw error;
      return data.data;
    },
  });
  const exports = useQuery({
    queryKey: ['exports'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/exports');
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) =>
      query.state.data?.some((row) => row.status === 'QUEUED' || row.status === 'RUNNING')
        ? REFRESH_MS
        : false,
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/exports', {
        params: { header: send.header() },
        body: { kind, ...(issuanceId && kind !== 'AUDIT' ? { issuanceId } : {}) },
      });
      send.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exports'] }),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };
  const codeOf = (id: string | null) =>
    id ? (issuances.data?.find((row) => row.id === id)?.code ?? '—') : t('allIssuances');

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-wrap items-end gap-4" onSubmit={onSubmit} noValidate>
        <FormField label={t('kind')}>
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value as ExportKind)}
            className="w-64"
          >
            {EXPORT_KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`kinds.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>
        {kind === 'AUDIT' ? null : (
          <FormField label={t('issuance')}>
            <Select
              value={issuanceId}
              onChange={(event) => setIssuanceId(event.target.value)}
              className="w-72"
            >
              <option value="">{t('allIssuances')}</option>
              {(issuances.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.code})
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <Button type="submit" disabled={create.isPending}>
          {t('submit')}
        </Button>
      </form>
      <p className="text-sm text-muted">{t('hint')}</p>
      {create.isError ? <ApiError error={create.error} /> : null}
      {exports.isError ? <ApiError error={exports.error} /> : null}
      {downloadError ? <ApiError error={downloadError} /> : null}
      <DataTable<ExportView>
        caption={t('caption')}
        loading={exports.isPending}
        rows={exports.data ?? []}
        getRowId={(row) => row.id}
        emptyMessage={t('empty')}
        columns={[
          { id: 'kind', header: t('columns.kind'), cell: (row) => t(`kinds.${row.kind}`) },
          {
            id: 'issuance',
            header: t('columns.issuance'),
            cell: (row) => <span className="font-mono text-xs">{codeOf(row.issuanceId)}</span>,
          },
          {
            id: 'createdAt',
            header: t('columns.createdAt'),
            cell: (row) =>
              format.dateTime(new Date(row.createdAt), { dateStyle: 'medium', timeStyle: 'short' }),
          },
          {
            id: 'rows',
            header: t('columns.rows'),
            numeric: true,
            cell: (row) => (row.rowCount === null ? '—' : format.number(row.rowCount)),
          },
          {
            id: 'status',
            header: t('columns.status'),
            cell: (row) => <StatusBadge domain="export" status={row.status} />,
          },
          {
            id: 'download',
            header: t('columns.file'),
            cell: (row) =>
              row.documentId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => setDownloadError(await downloadDocument(row.documentId!))}
                >
                  {t('download')}
                </Button>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
