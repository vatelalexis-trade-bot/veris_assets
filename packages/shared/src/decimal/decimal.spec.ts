import { describe, expect, it } from 'vitest';
import { Decimal, InvalidDecimalError, parseDecimal, roundDecimal } from './decimal.js';

describe('parseDecimal', () => {
  it.each(['0', '2500.00', '-0.5', '1000', '0.000000000000000001'])('accepts "%s"', (value) => {
    expect(parseDecimal(value).toFixed()).toBe(new Decimal(value).toFixed());
  });

  it.each(['', ' 1', '1 ', '+1', '01', '1.', '.5', '1e3', 'NaN', 'Infinity', '1,5', 'abc'])(
    'rejects "%s"',
    (value) => {
      expect(() => parseDecimal(value)).toThrow(InvalidDecimalError);
    },
  );
});

describe('exact arithmetic', () => {
  it('adds 0.1 and 0.2 exactly', () => {
    expect(parseDecimal('0.1').plus(parseDecimal('0.2')).toFixed()).toBe('0.3');
  });

  it('keeps at least 18 decimals in intermediate results', () => {
    const third = parseDecimal('1').dividedBy(parseDecimal('3'));
    expect(third.decimalPlaces()).toBeGreaterThanOrEqual(18);
  });

  it('never uses exponential notation', () => {
    expect(parseDecimal('0.000000000000000001').toString()).toBe('0.000000000000000001');
    expect(parseDecimal('1000000000000000000000000').toString()).toBe('1000000000000000000000000');
  });
});

describe('roundDecimal', () => {
  it.each([
    ['2.345', 2, 'HALF_EVEN', '2.34'],
    ['2.355', 2, 'HALF_EVEN', '2.36'],
    ['2.5', 0, 'HALF_EVEN', '2'],
    ['3.5', 0, 'HALF_EVEN', '4'],
    ['-2.345', 2, 'HALF_EVEN', '-2.34'],
    ['2.345', 2, 'HALF_UP', '2.35'],
    ['2.349', 2, 'DOWN', '2.34'],
    ['-2.349', 2, 'DOWN', '-2.34'],
  ] as const)('rounds %s to %i decimals with %s → %s', (value, places, method, expected) => {
    expect(roundDecimal(parseDecimal(value), places, method).toFixed(places)).toBe(expected);
  });

  it('uses banker’s rounding by default', () => {
    expect(roundDecimal(parseDecimal('0.125'), 2).toFixed(2)).toBe('0.12');
  });
});
