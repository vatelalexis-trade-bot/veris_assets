'use client';

import { useQuery } from '@tanstack/react-query';
import { parseDecimal } from '@virtus/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { ApiError } from '@/components/app/api-error';
import { StatusBadge } from '@/components/app/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAmount, formatBusinessDate } from '@/features/issuances/format';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { Amounts, Figure, percent } from './shared';

/** The issuer's dashboard (SPEC §13.1) with the indicators of SPEC §18. */
export function IssuerDashboard() {
  const t = useTranslations('reporting.dashboard');
  const tAudit = useTranslations('audit.actions');
  const tSchedule = useTranslations('distributions.schedule.types');
  const locale = useLocale();
  const format = useFormatter();
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/dashboard');
      if (error) throw error;
      return data;
    },
  });
  if (dashboard.isError) return <ApiError error={dashboard.error} />;
  if (!dashboard.data) return <Skeleton className="h-80 w-full" />;
  const d = dashboard.data;
  return (
    <div className="flex flex-col gap-8">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={t('administered')} value={<Amounts values={d.administered} />} />
        <Figure
          label={t('issuances')}
          value={d.issuances}
          detail={t('activeIssuances', { count: d.activeIssuances })}
        />
        <Figure
          label={t('subscribed')}
          value={<Amounts values={d.subscribed} />}
          detail={t('subscriptionRate', { rate: percent(d.subscriptionRate, locale) })}
        />
        <Figure label={t('allocated')} value={<Amounts values={d.allocated} />} />
        <Figure
          label={t('investors')}
          value={d.investors}
          detail={t('investorsDetail', {
            holders: d.holders,
            eligible: d.eligibleInvestors,
            rate: percent(d.investorValidationRate, locale),
          })}
        />
        <Figure label={t('averageTicket')} value={<Amounts values={d.averageTicket} />} />
        <Figure label={t('distributed')} value={<Amounts values={d.distributed} />} />
        <Figure
          label={t('pending')}
          value={
            <Link href="/issuer/tasks" className="text-primary-text hover:underline">
              {d.pendingOperations}
            </Link>
          }
          detail={t('pendingDetail', {
            subscriptions: d.pendingSubscriptions,
            payments: d.pendingPayments,
            transfers: d.pendingTransfers,
          })}
        />
      </dl>
      {d.kycExpiring > 0 ? (
        <p role="status" className="rounded-lg border border-warning/40 p-3 text-sm">
          {t('kycExpiring', { count: d.kycExpiring })}{' '}
          <Link href="/issuer/investors" className="text-primary-text hover:underline">
            {t('seeInvestors')}
          </Link>
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold">{t('upcoming')}</h2>
          {d.upcomingPayments.length === 0 ? (
            <p className="text-sm text-muted">{t('noUpcoming')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
              {d.upcomingPayments.map((row) => (
                <li key={row.scheduleId} className="flex items-center justify-between gap-3 p-3">
                  <span>
                    <Link
                      href={`/issuer/issuances/${row.issuanceId}`}
                      className="text-primary-text hover:underline"
                    >
                      {row.name}
                    </Link>{' '}
                    · {tSchedule(row.type)} {row.sequence}
                  </span>
                  <span className={row.overdue ? 'font-medium text-error-text' : 'text-muted'}>
                    {formatBusinessDate(row.paymentDate, locale)}
                    {row.overdue ? ` · ${t('overdue')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold">{t('activity')}</h2>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
            {d.recentActivity.map((row) => (
              <li key={row.id} className="flex justify-between gap-3 p-3">
                <span>{tAudit.has(row.action) ? tAudit(row.action) : row.action}</span>
                <span className="text-right text-muted">
                  {row.actorName ?? t('system')} ·{' '}
                  {format.dateTime(new Date(row.occurredAt), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/issuer/audit" className="text-sm text-primary-text hover:underline">
            {t('fullLog')}
          </Link>
        </section>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">{t('issuanceTable')}</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('issuanceTable')}</caption>
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {t('columns.issuance')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('columns.status')}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {t('columns.target')}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {t('columns.subscribed')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('columns.progress')}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {t('columns.holders')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('columns.maturity')}
                </th>
              </tr>
            </thead>
            <tbody>
              {d.issuanceRows.map((row) => {
                // Whole percentage, computed in exact decimals, at most 100 for the bar.
                const whole =
                  row.progress === null
                    ? 0
                    : Number.parseInt(
                        parseDecimal(row.progress).times(100).toDecimalPlaces(0).toString(),
                        10,
                      );
                const progress = whole > 100 ? 100 : whole;
                return (
                  <tr key={row.issuanceId} className="border-t border-border">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <Link
                        href={`/issuer/issuances/${row.issuanceId}`}
                        className="text-primary-text hover:underline"
                      >
                        {row.name}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-muted">{row.code}</span>
                    </th>
                    <td className="px-3 py-2">
                      <StatusBadge domain="issuance" status={row.status as never} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatAmount(row.target, row.currency, locale)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatAmount(row.subscribed, row.currency, locale)}
                    </td>
                    <td className="px-3 py-2">
                      <progress
                        aria-label={t('columns.progress')}
                        max={100}
                        value={progress}
                        className="h-2 w-28 accent-primary"
                      />
                      <span className="text-xs text-muted">{percent(row.progress, locale)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.holders}</td>
                    <td className="px-3 py-2">{formatBusinessDate(row.maturityDate, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
