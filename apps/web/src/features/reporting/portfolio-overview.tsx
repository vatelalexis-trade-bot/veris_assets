'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { ApiError } from '@/components/app/api-error';
import { formatBusinessDate } from '@/features/issuances/format';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { Amounts, Figure } from './shared';

/** The investor's dashboard (SPEC §14.1): what it holds, receives and waits for. */
export function PortfolioOverview() {
  const t = useTranslations('reporting.portfolio');
  const tStatus = useTranslations('status');
  const locale = useLocale();
  const format = useFormatter();
  const overview = useQuery({
    queryKey: ['portfolio-overview'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/me/portfolio');
      if (error) throw error;
      return data;
    },
  });
  if (overview.isError) return <ApiError error={overview.error} />;
  if (!overview.data) return null;
  const o = overview.data;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={t('nominalHeld')} value={<Amounts values={o.nominalHeld} />} />
        <Figure label={t('positions')} value={o.positions} />
        <Figure label={t('received')} value={<Amounts values={o.distributionsReceived} />} />
        <Figure
          label={t('nextPayment')}
          value={o.nextPayment ? formatBusinessDate(o.nextPayment.date, locale) : '—'}
          detail={o.nextPayment?.code}
        />
      </dl>
      {o.pendingRequests.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold">{t('pending')}</h2>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
            {o.pendingRequests.map((row) => (
              <li key={row.resourceId} className="flex justify-between gap-3 p-3">
                <Link
                  href={`/portal/${row.kind === 'SUBSCRIPTION' ? 'subscriptions' : 'transfers'}/${row.resourceId}`}
                  className="text-primary-text hover:underline"
                >
                  {t(`kinds.${row.kind}`, { code: row.reference })}
                </Link>
                <span className="text-muted">
                  {tStatus(
                    `${row.kind === 'SUBSCRIPTION' ? 'subscription' : 'transfer'}.${row.status}`,
                  )}{' '}
                  · {format.dateTime(new Date(row.updatedAt), { dateStyle: 'medium' })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
