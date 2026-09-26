// Distributions (SPEC §12.2 to §12.5, docs/DATA_MODEL.md §4.5), pure.
import {
  defineStateMachine,
  parseDecimal,
  roundDecimal,
  type Decimal,
  type RoundingMethod,
} from '@virtus/shared';

export const DISTRIBUTION_STATUSES = [
  'DRAFT',
  'CALCULATED',
  'UNDER_REVIEW',
  'APPROVED',
  'PAYMENT_INSTRUCTION_GENERATED',
  'PAID',
  'FAILED',
  'CANCELLED',
] as const;
export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number];

/**
 * Prepared (snapshot and calculation), reviewed and approved by another Issuer Administrator
 * (four eyes, SPEC §4.8), paid through a fictitious payment instruction confirmed with four eyes.
 */
export const distributionMachine = defineStateMachine<DistributionStatus>({
  resourceType: 'distribution',
  states: DISTRIBUTION_STATUSES,
  transitions: [
    { from: ['DRAFT'], to: 'CALCULATED', permission: 'distribution:prepare' },
    { from: ['CALCULATED'], to: 'UNDER_REVIEW', permission: 'distribution:prepare' },
    {
      from: ['UNDER_REVIEW'],
      to: 'APPROVED',
      permission: 'distribution:approve',
      distinctFromInitiator: true,
    },
    // Sent back to be calculated again (e.g. after a correction of the registry).
    {
      from: ['UNDER_REVIEW'],
      to: 'DRAFT',
      permission: 'distribution:approve',
      commentRequired: true,
    },
    {
      from: ['APPROVED', 'FAILED'],
      to: 'PAYMENT_INSTRUCTION_GENERATED',
      permission: 'distribution:prepare',
    },
    {
      from: ['PAYMENT_INSTRUCTION_GENERATED'],
      to: 'PAID',
      permission: 'payment:confirm',
      distinctFromInitiator: true,
    },
    { from: ['PAYMENT_INSTRUCTION_GENERATED'], to: 'FAILED', permission: 'payment:confirm' },
    {
      from: ['DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED'],
      to: 'CANCELLED',
      permission: 'distribution:cancel',
      commentRequired: true,
    },
  ],
});

/** Version of the calculation rules, kept with every distribution. */
export const CALCULATION_VERSION = 'servicing-calc-1';

export interface Holder {
  accountId: string;
  investorId: string;
  quantity: string;
}

export interface CalculatedLine extends Holder {
  grossAmountUnrounded: string;
  grossAmount: string;
  anomalyCode: 'ZERO_AMOUNT' | null;
}

export interface Calculation {
  lines: CalculatedLine[];
  totalUnrounded: string;
  totalGross: string;
  /** Total unrounded − total rounded (SPEC §12.2), shown with the distribution. */
  roundingDifference: string;
  beneficiaryCount: number;
}

/**
 * Gross amount of each holder (SPEC §12.2): quantity × nominal value × rate × period fraction for
 * a coupon, quantity × nominal value for the principal; every line rounded to the currency's
 * minor units with the issuance's method; totals and rounding difference in exact decimals.
 */
export function calculateDistribution(input: {
  type: 'COUPON' | 'PRINCIPAL';
  holders: readonly Holder[];
  nominalValue: string;
  rate: string;
  fraction: Decimal;
  roundingMethod: RoundingMethod;
  minorUnits: number;
}): Calculation {
  const perUnit =
    input.type === 'PRINCIPAL'
      ? parseDecimal(input.nominalValue)
      : parseDecimal(input.nominalValue).times(parseDecimal(input.rate)).times(input.fraction);
  let totalUnrounded = parseDecimal('0');
  let totalGross = parseDecimal('0');
  const lines = input.holders
    .filter((holder) => parseDecimal(holder.quantity).gt(0))
    .map((holder) => {
      const unrounded = parseDecimal(holder.quantity).times(perUnit);
      const gross = roundDecimal(unrounded, input.minorUnits, input.roundingMethod);
      totalUnrounded = totalUnrounded.plus(unrounded);
      totalGross = totalGross.plus(gross);
      return {
        ...holder,
        grossAmountUnrounded: unrounded.toString(),
        grossAmount: gross.toFixed(input.minorUnits),
        anomalyCode: gross.isZero() ? ('ZERO_AMOUNT' as const) : null,
      };
    });
  return {
    lines,
    totalUnrounded: totalUnrounded.toString(),
    totalGross: totalGross.toFixed(input.minorUnits),
    roundingDifference: totalUnrounded.minus(totalGross).toString(),
    beneficiaryCount: lines.length,
  };
}

/** Lines of the fictitious payment instruction, as CSV (SPEC §12.5), with the demo mention. */
export function paymentInstructionCsv(input: {
  issuanceCode: string;
  paymentDate: string;
  currency: string;
  lines: readonly { investorName: string; investorId: string; grossAmount: string }[];
}): string {
  const escape = (value: string) =>
    /[",\n;]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  const rows = [
    ['# DEMONSTRATION - fictitious payment instruction - no real payment'],
    ['issuance', 'payment_date', 'investor_id', 'investor', 'amount', 'currency'],
    ...input.lines.map((line) => [
      input.issuanceCode,
      input.paymentDate,
      line.investorId,
      line.investorName,
      line.grossAmount,
      input.currency,
    ]),
  ];
  return `${rows.map((row) => row.map(escape).join(',')).join('\n')}\n`;
}
