import { parseDecimal } from '@veris/shared';

/**
 * Amounts arrive as decimal strings ("5000000.00"). They are formatted from the string itself —
 * Intl accepts exact decimal strings — so no floating-point number is ever involved (SPEC rule 7).
 */
export function formatAmount(
  value: string | null,
  currency: string | null,
  locale: string,
): string {
  if (value === null) return '—';
  const options: Intl.NumberFormatOptions = currency
    ? { style: 'currency', currency }
    : { maximumFractionDigits: 20 };
  return new Intl.NumberFormat(locale, options).format(value as Intl.StringNumericLiteral);
}

/** A rate stored as a fraction ("0.05") shown as a percentage ("5 %"), in exact decimals. */
export function formatRate(value: string | null, locale: string): string {
  if (value === null) return '—';
  const percent = fractionToPercent(value);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(percent as Intl.StringNumericLiteral)} %`;
}

/** "0.0525" → "5.25": what the user types in a percentage field. */
export function fractionToPercent(value: string): string {
  return parseDecimal(value).times(100).toString();
}

/** "5.25" → "0.0525"; null when the text is not a decimal number. */
export function percentToFraction(value: string): string | null {
  const text = value.trim().replace(',', '.');
  return /^-?\d{1,3}(\.\d{1,4})?$/.test(text) ? parseDecimal(text).dividedBy(100).toString() : null;
}

/** A business date (`YYYY-MM-DD`) in the user's language, without time zone shifts. */
export function formatBusinessDate(value: string | null, locale: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
