'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { ApiError } from '@/components/app/api-error';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api/client';
import { useActionLabel } from './labels';

/** Printable form of a stored value (masked values stay masked). */
function show(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="break-all">{children}</dd>
    </div>
  );
}

/** Detail of one audit entry, with the values before and after the change. */
export function AuditEventDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations('audit');
  const format = useFormatter();
  const actionLabel = useActionLabel();
  const detail = useQuery({
    queryKey: ['audit-events', 'detail', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/audit-events/{id}', {
        params: { path: { id: id! } },
      });
      if (error) throw error;
      return data;
    },
    enabled: id !== null,
  });
  const entry = detail.data;
  const fields = entry
    ? [...new Set([...Object.keys(entry.oldValue ?? {}), ...Object.keys(entry.newValue ?? {})])]
    : [];

  return (
    <Dialog.Root open={id !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(94vw,40rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6">
          <Dialog.Title className="text-lg font-semibold">
            {entry ? actionLabel(entry.action) : t('detail.title')}
          </Dialog.Title>
          <Dialog.Description className="sr-only">{t('detail.title')}</Dialog.Description>
          {detail.isError ? <ApiError error={detail.error} /> : null}
          {!entry && !detail.isError ? <Skeleton className="h-40 w-full" /> : null}
          {entry ? (
            <>
              <dl className="text-sm">
                <Row label={t('columns.occurredAt')}>
                  {format.dateTime(new Date(entry.occurredAt), {
                    dateStyle: 'full',
                    timeStyle: 'long',
                  })}
                </Row>
                <Row label={t('columns.actor')}>
                  {entry.actorName ?? (entry.actorUserId ? t('unknownActor') : t('system'))}
                  {entry.actorRole ? ` · ${entry.actorRole}` : ''}
                </Row>
                <Row label={t('columns.result')}>
                  <StatusBadge domain="auditResult" status={entry.result} />
                  {entry.reason ? (
                    <span className="ml-2 font-mono text-xs">{entry.reason}</span>
                  ) : null}
                </Row>
                <Row label={t('columns.resource')}>
                  {entry.resourceType ?? '—'}
                  {entry.resourceId ? (
                    <span className="ml-1 font-mono text-xs">{entry.resourceId}</span>
                  ) : null}
                </Row>
                <Row label={t('detail.source')}>{t(`sources.${entry.source}`)}</Row>
                <Row label={t('detail.ipAddress')}>{entry.ipAddress ?? '—'}</Row>
                <Row label={t('detail.userAgent')}>{entry.userAgent ?? '—'}</Row>
                <Row label={t('detail.correlationId')}>
                  <span className="font-mono text-xs">{entry.correlationId ?? '—'}</span>
                </Row>
              </dl>
              {fields.length > 0 ? (
                <table className="w-full text-sm">
                  <caption className="mb-2 text-left font-semibold">{t('detail.changes')}</caption>
                  <thead>
                    <tr className="text-left text-muted">
                      <th scope="col" className="py-1 font-medium">
                        {t('detail.field')}
                      </th>
                      <th scope="col" className="py-1 font-medium">
                        {t('detail.before')}
                      </th>
                      <th scope="col" className="py-1 font-medium">
                        {t('detail.after')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field) => (
                      <tr key={field} className="border-t border-border align-top">
                        <th
                          scope="row"
                          className="py-1 pr-2 text-left font-mono text-xs font-normal"
                        >
                          {field}
                        </th>
                        <td className="py-1 pr-2 break-all">{show(entry.oldValue?.[field])}</td>
                        <td className="py-1 break-all">{show(entry.newValue?.[field])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <p className="text-xs text-muted">{t('detail.masked')}</p>
            </>
          ) : null}
          <Dialog.Close asChild>
            <Button variant="secondary" className="self-end">
              {t('detail.close')}
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
