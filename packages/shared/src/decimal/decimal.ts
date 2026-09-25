// Exact decimal arithmetic for amounts, quantities and rates (SPEC §12.2, §21.2, rule 7).
// Never use JavaScript numbers for these values: 0.1 + 0.2 !== 0.3 in floating point.
import { Decimal as DecimalJs } from 'decimal.js';

/**
 * Isolated Decimal constructor: 40 significant digits (SPEC requires at least 18 decimals for
 * intermediate results), banker's rounding by default, and never exponential notation.
 */
export const Decimal = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_EVEN,
  toExpNeg: -9e15,
  toExpPos: 9e15,
});
export type Decimal = DecimalJs;

/** Rounding methods selectable per issuance (wizard step 4, docs/DATA_MODEL.md §3.4). */
export type RoundingMethod = 'HALF_EVEN' | 'HALF_UP' | 'DOWN';

const ROUNDING_MODES: Record<RoundingMethod, DecimalJs.Rounding> = {
  HALF_EVEN: DecimalJs.ROUND_HALF_EVEN,
  HALF_UP: DecimalJs.ROUND_HALF_UP,
  DOWN: DecimalJs.ROUND_DOWN,
};

/** Canonical decimal string accepted from the outside: "2500.00", "-0.5", "0". No exponent, no sign "+". */
const DECIMAL_STRING = /^-?(0|[1-9]\d*)(\.\d+)?$/;

export class InvalidDecimalError extends Error {
  constructor(value: string) {
    super(`Invalid decimal string: "${value}"`);
    this.name = 'InvalidDecimalError';
  }
}

export function isDecimalString(value: string): boolean {
  return DECIMAL_STRING.test(value);
}

/** Parses a canonical decimal string; anything else (exponent, spaces, NaN…) is rejected. */
export function parseDecimal(value: string): Decimal {
  if (!isDecimalString(value)) throw new InvalidDecimalError(value);
  return new Decimal(value);
}

export function roundDecimal(
  value: Decimal,
  decimalPlaces: number,
  method: RoundingMethod = 'HALF_EVEN',
): Decimal {
  return value.toDecimalPlaces(decimalPlaces, ROUNDING_MODES[method]);
}
