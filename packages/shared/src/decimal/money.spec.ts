import { describe, expect, it } from 'vitest';
import { parseDecimal } from './decimal.js';
import {
  addMoney,
  CurrencyMismatchError,
  money,
  multiplyMoney,
  roundMoney,
  toMoneyJson,
  UnroundedAmountError,
  UnsupportedCurrencyError,
} from './money.js';

describe('money', () => {
  it('computes the control case of SPEC §12.2 exactly: 100 × 1,000 € × 5 % × 180/360', () => {
    const periodFraction = parseDecimal('180').dividedBy(parseDecimal('360'));
    const gross = multiplyMoney(
      multiplyMoney(money('1000', 'EUR'), parseDecimal('100')),
      parseDecimal('0.05').times(periodFraction),
    );
    expect(toMoneyJson(roundMoney(gross))).toEqual({ amount: '2500.00', currency: 'EUR' });
  });

  it('adds amounts of the same currency', () => {
    expect(toMoneyJson(addMoney(money('0.10', 'EUR'), money('0.20', 'EUR')))).toEqual({
      amount: '0.30',
      currency: 'EUR',
    });
  });

  it('refuses to add different currencies', () => {
    expect(() => addMoney(money('1', 'EUR'), money('1', 'USD'))).toThrow(CurrencyMismatchError);
  });

  it('refuses unsupported currencies', () => {
    expect(() => money('1', 'XYZ')).toThrow(UnsupportedCurrencyError);
  });

  it('refuses invalid amounts', () => {
    expect(() => money('1e3', 'EUR')).toThrow(/Invalid decimal/);
  });

  it('rounds with the requested method', () => {
    expect(toMoneyJson(roundMoney(money('10.005', 'EUR'))).amount).toBe('10.00');
    expect(toMoneyJson(roundMoney(money('10.005', 'EUR'), 'HALF_UP')).amount).toBe('10.01');
  });

  it('refuses to serialise an unrounded amount instead of rounding silently', () => {
    expect(() => toMoneyJson(money('10.005', 'EUR'))).toThrow(UnroundedAmountError);
  });

  it('always writes the currency decimals', () => {
    expect(toMoneyJson(money('2500', 'EUR')).amount).toBe('2500.00');
  });
});
