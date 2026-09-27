import { checkTransition, parseDecimal } from '@veris/shared';
import { describe, expect, it } from 'vitest';
import { periodFraction } from './day-count.js';
import {
  calculateDistribution,
  distributionMachine,
  paymentInstructionCsv,
} from './distribution.js';
import { generateSchedule } from './schedule.js';

describe('period fractions (SPEC §12.2, D-011)', () => {
  it('count a half year as 180/360 in 30E/360', () => {
    expect(periodFraction('30E_360', '2026-03-15', '2026-09-15').toString()).toBe('0.5');
    // A day 31 counts as 30 at both ends.
    expect(periodFraction('30E_360', '2026-03-31', '2026-09-30').toString()).toBe('0.5');
    expect(periodFraction('30E_360', '2026-08-31', '2027-02-28').mul(360).toString()).toBe('178');
  });

  it('count actual days over 365 in ACT/365 Fixed, leap years included', () => {
    expect(
      periodFraction('ACT_365F', '2027-12-31', '2028-12-31')
        .mul(365)
        .toDecimalPlaces(20)
        .toString(),
    ).toBe('366');
    expect(
      periodFraction('ACT_365F', '2026-01-01', '2026-04-01')
        .mul(365)
        .toDecimalPlaces(20)
        .toString(),
    ).toBe('90');
  });
});

describe('scenario 6 — the control case of SPEC §12.2', () => {
  it('pays exactly 2 500.00 € on 100 units of 1 000 € at 5 % for a 30E/360 half year', () => {
    const result = calculateDistribution({
      type: 'COUPON',
      holders: [{ accountId: 'a', investorId: 'alpine', quantity: '100' }],
      nominalValue: '1000.00',
      rate: '0.05',
      fraction: periodFraction('30E_360', '2026-03-15', '2026-09-15'),
      roundingMethod: 'HALF_EVEN',
      minorUnits: 2,
    });
    expect(result.lines[0]!.grossAmount).toBe('2500.00');
    expect(result).toMatchObject({ totalGross: '2500.00', roundingDifference: '0' });
  });
});

describe('distribution lines (SPEC §12.2, §12.5)', () => {
  const holders = [
    { accountId: 'a', investorId: 'alpine', quantity: '1' },
    { accountId: 'b', investorId: 'baltic', quantity: '2' },
    { accountId: 'c', investorId: 'cedar', quantity: '0' },
  ];
  // 1 000 € × 5 % × 91/365 = 12.4657534… € per unit.
  const quarter = {
    type: 'COUPON' as const,
    holders,
    nominalValue: '1000.00',
    rate: '0.05',
    fraction: periodFraction('ACT_365F', '2026-01-01', '2026-04-02'),
    minorUnits: 2,
  };

  it('round each line, and show the rounding difference of the total', () => {
    const result = calculateDistribution({ ...quarter, roundingMethod: 'HALF_EVEN' });
    expect(result.lines.map((line) => line.grossAmount)).toEqual(['12.47', '24.93']);
    expect(result.totalGross).toBe('37.40');
    expect(parseDecimal(result.totalUnrounded).minus(result.totalGross).toString()).toBe(
      result.roundingDifference,
    );
    expect(parseDecimal(result.roundingDifference).abs().lt('0.01')).toBe(true);
    // Holders without units are not beneficiaries.
    expect(result.beneficiaryCount).toBe(2);
  });

  it('follow the rounding method of the issuance', () => {
    const down = calculateDistribution({ ...quarter, roundingMethod: 'DOWN' });
    expect(down.lines.map((line) => line.grossAmount)).toEqual(['12.46', '24.93']);
  });

  it('flag a line rounded to zero, and pay the principal at the nominal value', () => {
    const tiny = calculateDistribution({
      ...quarter,
      rate: '0.000001',
      roundingMethod: 'HALF_EVEN',
    });
    expect(tiny.lines[0]).toMatchObject({ grossAmount: '0.00', anomalyCode: 'ZERO_AMOUNT' });
    const principal = calculateDistribution({
      ...quarter,
      type: 'PRINCIPAL',
      roundingMethod: 'HALF_EVEN',
    });
    expect(principal.totalGross).toBe('3000.00');
  });

  it('give the same result when calculated again from the same snapshot', () => {
    const first = calculateDistribution({ ...quarter, roundingMethod: 'HALF_EVEN' });
    expect(calculateDistribution({ ...quarter, roundingMethod: 'HALF_EVEN' })).toEqual(first);
  });

  it('are approved by another administrator than the preparer (four eyes)', () => {
    const admin = { userId: 'admin', permissions: new Set(['distribution:approve']) };
    const request = { from: 'UNDER_REVIEW', to: 'APPROVED', actor: admin } as const;
    expect(checkTransition(distributionMachine, { ...request, initiatorUserId: 'admin' })).toBe(
      'FOUR_EYES_VIOLATION',
    );
    expect(
      checkTransition(distributionMachine, { ...request, initiatorUserId: 'operator' }),
    ).toBeNull();
  });
});

describe('payment instruction CSV (SPEC §12.5)', () => {
  it('carries the demo mention and escapes the names', () => {
    const csv = paymentInstructionCsv({
      issuanceCode: 'NWGN',
      paymentDate: '2026-09-21',
      currency: 'EUR',
      lines: [
        { investorName: 'Alpine, "Capital" (demo)', investorId: 'id-1', grossAmount: '2500.00' },
      ],
    });
    expect(csv.split('\n')).toEqual([
      '# DEMONSTRATION - fictitious payment instruction - no real payment',
      'issuance,payment_date,investor_id,investor,amount,currency',
      'NWGN,2026-09-21,id-1,"Alpine, ""Capital"" (demo)",2500.00,EUR',
      '',
    ]);
  });
});

describe('coupon schedule (SPEC §12.1, D-012)', () => {
  const terms = {
    issueDate: '2026-01-31',
    maturityDate: '2027-07-31',
    frequency: 'SEMI_ANNUAL' as const,
    businessDayConvention: 'FOLLOWING' as const,
    recordDateOffsetBusinessDays: 1,
  };

  it('counts periods from the issue date, pays on the following business day', () => {
    const schedule = generateSchedule(terms);
    expect(
      schedule.map((row) => [
        row.type,
        row.periodStart,
        row.periodEnd,
        row.paymentDate,
        row.recordDate,
      ]),
    ).toEqual([
      ['COUPON', '2026-01-31', '2026-07-31', '2026-07-31', '2026-07-30'],
      // 31 January 2027 is a Sunday: paid on Monday, recorded on Friday.
      ['COUPON', '2026-07-31', '2027-01-31', '2027-02-01', '2027-01-29'],
      ['COUPON', '2027-01-31', '2027-07-31', '2027-08-02', '2027-07-30'],
      ['PRINCIPAL', '2026-01-31', '2027-07-31', '2027-08-02', '2027-07-30'],
    ]);
  });

  it('ends with a shorter period at maturity, and has one coupon for a bullet', () => {
    const stub = generateSchedule({ ...terms, maturityDate: '2026-10-15', frequency: 'QUARTERLY' });
    expect(stub.map((row) => row.periodEnd)).toEqual([
      '2026-04-30',
      '2026-07-31',
      '2026-10-15',
      '2026-10-15',
    ]);
    const bullet = generateSchedule({
      ...terms,
      frequency: 'BULLET',
      businessDayConvention: 'NONE',
    });
    expect(bullet.map((row) => [row.type, row.paymentDate])).toEqual([
      ['COUPON', '2027-07-31'],
      ['PRINCIPAL', '2027-07-31'],
    ]);
  });
});
