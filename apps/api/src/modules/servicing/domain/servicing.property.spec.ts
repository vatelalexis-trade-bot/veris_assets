// Properties of coupon schedules and distributions checked over many terms (SPEC §12): the
// periods cover the life of the issuance without gap or overlap, no interest is lost or counted
// twice whatever the frequency, and the rounded lines always add up to the total shown.
import {
  daysBetween,
  isWeekend,
  parseDecimal,
  ROUNDING_METHODS,
  type DistributionFrequency,
} from '@veris/shared';
import { describe, expect, it } from 'vitest';
import { periodFraction } from './day-count.js';
import { calculateDistribution } from './distribution.js';
import { generateSchedule } from './schedule.js';
import { seededRandom } from '../../../test/seeded-random.js';

const FREQUENCIES: DistributionFrequency[] = [
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUAL',
  'ANNUAL',
  'BULLET',
];
// Month ends, a leap day and ordinary days, to exercise the shorter months.
const ISSUE_DATES = [
  '2026-01-15',
  '2026-01-28',
  '2026-01-31',
  '2026-03-30',
  '2026-05-31',
  '2026-08-31',
  '2027-12-31',
  '2028-02-29',
];
const MATURITY_OFFSETS = [
  [0, 1],
  [0, 7],
  [1, 0],
  [2, 5],
  [5, 0],
  [7, 3],
] as const;

function maturityOf(issue: string, years: number, months: number): string {
  const [year, month, day] = issue.split('-').map((part) => parseInt(part, 10)) as [
    number,
    number,
    number,
  ];
  const target = new Date(Date.UTC(year + years, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(day < lastDay ? day : lastDay);
  return target.toISOString().slice(0, 10);
}

function* allTerms() {
  for (const issueDate of ISSUE_DATES)
    for (const [years, months] of MATURITY_OFFSETS)
      for (const frequency of FREQUENCIES)
        for (const businessDayConvention of ['FOLLOWING', 'NONE'] as const)
          for (const recordDateOffsetBusinessDays of [0, 1, 3])
            yield {
              issueDate,
              maturityDate: maturityOf(issueDate, years, months),
              frequency,
              businessDayConvention,
              recordDateOffsetBusinessDays,
            };
}

/** Business days strictly after `from`, up to and including `to`. */
function businessDaysBetween(from: string, to: string): number {
  let count = 0;
  for (let day = 1; day <= daysBetween(from, to); day += 1) {
    const date = new Date(`${from}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + day);
    if (!isWeekend(date.toISOString().slice(0, 10))) count += 1;
  }
  return count;
}

describe('coupon schedules (SPEC §12.1, D-012, generated)', () => {
  it('cover the life of the issuance with contiguous periods, the principal last', () => {
    for (const terms of allTerms()) {
      const label = JSON.stringify(terms);
      const schedule = generateSchedule(terms);
      const coupons = schedule.filter((row) => row.type === 'COUPON');
      const principal = schedule.at(-1)!;
      expect(
        schedule.map((row) => row.sequence),
        label,
      ).toEqual(schedule.map((_, index) => index + 1));
      expect(coupons[0]!.periodStart, label).toBe(terms.issueDate);
      expect(coupons.at(-1)!.periodEnd, label).toBe(terms.maturityDate);
      coupons.forEach((row, index) => {
        expect(row.periodStart < row.periodEnd, label).toBe(true);
        if (index > 0) expect(row.periodStart, label).toBe(coupons[index - 1]!.periodEnd);
      });
      expect(principal, label).toMatchObject({
        type: 'PRINCIPAL',
        periodStart: terms.issueDate,
        periodEnd: terms.maturityDate,
        paymentDate: coupons.at(-1)!.paymentDate,
      });
    }
  });

  it('end every regular period on the issue day of the month, or the last day of a shorter month', () => {
    const step: Record<DistributionFrequency, number> = {
      MONTHLY: 1,
      QUARTERLY: 3,
      SEMI_ANNUAL: 6,
      ANNUAL: 12,
      BULLET: 0,
    };
    for (const terms of allTerms()) {
      if (terms.frequency === 'BULLET') continue;
      const coupons = generateSchedule(terms).filter((row) => row.type === 'COUPON');
      coupons.slice(0, -1).forEach((row, index) => {
        const months = (index + 1) * step[terms.frequency];
        expect(row.periodEnd, JSON.stringify(terms)).toBe(maturityOf(terms.issueDate, 0, months));
      });
    }
  });

  it('pay on a business day on or after the end of the period, recorded before', () => {
    for (const terms of allTerms()) {
      const label = JSON.stringify(terms);
      for (const row of generateSchedule(terms)) {
        if (terms.businessDayConvention === 'NONE') {
          expect(row.paymentDate, label).toBe(row.periodEnd);
        } else {
          expect(row.paymentDate >= row.periodEnd, label).toBe(true);
          expect(isWeekend(row.paymentDate), label).toBe(false);
          expect(daysBetween(row.periodEnd, row.paymentDate), label).toBeLessThanOrEqual(2);
        }
        if (terms.recordDateOffsetBusinessDays === 0) {
          expect(row.recordDate, label).toBe(row.paymentDate);
        } else {
          expect(isWeekend(row.recordDate), label).toBe(false);
          expect(businessDaysBetween(row.recordDate, row.paymentDate), label).toBe(
            terms.recordDateOffsetBusinessDays - (isWeekend(row.paymentDate) ? 1 : 0),
          );
        }
      }
    }
  });

  it('count the interest of the whole life exactly once, whatever the frequency', () => {
    for (const terms of allTerms()) {
      const label = JSON.stringify(terms);
      for (const dayCount of ['30E_360', 'ACT_365F'] as const) {
        const coupons = generateSchedule(terms).filter((row) => row.type === 'COUPON');
        const sum = coupons.reduce(
          (total, row) => total.plus(periodFraction(dayCount, row.periodStart, row.periodEnd)),
          parseDecimal('0'),
        );
        const whole = periodFraction(dayCount, terms.issueDate, terms.maturityDate);
        expect(sum.minus(whole).abs().lt('1e-25'), `${dayCount} ${label}`).toBe(true);
      }
    }
  });

  it('give 180/360 to each half year in 30E/360 when the issue date is not a month end', () => {
    const schedule = generateSchedule({
      issueDate: '2026-03-15',
      maturityDate: '2031-03-15',
      frequency: 'SEMI_ANNUAL',
      businessDayConvention: 'FOLLOWING',
      recordDateOffsetBusinessDays: 1,
    });
    for (const row of schedule.filter((item) => item.type === 'COUPON'))
      expect(periodFraction('30E_360', row.periodStart, row.periodEnd).toString()).toBe('0.5');
  });
});

describe('distributions (SPEC §12.2, generated)', () => {
  it('add the rounded lines up to the total, each within half a cent of the exact amount', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const { integer } = seededRandom(seed);
      const holders = Array.from({ length: integer(1, 60) }, (_, index) => ({
        accountId: `account-${index}`,
        investorId: `investor-${index}`,
        quantity: String(integer(0, 20_000)),
      }));
      const nominalValue = `${integer(1, 100_000)}.${String(integer(0, 99)).padStart(2, '0')}`;
      const rate = `0.${String(integer(1, 15_000)).padStart(6, '0')}`;
      const fraction = periodFraction(
        seed % 2 ? '30E_360' : 'ACT_365F',
        '2026-01-31',
        `2026-${String(integer(2, 12)).padStart(2, '0')}-${String(integer(1, 28)).padStart(2, '0')}`,
      );
      const roundingMethod = ROUNDING_METHODS[seed % ROUNDING_METHODS.length]!;
      const label = `seed ${seed} ${roundingMethod}`;
      const result = calculateDistribution({
        type: seed % 5 === 0 ? 'PRINCIPAL' : 'COUPON',
        holders,
        nominalValue,
        rate,
        fraction,
        roundingMethod,
        minorUnits: 2,
      });

      const paid = holders.filter((holder) => holder.quantity !== '0');
      expect(result.beneficiaryCount, label).toBe(paid.length);
      const sumOfLines = result.lines.reduce(
        (total, line) => total.plus(line.grossAmount),
        parseDecimal('0'),
      );
      expect(sumOfLines.toFixed(2), label).toBe(result.totalGross);
      expect(
        parseDecimal(result.totalUnrounded).minus(result.totalGross).eq(result.roundingDifference),
        label,
      ).toBe(true);
      for (const line of result.lines) {
        const gap = parseDecimal(line.grossAmountUnrounded).minus(line.grossAmount);
        expect(gap.abs().lte(roundingMethod === 'DOWN' ? '0.01' : '0.005'), label).toBe(true);
        if (roundingMethod === 'DOWN') expect(gap.gte(0), label).toBe(true);
        expect(line.anomalyCode === 'ZERO_AMOUNT', label).toBe(
          parseDecimal(line.grossAmount).isZero(),
        );
      }
      expect(
        parseDecimal(result.roundingDifference)
          .abs()
          .lte(parseDecimal('0.01').times(result.lines.length)),
        label,
      ).toBe(true);
    }
  });

  it('round a half cent to even, up or down as the issuance says', () => {
    const half = (roundingMethod: (typeof ROUNDING_METHODS)[number], nominalValue: string) =>
      calculateDistribution({
        type: 'PRINCIPAL',
        holders: [{ accountId: 'a', investorId: 'alpine', quantity: '1' }],
        nominalValue,
        rate: '0',
        fraction: parseDecimal('0'),
        roundingMethod,
        minorUnits: 2,
      }).totalGross;
    expect([half('HALF_EVEN', '0.125'), half('HALF_EVEN', '0.135')]).toEqual(['0.12', '0.14']);
    expect([half('HALF_UP', '0.125'), half('DOWN', '0.129')]).toEqual(['0.13', '0.12']);
  });
});
