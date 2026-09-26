'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { ApiError } from '@/components/app/api-error';
import { EmptyState } from '@/components/app/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBusinessDate } from '@/features/issuances/format';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

/** Where each kind of task is handled. */
const PATHS: Record<string, string> = {
  subscription: '/issuer/subscriptions',
  investor: '/issuer/investors',
  issuance: '/issuer/issuances',
  transfer: '/issuer/transfers',
  distribution: '/issuer/distributions',
};

/** The "To do" queue (SPEC §13.5): the decisions waiting for the user, most urgent first. */
export function TasksQueue() {
  const t = useTranslations('reporting.tasks');
  const locale = useLocale();
  const format = useFormatter();
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/tasks');
      if (error) throw error;
      return data;
    },
  });
  if (tasks.isError) return <ApiError error={tasks.error} />;
  if (!tasks.data) return <Skeleton className="h-40 w-full" />;
  if (tasks.data.length === 0)
    return <EmptyState title={t('empty')} description={t('emptyDescription')} />;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {tasks.data.map((row) => (
        <li
          key={`${row.kind}-${row.resourceId}`}
          className="flex flex-wrap items-center justify-between gap-3 p-4"
        >
          <div className="flex flex-col">
            <Link
              href={`${PATHS[row.resourceType] ?? '/issuer'}/${row.resourceId}`}
              className="font-medium text-primary-text hover:underline"
            >
              {t(`kinds.${row.kind}`)}
            </Link>
            <span className="text-sm text-muted">{row.reference ?? '—'}</span>
          </div>
          <div className="text-right text-sm text-muted">
            {row.dueDate ? (
              <p>{t('due', { date: formatBusinessDate(row.dueDate, locale) })}</p>
            ) : null}
            {row.waitingSince ? (
              <p>
                {t('waitingSince', {
                  date: format.dateTime(new Date(row.waitingSince), { dateStyle: 'medium' }),
                })}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
