import { CURRENCY_MINOR_UNITS, isCurrencyCode, parseDecimal } from '@veris/shared';

/**
 * Amount of a subscription: units × nominal value, in exact decimals, with the minor units of the
 * currency ("150" × "1000.00" EUR → "150000.00"). Null while the number of units is not a whole
 * positive number, so the form never sends an amount the server would refuse as a mismatch.
 */
export function subscriptionAmount(
  units: string,
  nominalValue: string | null,
  currency: string | null,
): string | null {
  const text = units.trim();
  if (!nominalValue || !/^\d{1,20}$/.test(text) || /^0+$/.test(text)) return null;
  const places = currency && isCurrencyCode(currency) ? CURRENCY_MINOR_UNITS[currency] : 2;
  return parseDecimal(text).times(parseDecimal(nominalValue)).toFixed(places);
}
