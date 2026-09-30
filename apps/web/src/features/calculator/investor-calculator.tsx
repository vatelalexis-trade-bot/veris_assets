'use client';

import { Info, RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  DEFAULT_INVESTOR_INPUTS,
  invalidInvestorInputs,
  simulateCoupons,
  type CouponFrequency,
  type InvestorInputs,
} from './investor-calculate';

const FREQUENCIES: CouponFrequency[] = ['1', '2', '4'];

/**
 * Coupon simulator for investors: runs in the browser only, exact decimals, and presented as an
 * illustration (before tax, not guaranteed, risk of capital loss).
 */
export function InvestorCalculator() {
  const t = useTranslations('calculator.investor');
  const locale = useLocale();
  const [inputs, setInputs] = useState<InvestorInputs>(DEFAULT_INVESTOR_INPUTS);
  const result = useMemo(() => simulateCoupons(inputs), [inputs]);
  const invalid = invalidInvestorInputs(inputs);
  const euros = (value: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(
      value as Intl.StringNumericLiteral,
    );
  const field = (key: Exclude<keyof InvestorInputs, 'frequency'>) => (
    <FormField
      label={t(`fields.${key}`)}
      error={invalid.includes(key) ? t(`invalid.${key}`) : undefined}
    >
      <Input
        inputMode="decimal"
        value={inputs[key]}
        onChange={(event) => setInputs({ ...inputs, [key]: event.target.value })}
        className="h-8 tabular-nums"
      />
    </FormField>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
      <form className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()} noValidate>
        <div className="grid grid-cols-2 items-end gap-3">
          {field('amount')}
          {field('ratePercent')}
          {field('years')}
          <FormField label={t('fields.frequency')}>
            <Select
              value={inputs.frequency}
              onChange={(event) =>
                setInputs({ ...inputs, frequency: event.target.value as CouponFrequency })
              }
              className="h-8"
            >
              {FREQUENCIES.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {t(`frequencies.${frequency}`)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setInputs(DEFAULT_INVESTOR_INPUTS)}
          >
            <RotateCcw aria-hidden="true" />
            {t('reset')}
          </Button>
        </div>
      </form>

      <section
        aria-labelledby="simulation-title"
        aria-live="polite"
        className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
      >
        <h3 id="simulation-title" className="text-base font-semibold">
          {t('title')}
        </h3>
        {result ? (
          <>
            <dl className="grid grid-cols-2 gap-2.5">
              {[
                [t('couponPerPeriod'), euros(result.couponPerPeriod)],
                [t('payments'), String(result.payments)],
                [t('totalCoupons'), euros(result.totalCoupons)],
                [t('totalReceived'), euros(result.totalReceived)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-surface-raised p-3">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 font-heading text-lg font-semibold tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div
              tabIndex={0}
              role="region"
              aria-label={t('schedule.title')}
              className="max-h-56 overflow-y-auto rounded-xl border border-border"
            >
              <table className="w-full text-sm">
                <caption className="sr-only">{t('schedule.title')}</caption>
                <thead className="sticky top-0 bg-surface-raised text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      {t('schedule.payment')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t('schedule.coupon')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t('schedule.principal')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.schedule.map((payment) => (
                    <tr key={payment.number}>
                      <th scope="row" className="px-3 py-1.5 text-left font-normal text-muted">
                        {t('schedule.month', { number: payment.number, month: payment.month })}
                      </th>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {euros(payment.coupon)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {payment.principal === '0.00' ? '—' : euros(payment.principal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-warning">{t('incomplete')}</p>
        )}
        <p className="flex gap-2 border-t border-border pt-3 text-xs text-muted">
          <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {t('disclaimer')}
        </p>
      </section>
    </div>
  );
}
