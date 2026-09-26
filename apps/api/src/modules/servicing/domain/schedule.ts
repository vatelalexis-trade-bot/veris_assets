// Coupon schedule generated at activation (SPEC §12.1, D-012), pure.
import {
  addMonths,
  followingBusinessDay,
  subtractBusinessDays,
  type BusinessDate,
  type BusinessDayConvention,
  type DistributionFrequency,
} from '@virtus/shared';

const MONTHS: Record<Exclude<DistributionFrequency, 'BULLET'>, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
};

export interface ScheduleTerms {
  issueDate: BusinessDate;
  maturityDate: BusinessDate;
  frequency: DistributionFrequency;
  businessDayConvention: BusinessDayConvention;
  recordDateOffsetBusinessDays: number;
}

export interface ScheduledPayment {
  sequence: number;
  type: 'COUPON' | 'PRINCIPAL';
  /** Accrual period, unadjusted: the amount never changes with the payment date (§12.2). */
  periodStart: BusinessDate;
  periodEnd: BusinessDate;
  /** Adjusted to the following business day when the convention says so. */
  paymentDate: BusinessDate;
  /** Payment date minus the offset in business days (D-012). */
  recordDate: BusinessDate;
}

/**
 * Coupons from the issue date to maturity, every 1, 3, 6 or 12 months counted from the issue
 * date (a last shorter period ends at maturity), or a single one for BULLET; then the repayment
 * of the principal at maturity.
 */
export function generateSchedule(terms: ScheduleTerms): ScheduledPayment[] {
  const pay = (end: BusinessDate) =>
    terms.businessDayConvention === 'FOLLOWING' ? followingBusinessDay(end) : end;
  const entry = (
    sequence: number,
    type: ScheduledPayment['type'],
    start: BusinessDate,
    end: BusinessDate,
  ): ScheduledPayment => {
    const paymentDate = pay(end);
    return {
      sequence,
      type,
      periodStart: start,
      periodEnd: end,
      paymentDate,
      recordDate: subtractBusinessDays(paymentDate, terms.recordDateOffsetBusinessDays),
    };
  };
  const coupons: ScheduledPayment[] = [];
  if (terms.frequency === 'BULLET') {
    coupons.push(entry(1, 'COUPON', terms.issueDate, terms.maturityDate));
  } else {
    const step = MONTHS[terms.frequency];
    let start = terms.issueDate;
    for (let index = 1; start < terms.maturityDate; index += 1) {
      const next = addMonths(terms.issueDate, index * step);
      const end = next < terms.maturityDate ? next : terms.maturityDate;
      coupons.push(entry(index, 'COUPON', start, end));
      start = end;
    }
  }
  return [...coupons, entry(coupons.length + 1, 'PRINCIPAL', terms.issueDate, terms.maturityDate)];
}
