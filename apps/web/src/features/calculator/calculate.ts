import { parseDecimal, type Decimal } from '@veris/shared';
import type { CalculatorAssumptions, CalculatorInputs } from './assumptions';

export interface CalculatorResult {
  /** Manual operations per year: subscriptions, transfers, and one payment per investor for
   *  each distribution. */
  operationsPerYear: string;
  currentAnnualCost: string;
  hoursSaved: string;
  /** Gross savings, by source. */
  savings: { time: string; tools: string; providers: string; incidents: string; total: string };
  platformCost: string;
  netSavings: string;
  costWithPlatform: string;
  /** Net savings ÷ platform cost, as a fraction; null when the platform costs nothing. */
  returnOnInvestment: string | null;
  /** Months of gross savings that pay the platform for a year; null without savings. */
  paybackMonths: string | null;
}

const DECIMAL = /^\d{1,15}(\.\d{1,6})?$/;

/** A valid, non-negative decimal as typed by the visitor ("1 250,50" is accepted), else null. */
export function readDecimal(value: string): Decimal | null {
  const normalized = value.replace(/[\s  ]/g, '').replace(',', '.');
  return DECIMAL.test(normalized) ? parseDecimal(normalized) : null;
}

/** Null when a value is missing or invalid: the page then shows which one. */
export function calculate(
  inputs: CalculatorInputs,
  assumptions: CalculatorAssumptions,
): CalculatorResult | null {
  const values = { ...inputs, ...assumptions };
  const read = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, readDecimal(value)]),
  ) as Record<keyof typeof values, Decimal | null>;
  if (Object.values(read).some((value) => value === null)) return null;
  const v = read as Record<keyof typeof values, Decimal>;

  const operations = v.subscriptionsPerYear
    .plus(v.transfersPerYear)
    .plus(v.distributionsPerYear.times(v.investors));
  const manualHours = operations.times(v.hoursPerOperation);
  const currentAnnualCost = manualHours
    .times(v.hourlyCost)
    .plus(v.toolsCost)
    .plus(v.providersCost)
    .plus(v.incidentsCost);
  const hoursSaved = manualHours.times(v.timeSavingRate);
  const time = hoursSaved.times(v.hourlyCost);
  const tools = v.toolsCost.times(v.toolsReduction);
  const providers = v.providersCost.times(v.providersReduction);
  const incidents = v.incidentsCost.times(v.incidentsReduction);
  const total = time.plus(tools).plus(providers).plus(incidents);
  const platformCost = v.platformAnnualFee.plus(v.issuanceVolume.times(v.platformVolumeRate));
  const netSavings = total.minus(platformCost);
  const money = (value: Decimal) => value.toFixed(2);
  return {
    operationsPerYear: operations.toString(),
    currentAnnualCost: money(currentAnnualCost),
    hoursSaved: hoursSaved.toFixed(0),
    savings: {
      time: money(time),
      tools: money(tools),
      providers: money(providers),
      incidents: money(incidents),
      total: money(total),
    },
    platformCost: money(platformCost),
    netSavings: money(netSavings),
    costWithPlatform: money(currentAnnualCost.minus(total).plus(platformCost)),
    returnOnInvestment: platformCost.isZero()
      ? null
      : netSavings.dividedBy(platformCost).toFixed(4),
    paybackMonths: total.isZero() ? null : platformCost.dividedBy(total).times(12).toFixed(1),
  };
}
