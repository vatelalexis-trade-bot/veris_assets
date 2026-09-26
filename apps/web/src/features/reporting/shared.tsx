'use client';

import { useLocale } from 'next-intl';
import type { ReactNode } from 'react';
import { formatAmount } from '@/features/issuances/format';

/** One indicator: a label, a main value and an optional detail. */
export function Figure({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-heading text-xl font-semibold tabular-nums">{value}</dd>
      {detail ? <dd className="text-xs text-muted">{detail}</dd> : null}
    </div>
  );
}

/** Amounts per currency ("1 250 000,00 €"), or a dash when there is none. */
export function Amounts({ values }: { values: Record<string, string> }) {
  const locale = useLocale();
  const entries = Object.entries(values);
  if (entries.length === 0) return <>—</>;
  return (
    <>
      {entries.map(([currency, amount], index) => (
        <span key={currency}>
          {index > 0 ? ' · ' : ''}
          {formatAmount(amount, currency, locale)}
        </span>
      ))}
    </>
  );
}

/** A fraction ("0.8534") as a percentage with one decimal. */
export function percent(fraction: string | null, locale: string): string {
  if (fraction === null) return '—';
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
    fraction as Intl.StringNumericLiteral,
  );
}
