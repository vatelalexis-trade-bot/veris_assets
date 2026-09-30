import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INVESTOR_INPUTS,
  invalidInvestorInputs,
  simulateCoupons,
} from './investor-calculate';

describe('investor coupon simulation', () => {
  it('pays the same coupon each period and the principal with the last one', () => {
    // 100 000 € at 5.5 %, semi-annual, 5 years: 2 750 € ten times.
    const result = simulateCoupons(DEFAULT_INVESTOR_INPUTS)!;
    expect(result.couponPerPeriod).toBe('2750.00');
    expect(result.payments).toBe(10);
    expect(result.totalCoupons).toBe('27500.00');
    expect(result.totalReceived).toBe('127500.00');
    expect(result.schedule[0]).toEqual({
      number: 1,
      month: 6,
      coupon: '2750.00',
      principal: '0.00',
    });
    expect(result.schedule.at(-1)).toEqual({
      number: 10,
      month: 60,
      coupon: '2750.00',
      principal: '100000.00',
    });
  });

  it('rounds each coupon to the cent, exactly', () => {
    // 10 000 € × 4.75 % ÷ 4 = 118.75 €; 12 345.67 € × 3 % ÷ 4 = 92.592525 → 92.59 €.
    expect(
      simulateCoupons({ amount: '10000', ratePercent: '4.75', years: '3', frequency: '4' })!
        .couponPerPeriod,
    ).toBe('118.75');
    const odd = simulateCoupons({
      amount: '12345.67',
      ratePercent: '3',
      years: '2',
      frequency: '4',
    })!;
    expect(odd.couponPerPeriod).toBe('92.59');
    expect(odd.totalCoupons).toBe('740.72');
    expect(odd.schedule.map((payment) => payment.month)).toEqual([3, 6, 9, 12, 15, 18, 21, 24]);
  });

  it('accepts the way visitors type and rejects what cannot be simulated', () => {
    expect(
      simulateCoupons({ amount: '50 000,50', ratePercent: '6', years: '1', frequency: '1' })!
        .couponPerPeriod,
    ).toBe('3000.03');
    expect(
      invalidInvestorInputs({ amount: '0', ratePercent: '101', years: '31', frequency: '1' }),
    ).toEqual(['amount', 'ratePercent', 'years']);
    expect(invalidInvestorInputs({ ...DEFAULT_INVESTOR_INPUTS, years: '2.5' })).toEqual(['years']);
    expect(simulateCoupons({ ...DEFAULT_INVESTOR_INPUTS, amount: 'abc' })).toBeNull();
  });
});
