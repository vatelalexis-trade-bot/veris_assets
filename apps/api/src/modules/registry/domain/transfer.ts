// Transfers between investors (SPEC §11, docs/DATA_MODEL.md §4.4), pure.
import {
  defineStateMachine,
  parseDecimal,
  roundDecimal,
  type BusinessDate,
  type ErrorCode,
} from '@veris/shared';

export const TRANSFER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'COMPLIANCE_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXECUTED',
  'CANCELLED',
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

/**
 * The investor submits (units blocked), the request goes to compliance review at once; a
 * Compliance Officer or an Issuer Administrator approves (executed in the same transaction) or
 * rejects with a reason. The investor or the issuer may cancel it until it is decided.
 */
export const transferMachine = defineStateMachine<TransferStatus>({
  resourceType: 'transfer',
  states: TRANSFER_STATUSES,
  transitions: [
    { from: ['DRAFT'], to: 'SUBMITTED', permission: 'transfer:request' },
    { from: ['SUBMITTED'], to: 'COMPLIANCE_REVIEW', permission: 'transfer:request' },
    { from: ['COMPLIANCE_REVIEW'], to: 'APPROVED', permission: 'transfer:approve' },
    { from: ['APPROVED'], to: 'EXECUTED', permission: 'transfer:approve' },
    {
      from: ['COMPLIANCE_REVIEW'],
      to: 'REJECTED',
      permission: 'transfer:approve',
      commentRequired: true,
    },
    {
      from: ['DRAFT', 'SUBMITTED', 'COMPLIANCE_REVIEW'],
      to: 'CANCELLED',
      permission: 'transfer:cancel',
    },
  ],
});

/** Units are blocked from the submission until the decision. */
export const BLOCKED_STATUSES: readonly TransferStatus[] = ['SUBMITTED', 'COMPLIANCE_REVIEW'];

/** Issuances whose units exist in the registry. */
const TRANSFERABLE_ISSUANCES = ['ALLOCATED', 'ACTIVE'];

export interface TransferCheckInput {
  issuanceStatus: string;
  transfersAllowed: boolean;
  lockupEndDate: BusinessDate | null;
  today: BusinessDate;
  quantity: string;
  fromInvestorId: string;
  toInvestorId: string;
}

/**
 * Checks of SPEC §11.3 that need no database: transfers allowed and possible for the issuance,
 * lock-up over (D-014), whole positive quantity, no transfer to oneself. Availability, eligibility
 * and caps are checked by the use case.
 */
export function checkTransfer(
  input: TransferCheckInput,
): Extract<
  ErrorCode,
  | 'TRANSFER_NOT_ALLOWED'
  | 'LOCKUP_PERIOD_ACTIVE'
  | 'QUANTITY_NOT_INTEGER'
  | 'SELF_TRANSFER_FORBIDDEN'
> | null {
  if (!TRANSFERABLE_ISSUANCES.includes(input.issuanceStatus) || !input.transfersAllowed)
    return 'TRANSFER_NOT_ALLOWED';
  if (input.lockupEndDate !== null && input.today < input.lockupEndDate)
    return 'LOCKUP_PERIOD_ACTIVE';
  const quantity = parseDecimal(input.quantity);
  if (!quantity.isInteger() || !quantity.gt(0)) return 'QUANTITY_NOT_INTEGER';
  if (input.fromInvestorId === input.toInvestorId) return 'SELF_TRANSFER_FORBIDDEN';
  return null;
}

/**
 * The part of the sender's acquisition amount that goes with the units: acquisition × quantity /
 * held, rounded to the currency's minor units; all of it when every unit is transferred.
 */
export function transferredAcquisition(
  acquisitionAmount: string,
  held: string,
  quantity: string,
  minorUnits: number,
): string {
  const heldUnits = parseDecimal(held);
  if (heldUnits.isZero() || parseDecimal(quantity).gte(heldUnits))
    return parseDecimal(acquisitionAmount).toString();
  const share = parseDecimal(acquisitionAmount).times(parseDecimal(quantity)).dividedBy(heldUnits);
  return roundDecimal(share, minorUnits).toString();
}

/** Units the recipient would hold, times the nominal value, against the maximum per investor. */
export function exceedsHoldingLimit(
  recipientHeld: string,
  quantity: string,
  nominalValue: string,
  maxAmountPerInvestor: string | null,
): boolean {
  if (maxAmountPerInvestor === null) return false;
  return parseDecimal(recipientHeld)
    .plus(parseDecimal(quantity))
    .times(parseDecimal(nominalValue))
    .gt(parseDecimal(maxAmountPerInvestor));
}
