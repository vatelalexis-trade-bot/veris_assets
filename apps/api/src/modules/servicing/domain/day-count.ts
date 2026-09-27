// Period fractions of SPEC §12.2 (docs/DATA_MODEL.md §3.6, D-011), in exact decimals.
import {
  dateParts,
  daysBetween,
  parseDecimal,
  type BusinessDate,
  type DayCount,
  type Decimal,
} from '@veris/shared';

/**
 * Fraction of a year between two (unadjusted) period dates:
 * - ACT/365 Fixed: actual days / 365;
 * - 30E/360 (Eurobond, D-011): [360 × (Y2 − Y1) + 30 × (M2 − M1) + (D2 − D1)] / 360, a day 31
 *   being counted as 30.
 */
export function periodFraction(
  dayCount: DayCount,
  start: BusinessDate,
  end: BusinessDate,
): Decimal {
  if (dayCount === 'ACT_365F') return parseDecimal(String(daysBetween(start, end))).dividedBy(365);
  const [y1, m1, d1] = dateParts(start);
  const [y2, m2, d2] = dateParts(end);
  const day = (value: number) => (value === 31 ? 30 : value);
  const days = 360 * (y2 - y1) + 30 * (m2 - m1) + (day(d2) - day(d1));
  return parseDecimal(String(days)).dividedBy(360);
}
