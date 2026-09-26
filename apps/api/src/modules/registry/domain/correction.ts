// Corrections of the ledger (SPEC §10.3, §4.8): never a change of an entry, always new entries.
import { defineStateMachine, parseDecimal } from '@virtus/shared';
import type { LedgerEntryType } from './ledger.js';

export const CORRECTION_STATUSES = ['PROPOSED', 'APPROVED', 'REJECTED'] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

/**
 * Proposed by an Issuer Administrator, decided by a Compliance Officer or another Issuer
 * Administrator (four eyes, SPEC §4.8).
 */
export const correctionMachine = defineStateMachine<CorrectionStatus>({
  resourceType: 'correction_request',
  states: CORRECTION_STATUSES,
  transitions: [
    {
      from: ['PROPOSED'],
      to: 'APPROVED',
      permission: 'registry-correction:approve',
      distinctFromInitiator: true,
    },
    {
      from: ['PROPOSED'],
      to: 'REJECTED',
      permission: 'registry-correction:approve',
      distinctFromInitiator: true,
      commentRequired: true,
    },
  ],
});

export interface CorrectableEntry {
  type: LedgerEntryType;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  quantity: string;
}

export interface Replacement {
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  quantity: string;
}

/**
 * Why an entry cannot be corrected, or null. Blocking and unblocking are undone by their opposite
 * movement, not by a correction; a correction itself can be corrected.
 */
export function correctionRefusal(input: {
  target: CorrectableEntry;
  alreadyReversed: boolean;
  pendingRequest: boolean;
  replacements: readonly Replacement[];
  accountsOfIssuance: ReadonlySet<string>;
}): string | null {
  if (input.target.type === 'BLOCK' || input.target.type === 'UNBLOCK')
    return 'CORRECTION_NOT_SUPPORTED_FOR_TYPE';
  if (input.alreadyReversed) return 'ALREADY_CORRECTED';
  if (input.pendingRequest) return 'CORRECTION_PENDING';
  for (const line of input.replacements) {
    const accounts = [line.sourceAccountId, line.destinationAccountId];
    if (accounts.every((account) => account === null)) return 'REPLACEMENT_WITHOUT_ACCOUNT';
    if (accounts.some((account) => account !== null && !input.accountsOfIssuance.has(account)))
      return 'ACCOUNT_NOT_OF_ISSUANCE';
    const quantity = parseDecimal(line.quantity);
    if (!quantity.isInteger() || !quantity.gt(0)) return 'QUANTITY_NOT_INTEGER';
  }
  return null;
}

/** The counter-entry: the same units, from the destination back to the source. */
export function counterEntry(target: CorrectableEntry): Replacement {
  return {
    sourceAccountId: target.destinationAccountId,
    destinationAccountId: target.sourceAccountId,
    quantity: target.quantity,
  };
}
