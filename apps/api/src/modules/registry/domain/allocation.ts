// Manual allocation (SPEC §10.1, §9.4; docs/DATA_MODEL.md §4.6): life cycle of a round and the
// checks of its totals, pure.
import { defineStateMachine, parseDecimal } from '@veris/shared';

export const ALLOCATION_ROUND_STATUSES = ['DRAFT', 'PROPOSED', 'VALIDATED', 'REJECTED'] as const;
export type AllocationRoundStatus = (typeof ALLOCATION_ROUND_STATUSES)[number];

/**
 * DRAFT → PROPOSED (the preparer), PROPOSED → VALIDATED (an Issuer Administrator other than the
 * preparer: four eyes, SPEC §4.8) or REJECTED (comment required). A draft can be abandoned by its
 * preparer (REJECTED with a comment); a new round can then be prepared.
 */
export const allocationRoundMachine = defineStateMachine<AllocationRoundStatus>({
  resourceType: 'allocation_round',
  states: ALLOCATION_ROUND_STATUSES,
  transitions: [
    { from: ['DRAFT'], to: 'PROPOSED', permission: 'allocation:prepare' },
    {
      from: ['PROPOSED'],
      to: 'VALIDATED',
      permission: 'allocation:validate',
      distinctFromInitiator: true,
    },
    {
      from: ['PROPOSED'],
      to: 'REJECTED',
      permission: 'allocation:validate',
      commentRequired: true,
    },
    { from: ['DRAFT'], to: 'REJECTED', permission: 'allocation:prepare', commentRequired: true },
  ],
});

export interface AllocationLineInput {
  subscriptionId: string;
  requestedUnits: string;
  allocatedUnits: string;
}

export type AllocationFailure =
  | { code: 'QUANTITY_NOT_INTEGER'; subscriptionId: string }
  | { code: 'ALLOCATION_EXCEEDS_REQUEST'; subscriptionId: string }
  | { code: 'ALLOCATION_EXCEEDS_SUPPLY'; meta: { totalUnits: string; allocatedUnits: string } }
  | {
      code: 'MINIMUM_NOT_REACHED_JUSTIFICATION_REQUIRED';
      meta: { minimumAmount: string; allocatedAmount: string };
    };

/**
 * Checks of a round (SPEC §10.1, D-013): whole units, never more than requested, never more than
 * the issuance's units, and a justification when the allocated amount is below the minimum.
 */
export function checkAllocation(input: {
  lines: readonly AllocationLineInput[];
  totalUnits: string;
  nominalValue: string;
  minimumAmount: string | null;
  minimumWaiverJustification: string | null;
}): AllocationFailure[] {
  const failures: AllocationFailure[] = [];
  let total = parseDecimal('0');
  for (const line of input.lines) {
    const allocated = parseDecimal(line.allocatedUnits);
    if (!allocated.isInteger() || allocated.isNegative()) {
      failures.push({ code: 'QUANTITY_NOT_INTEGER', subscriptionId: line.subscriptionId });
      continue;
    }
    if (allocated.gt(parseDecimal(line.requestedUnits)))
      failures.push({ code: 'ALLOCATION_EXCEEDS_REQUEST', subscriptionId: line.subscriptionId });
    total = total.plus(allocated);
  }
  if (total.gt(parseDecimal(input.totalUnits)))
    failures.push({
      code: 'ALLOCATION_EXCEEDS_SUPPLY',
      meta: { totalUnits: input.totalUnits, allocatedUnits: total.toString() },
    });
  const amount = total.times(parseDecimal(input.nominalValue));
  if (
    input.minimumAmount !== null &&
    amount.lt(parseDecimal(input.minimumAmount)) &&
    !input.minimumWaiverJustification?.trim()
  )
    failures.push({
      code: 'MINIMUM_NOT_REACHED_JUSTIFICATION_REQUIRED',
      meta: { minimumAmount: input.minimumAmount, allocatedAmount: amount.toString() },
    });
  return failures;
}

/** Units × nominal value, exact. */
export function allocationAmount(units: string, nominalValue: string): string {
  return parseDecimal(units).times(parseDecimal(nominalValue)).toString();
}
