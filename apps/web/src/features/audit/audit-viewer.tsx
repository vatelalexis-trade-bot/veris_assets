'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { FormField } from '@/components/app/form-field';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api/client';
import type { operations } from '@/lib/api/schema';
import { AuditEventDetail } from './audit-event-detail';
import { useActionLabel } from './labels';

type AuditEvent =
  operations['AuditEventsController_list']['responses'][200]['content']['application/json']['data'][number];
type Result = AuditEvent['result'];

interface Filters {
  action: string;
  result: '' | Result;
  /** Days chosen by the user (yyyy-mm-dd, local time). */
  from: string;
  to: string;
}

const EMPTY: Filters = { action: '', result: '', from: '', to: '' };
const PAGE_SIZE = 25;

/** Start of a local day, in UTC for the API; `nextDay` gives the exclusive end of the period. */
function dayStart(day: string, nextDay = false): string {
  const date = new Date(`${day}T00:00:00`);
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

/** Audit log of the organisation (SPEC §17, AuditViewer of docs/ARCHITECTURE.md). Read-only. */
export function AuditViewer() {
  const t = useTranslations('audit');
  const format = useFormatter();
  const actionLabel = useActionLabel();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const actions = useQuery({
    queryKey: ['audit-events', 'actions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/audit-events/actions');
      if (error) throw error;
      return data;
    },
  });
  const events = useQuery({
    queryKey: ['audit-events', filters, page],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/audit-events', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            ...(filters.action ? { action: filters.action } : {}),
            ...(filters.result ? { result: filters.result } : {}),
            ...(filters.from ? { from: dayStart(filters.from) } : {}),
            ...(filters.to ? { to: dayStart(filters.to, true) } : {}),
          },
        },
      });
      if (error) throw error;
      return data;
    },
    placeholderData: (previous) => previous,
  });

  const apply = (event: FormEvent) => {
    event.preventDefault();
    setFilters(draft);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={apply}
        className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
        aria-label={t('filters.title')}
      >
        <FormField label={t('filters.action')}>
          <Select
            value={draft.action}
            onChange={(event) => setDraft({ ...draft, action: event.target.value })}
          >
            <option value="">{t('filters.all')}</option>
            {(actions.data ?? []).map((action) => (
              <option key={action} value={action}>
                {actionLabel(action)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('filters.result')}>
          <Select
            value={draft.result}
            onChange={(event) =>
              setDraft({ ...draft, result: event.target.value as Filters['result'] })
            }
          >
            <option value="">{t('filters.all')}</option>
            {(['SUCCESS', 'DENIED', 'FAILED'] as const).map((result) => (
              <option key={result} value={result}>
                {t(`results.${result}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('filters.from')}>
          <Input
            type="date"
            value={draft.from}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          />
        </FormField>
        <FormField label={t('filters.to')}>
          <Input
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
        </FormField>
        <div className="flex gap-2">
          <Button type="submit">{t('filters.apply')}</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY);
              setFilters(EMPTY);
              setPage(1);
            }}
          >
            {t('filters.reset')}
          </Button>
        </div>
      </form>

      {events.isError ? <ApiError error={events.error} /> : null}
      <DataTable<AuditEvent>
        caption={t('caption')}
        loading={events.isPending}
        rows={events.data?.data ?? []}
        getRowId={(row) => row.id}
        emptyMessage={t('empty')}
        pagination={events.data?.meta}
        onPageChange={setPage}
        columns={[
          {
            id: 'occurredAt',
            header: t('columns.occurredAt'),
            cell: (row) =>
              format.dateTime(new Date(row.occurredAt), {
                dateStyle: 'medium',
                timeStyle: 'medium',
              }),
          },
          {
            id: 'actor',
            header: t('columns.actor'),
            cell: (row) => row.actorName ?? (row.actorUserId ? t('unknownActor') : t('system')),
          },
          { id: 'action', header: t('columns.action'), cell: (row) => actionLabel(row.action) },
          {
            id: 'resource',
            header: t('columns.resource'),
            cell: (row) =>
              row.resourceType ? (
                <span>
                  {t.has(`resources.${row.resourceType}`)
                    ? t(`resources.${row.resourceType}`)
                    : row.resourceType}
                  {row.resourceId ? (
                    <span className="ml-1 font-mono text-xs text-muted">
                      {row.resourceId.slice(0, 8)}
                    </span>
                  ) : null}
                </span>
              ) : (
                '—'
              ),
          },
          {
            id: 'result',
            header: t('columns.result'),
            cell: (row) => <StatusBadge domain="auditResult" status={row.result} />,
          },
          {
            id: 'details',
            header: t('columns.details'),
            cell: (row) => (
              <Button size="sm" variant="secondary" onClick={() => setSelected(row.id)}>
                {t('open')}
                <span className="sr-only"> {actionLabel(row.action)}</span>
              </Button>
            ),
          },
        ]}
      />
      <AuditEventDetail id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
