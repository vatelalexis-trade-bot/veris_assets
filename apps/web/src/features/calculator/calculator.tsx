'use client';

import { parseDecimal } from '@veris/shared';
import { ChevronDown, Info, RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_INPUTS,
  type CalculatorAssumptions,
  type CalculatorInputs,
} from './assumptions';
import { BarChart } from './bar-chart';
import { calculate, readDecimal } from './calculate';

const GROUPS: [string, (keyof CalculatorInputs)[]][] = [
  ['issuance', ['issuanceVolume', 'investors']],
  [
    'operations',
    ['subscriptionsPerYear', 'transfersPerYear', 'distributionsPerYear', 'hoursPerOperation'],
  ],
  ['costs', ['hourlyCost', 'toolsCost', 'providersCost', 'incidentsCost']],
];

/** Assumptions stored as fractions ("0.6"), shown to the visitor as percentages ("60"). */
const PERCENT_ASSUMPTIONS: (keyof CalculatorAssumptions)[] = [
  'timeSavingRate',
  'toolsReduction',
  'providersReduction',
  'incidentsReduction',
  'platformVolumeRate',
];

const toPercent = (fraction: string) => parseDecimal(fraction).times(100).toString();
const fromPercent = (percent: string) => {
  const value = readDecimal(percent);
  return value ? value.dividedBy(100).toString() : percent;
};

/**
 * Business case calculator (SPEC §19): runs in the browser only, every assumption visible and
 * editable, amounts in exact decimals, results presented as indicative estimates.
 */
export function Calculator() {
  const t = useTranslations('calculator');
  const locale = useLocale();
  const [inputs, setInputs] = useState<CalculatorInputs>(DEFAULT_INPUTS);
  const [assumptions, setAssumptions] = useState<Record<keyof CalculatorAssumptions, string>>(
    () => ({
      ...DEFAULT_ASSUMPTIONS,
      ...Object.fromEntries(
        PERCENT_ASSUMPTIONS.map((key) => [key, toPercent(DEFAULT_ASSUMPTIONS[key])]),
      ),
    }),
  );
  const result = useMemo(
    () =>
      calculate(inputs, {
        ...assumptions,
        ...Object.fromEntries(
          PERCENT_ASSUMPTIONS.map((key) => [key, fromPercent(assumptions[key])]),
        ),
      } as CalculatorAssumptions),
    [inputs, assumptions],
  );

  const euros = (value: string) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value as Intl.StringNumericLiteral);
  const number = (value: string) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      value as Intl.StringNumericLiteral,
    );
  const percent = (fraction: string) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
      fraction as Intl.StringNumericLiteral,
    );
  const invalid = (value: string) => (readDecimal(value) ? undefined : t('invalid'));

  const reset = () => {
    setInputs(DEFAULT_INPUTS);
    setAssumptions({
      ...DEFAULT_ASSUMPTIONS,
      ...Object.fromEntries(
        PERCENT_ASSUMPTIONS.map((key) => [key, toPercent(DEFAULT_ASSUMPTIONS[key])]),
      ),
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <form className="flex flex-col gap-8" onSubmit={(event) => event.preventDefault()} noValidate>
        {GROUPS.map(([group, keys]) => (
          <fieldset key={group} className="flex flex-col gap-4">
            <legend className="mb-3 font-heading text-sm font-semibold tracking-wider text-muted uppercase">
              {t(`groups.${group}`)}
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {keys.map((key) => (
                <FormField key={key} label={t(`fields.${key}`)} error={invalid(inputs[key])}>
                  <Input
                    inputMode="decimal"
                    value={inputs[key]}
                    onChange={(event) => setInputs({ ...inputs, [key]: event.target.value })}
                    className="tabular-nums"
                  />
                </FormField>
              ))}
            </div>
          </fieldset>
        ))}
        <details className="group rounded-2xl border border-border bg-surface p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-heading font-semibold">
            <span className="flex items-center gap-2">
              <ChevronDown
                aria-hidden="true"
                className="size-4 text-accent transition-transform group-open:rotate-180"
              />
              {t('assumptions.title')}
            </span>
            <span className="text-xs font-normal text-muted">{t('assumptions.hint')}</span>
          </summary>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {(Object.keys(DEFAULT_ASSUMPTIONS) as (keyof CalculatorAssumptions)[]).map((key) => (
              <FormField
                key={key}
                label={t(`assumptions.${key}`)}
                error={invalid(assumptions[key])}
              >
                <Input
                  inputMode="decimal"
                  value={assumptions[key]}
                  onChange={(event) =>
                    setAssumptions({ ...assumptions, [key]: event.target.value })
                  }
                  className="tabular-nums"
                />
              </FormField>
            ))}
          </div>
        </details>
        <div>
          <Button type="button" variant="ghost" onClick={reset}>
            <RotateCcw aria-hidden="true" />
            {t('assumptions.reset')}
          </Button>
        </div>
      </form>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="relative">
          <div
            aria-hidden="true"
            className="bg-brand-gradient absolute -inset-px rounded-2xl opacity-40"
          />
          <section
            aria-labelledby="estimate-title"
            aria-live="polite"
            className="relative flex flex-col gap-6 rounded-2xl bg-surface p-6 md:p-8"
          >
            <h3 id="estimate-title" className="text-xl font-semibold">
              {t('results.title')}
            </h3>
            {result ? (
              <>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Figure
                    label={t('results.currentCost')}
                    value={euros(result.currentAnnualCost)}
                  />
                  <Figure label={t('results.savings')} value={euros(result.savings.total)} />
                  <Figure label={t('results.platformCost')} value={euros(result.platformCost)} />
                  <Figure
                    label={t('results.netSavings')}
                    value={euros(result.netSavings)}
                    tone={parseDecimal(result.netSavings).isNegative() ? 'error' : 'success'}
                    highlight
                  />
                  <Figure
                    label={t('results.roi')}
                    value={
                      result.returnOnInvestment
                        ? percent(result.returnOnInvestment)
                        : t('results.none')
                    }
                  />
                  <Figure
                    label={t('results.payback')}
                    value={
                      result.paybackMonths
                        ? t('results.paybackValue', { months: number(result.paybackMonths) })
                        : t('results.none')
                    }
                  />
                </dl>
                <p className="text-sm text-accent">
                  {t('results.hoursSaved', { hours: number(result.hoursSaved) })}
                </p>
                <BarChart
                  title={t('chart.compare')}
                  bars={[
                    {
                      label: t('chart.today'),
                      value: result.currentAnnualCost,
                      display: euros(result.currentAnnualCost),
                      tone: 'muted',
                    },
                    {
                      label: t('chart.withPlatform'),
                      value: nonNegative(result.costWithPlatform),
                      display: euros(result.costWithPlatform),
                      tone: 'primary',
                    },
                  ]}
                />
                <BarChart
                  title={t('chart.breakdown')}
                  bars={(['time', 'tools', 'providers', 'incidents'] as const).map((key) => ({
                    label: t(`chart.${key}`),
                    value: result.savings[key],
                    display: euros(result.savings[key]),
                    tone: 'accent' as const,
                  }))}
                />
                <p className="text-xs text-muted">
                  {t('results.operations', { count: number(result.operationsPerYear) })}
                </p>
              </>
            ) : (
              <p className="text-sm text-warning">{t('incomplete')}</p>
            )}
            <p className="flex gap-2 border-t border-border pt-4 text-xs text-muted">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {t('disclaimer')}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function nonNegative(value: string): string {
  return parseDecimal(value).isNegative() ? '0' : value;
}

function Figure({
  label,
  value,
  tone,
  highlight = false,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'error';
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl p-4',
        highlight ? 'border border-border bg-background' : 'bg-surface-raised',
      )}
    >
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          'mt-1 font-heading text-2xl font-semibold tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'error' && 'text-error-text',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
