// Money = exact amount + ISO 4217 currency, always carried together (SPEC §21.2).
import { Decimal, parseDecimal, roundDecimal, type RoundingMethod } from './decimal.js';

/**
 * Currencies supported by the MVP and their number of decimals (ISO 4217 minor units).
 * The full ISO 4217 reference table lives in the database (core.currency, phase 3).
 */
export const CURRENCY_MINOR_UNITS = { EUR: 2, USD: 2, GBP: 2, CHF: 2 } as const;
export type CurrencyCode = keyof typeof CURRENCY_MINOR_UNITS;

export interface Money {
  readonly amount: Decimal;
  readonly currency: CurrencyCode;
}

/** JSON representation of an amount: the amount is always a string (SPEC §21.2). */
export interface MoneyJson {
  readonly amount: string;
  readonly currency: CurrencyCode;
}

export class UnsupportedCurrencyError extends Error {
  constructor(currency: string) {
    super(`Unsupported currency: "${currency}"`);
    this.name = 'UnsupportedCurrencyError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(left: CurrencyCode, right: CurrencyCode) {
    super(`Cannot combine amounts in ${left} and ${right}`);
    this.name = 'CurrencyMismatchError';
  }
}

export class UnroundedAmountError extends Error {
  constructor(money: Money) {
    super(
      `Amount ${money.amount.toString()} ${money.currency} has more decimals than the currency allows; round it first`,
    );
    this.name = 'UnroundedAmountError';
  }
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.hasOwn(CURRENCY_MINOR_UNITS, value);
}

export function money(amount: string | Decimal, currency: string): Money {
  if (!isCurrencyCode(currency)) throw new UnsupportedCurrencyError(currency);
  return {
    amount: typeof amount === 'string' ? parseDecimal(amount) : amount,
    currency,
  };
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new CurrencyMismatchError(left.currency, right.currency);
  }
  return { amount: left.amount.plus(right.amount), currency: left.currency };
}

/** Multiplies without rounding: round explicitly with roundMoney once the calculation is done. */
export function multiplyMoney(value: Money, factor: Decimal): Money {
  return { amount: value.amount.times(factor), currency: value.currency };
}

/** Rounds to the currency's minor unit (2 decimals for EUR). */
export function roundMoney(value: Money, method: RoundingMethod = 'HALF_EVEN'): Money {
  return {
    amount: roundDecimal(value.amount, CURRENCY_MINOR_UNITS[value.currency], method),
    currency: value.currency,
  };
}

/** Serialises an already rounded amount; refuses to round silently. */
export function toMoneyJson(value: Money): MoneyJson {
  const minorUnits = CURRENCY_MINOR_UNITS[value.currency];
  if (value.amount.decimalPlaces() > minorUnits) throw new UnroundedAmountError(value);
  return { amount: value.amount.toFixed(minorUnits), currency: value.currency };
}
