'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { DataTable } from '@/components/app/data-table';
import { PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadDocument } from '@/features/documents/api';
import { formatAmount, formatBusinessDate, formatRate } from '@/features/issuances/format';
import type { LedgerEntryView } from '@/features/registry/types';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

/** One position of the investor (SPEC §14.3). */
export function PositionDetail({ id }: { id: string }) {
  const t = useTranslations('reporting.position');
  const tRegistry = useTranslations('registry');
  const tFrequency = useTranslations('issuances.frequencies');
  const locale = useLocale();
  const detail = useQuery({
    queryKey: ['portfolio-position', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/me/portfolio/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
  if (detail.isError) return <ApiError error={detail.error} />;
  if (!detail.data) return <Skeleton className="h-60 w-full" />;
  const { position: p, movements, distributions } = detail.data;
  const money = (value: string | null) => formatAmount(value, p.currency, locale);
  const rows: [string, string][] = [
    [t('issuer'), p.legalIssuerName ?? '—'],
    [t('held'), p.quantityHeld],
    [t('blocked'), p.quantityBlocked],
    [t('nominalValue'), money(p.nominalValue)],
    [t('nominalAmount'), money(p.nominalAmount)],
    [t('invested'), money(p.acquisitionAmount)],
    [t('rate'), formatRate(p.interestRate, locale)],
    [t('frequency'), p.distributionFrequency ? tFrequency(p.distributionFrequency) : '—'],
    [t('maturity'), formatBusinessDate(p.maturityDate, locale)],
    [t('nextPayment'), formatBusinessDate(p.nextPaymentDate, locale)],
  ];
  const side = (value: LedgerEntryView['source']) =>
    value.type === null
      ? '—'
      : value.type === 'ISSUER_TREASURY'
        ? tRegistry('treasury')
        : (value.investorName ?? tRegistry('otherInvestor'));
  return (
    <div className="flex flex-col gap-6">
      <Link href="/portal/portfolio" className="text-sm text-primary-text hover:underline">
        ← {t('back')}
      </Link>
      <PageHeader
        title={p.name}
        description={p.code}
        actions={<StatusBadge domain="issuance" status={p.status as never} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 font-heading font-semibold">{t('summary')}</h2>
          <dl className="flex flex-col text-sm">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-3 border-b border-border py-1 last:border-0"
              >
                <dt className="text-muted">{label}</dt>
                <dd className="text-right tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 font-heading font-semibold">{t('distributions')}</h2>
          {distributions.length === 0 ? (
            <p className="text-sm text-muted">{t('noDistribution')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {distributions.map((row) => (
                <li key={row.distributionId} className="flex justify-between gap-3 py-2">
                  <Link
                    href={`/portal/distributions/${row.distributionId}`}
                    className="text-primary-text hover:underline"
                  >
                    {formatBusinessDate(row.paymentDate, locale)}
                  </Link>
                  <span className="tabular-nums">
                    {formatAmount(row.grossAmount, row.currency, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <PositionDocuments issuanceId={p.issuanceId} />
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">{t('movements')}</h2>
        <DataTable<LedgerEntryView>
          caption={t('movements')}
          rows={movements}
          getRowId={(row) => row.id}
          emptyMessage={t('noMovement')}
          columns={[
            {
              id: 'date',
              header: tRegistry('columns.effectiveDate'),
              cell: (row) => formatBusinessDate(row.effectiveDate, locale),
            },
            {
              id: 'type',
              header: tRegistry('columns.type'),
              cell: (row) => tRegistry(`types.${row.type}`),
            },
            { id: 'from', header: tRegistry('columns.from'), cell: (row) => side(row.source) },
            { id: 'to', header: tRegistry('columns.to'), cell: (row) => side(row.destination) },
            {
              id: 'quantity',
              header: tRegistry('columns.quantity'),
              numeric: true,
              cell: (row) => row.quantity,
            },
          ]}
        />
      </section>
    </div>
  );
}

/**
 * Documents of the issuance (SPEC §14.3). Visible to the invited investors (D-055); a holder who
 * received its units by transfer asks the issuer.
 */
function PositionDocuments({ issuanceId }: { issuanceId: string }) {
  const t = useTranslations('reporting.position');
  const tIssuances = useTranslations('issuances');
  const [error, setError] = useState<unknown>(null);
  const documents = useQuery({
    queryKey: ['issuance', issuanceId, 'documents'],
    retry: false,
    queryFn: async () => {
      const { data, error: failure } = await api.GET('/api/v1/issuances/{id}/documents', {
        params: { path: { id: issuanceId } },
      });
      if (failure) throw failure;
      return data;
    },
  });
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-lg font-semibold">{t('documents')}</h2>
      {documents.isError ? <p className="text-sm text-muted">{t('documentsFromIssuer')}</p> : null}
      {documents.data?.length === 0 ? (
        <p className="text-sm text-muted">{t('noDocument')}</p>
      ) : null}
      {error ? <ApiError error={error} /> : null}
      <ul className="flex flex-col divide-y divide-border text-sm">
        {(documents.data ?? []).map((item) => (
          <li key={item.documentId} className="flex items-center justify-between gap-2 py-2">
            <span>
              {item.name} ·{' '}
              <span className="text-muted">{tIssuances(`documentKinds.${item.kind}`)}</span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => setError(await downloadDocument(item.documentId))}
            >
              {tIssuances('download')}
              <span className="sr-only"> {item.name}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
