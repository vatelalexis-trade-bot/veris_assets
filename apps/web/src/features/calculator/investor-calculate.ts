import { roundDecimal, type Decimal } from '@veris/shared';
import { readDecimal } from './calculate';

/** Coupons a year: annual, semi-annual or quarterly. */
export type CouponFrequency = '1' | '2' | '4';

export interface InvestorInputs {
  /** Amount invested, in euros. */
  amount: string;
  /** Target annual coupon rate, in percent ("5.5"). */
  ratePercent: string;
  /** Term in whole years. */
  years: string;
  frequency: CouponFrequency;
}

export interface CouponPayment {
  number: number;
  /** Months after the issue date. */
  month: number;
  coupon: string;
  /** The principal, repaid with the last coupon (bullet repayment). */
  principal: string;
}

export interface InvestorResult {
  couponPerPeriod: string;
  payments: number;
  totalCoupons: string;
  /** Coupons and principal. */
  totalReceived: string;
  schedule: CouponPayment[];
}

export const DEFAULT_INVESTOR_INPUTS: InvestorInputs = {
  amount: '100000',
  ratePercent: '5.5',
  years: '5',
  frequency: '2',
};

export const MAX_YEARS = 30;

/** Which inputs are invalid: amount above zero, rate from 0 to 100 %, 1 to 30 whole years. */
export function invalidInvestorInputs(inputs: InvestorInputs): (keyof InvestorInputs)[] {
  const amount = readDecimal(inputs.amount);
  const rate = readDecimal(inputs.ratePercent);
  const years = /^\d{1,2}$/.test(inputs.years.trim()) ? Number(inputs.years) : 0;
  return [
    ...(amount === null || amount.isZero() ? (['amount'] as const) : []),
    ...(rate === null || rate.gt(100) ? (['ratePercent'] as const) : []),
    ...(years < 1 || years > MAX_YEARS ? (['years'] as const) : []),
  ];
}

/**
 * Simple simulation of a fixed-rate bond: the same coupon each period (amount × rate ÷ number of
 * coupons a year, rounded to the cent, banker's rounding as on the platform), the principal
 * repaid at maturity. No day count, no tax: an illustration, not a projection. Null when an
 * input is invalid.
 */
export function simulateCoupons(inputs: InvestorInputs): InvestorResult | null {
  if (invalidInvestorInputs(inputs).length > 0) return null;
  const amount = readDecimal(inputs.amount) as Decimal;
  const rate = (readDecimal(inputs.ratePercent) as Decimal).dividedBy(100);
  const perYear = Number(inputs.frequency);
  const payments = Number(inputs.years) * perYear;
  const coupon = roundDecimal(amount.times(rate).dividedBy(perYear), 2);
  const totalCoupons = coupon.times(payments);
  const money = (value: Decimal) => value.toFixed(2);
  return {
    couponPerPeriod: money(coupon),
    payments,
    totalCoupons: money(totalCoupons),
    totalReceived: money(totalCoupons.plus(amount)),
    schedule: Array.from({ length: payments }, (_, index) => ({
      number: index + 1,
      month: ((index + 1) * 12) / perYear,
      coupon: money(coupon),
      principal: index === payments - 1 ? money(amount) : '0.00',
    })),
  };
}
