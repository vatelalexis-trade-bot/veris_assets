'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ApiError } from '@/components/app/api-error';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAmount } from '@/features/issuances/format';
import { api } from '@/lib/api/client';
import { Figure } from './shared';

/** Indicators of the whole platform (SPEC §18), for the Platform Administrator. */
export function PlatformMetrics() {
  const t = useTranslations('reporting.platform');
  const locale = useLocale();
  const metrics = useQuery({
    queryKey: ['platform-metrics'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/platform/metrics');
      if (error) throw error;
      return data;
    },
  });
  if (metrics.isError) return <ApiError error={metrics.error} />;
  if (!metrics.data) return <Skeleton className="h-60 w-full" />;
  const m = metrics.data;
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Figure label={t('organisations')} value={m.organisations} />
      <Figure label={t('activeUsers')} value={m.activeUsers} />
      <Figure
        label={t('issuances')}
        value={m.issuances}
        detail={t('active', { count: m.activeIssuances })}
      />
      <Figure label={t('investors')} value={m.investors} />
      <Figure
        label={t('nominalAdministered')}
        value={formatAmount(m.nominalAdministered, 'EUR', locale)}
      />
      <Figure label={t('ledgerOperations')} value={m.ledgerOperations} />
      <Figure label={t('failures')} value={m.failures30Days} />
      <Figure
        label={t('decisionTime')}
        value={
          m.averageDecisionHours === null
            ? '—'
            : t('hours', { hours: formatAmount(m.averageDecisionHours, null, locale) })
        }
      />
    </dl>
  );
}
