import { checkTransition } from '@virtus/shared';
import { describe, expect, it } from 'vitest';
import {
  checkTransfer,
  exceedsHoldingLimit,
  transferMachine,
  transferredAcquisition,
  type TransferCheckInput,
} from './transfer.js';

const request: TransferCheckInput = {
  issuanceStatus: 'ALLOCATED',
  transfersAllowed: true,
  lockupEndDate: null,
  today: '2026-09-26',
  quantity: '40',
  fromInvestorId: 'alpine',
  toInvestorId: 'baltic',
};
const code = (changes: Partial<TransferCheckInput>) => checkTransfer({ ...request, ...changes });

describe('transfer checks (SPEC §11.3)', () => {
  it('accept a transfer of whole units between two investors', () => {
    expect(checkTransfer(request)).toBeNull();
    expect(code({ issuanceStatus: 'ACTIVE' })).toBeNull();
  });

  it('refuse issuances without units or closed to transfers', () => {
    expect(code({ issuanceStatus: 'SUBSCRIPTION_CLOSED' })).toBe('TRANSFER_NOT_ALLOWED');
    expect(code({ transfersAllowed: false })).toBe('TRANSFER_NOT_ALLOWED');
  });

  it('refuse a transfer before the end of the lock-up (D-014)', () => {
    expect(code({ lockupEndDate: '2026-09-27' })).toBe('LOCKUP_PERIOD_ACTIVE');
    expect(code({ lockupEndDate: '2026-09-26' })).toBeNull();
  });

  it('refuse fractions, zero, and a transfer to oneself', () => {
    expect(code({ quantity: '0.5' })).toBe('QUANTITY_NOT_INTEGER');
    expect(code({ quantity: '0' })).toBe('QUANTITY_NOT_INTEGER');
    expect(code({ toInvestorId: 'alpine' })).toBe('SELF_TRANSFER_FORBIDDEN');
  });
});

describe('what moves with the units', () => {
  it('moves the matching part of the acquisition amount, exactly', () => {
    expect(transferredAcquisition('100000.00', '100', '40', 2)).toBe('40000');
    expect(transferredAcquisition('100000.00', '3', '1', 2)).toBe('33333.33');
    expect(transferredAcquisition('100000.00', '3', '3', 2)).toBe('100000');
  });

  it('keeps the recipient under the maximum per investor', () => {
    expect(exceedsHoldingLimit('500', '100', '1000.00', '600000.00')).toBe(false);
    expect(exceedsHoldingLimit('500', '101', '1000.00', '600000.00')).toBe(true);
    expect(exceedsHoldingLimit('500', '101', '1000.00', null)).toBe(false);
  });

  it('is approved by a Compliance Officer or an Issuer Administrator only', () => {
    const investor = { userId: 'a', permissions: new Set(['transfer:request']) };
    const officer = { userId: 'o', permissions: new Set(['transfer:approve']) };
    const review = { from: 'COMPLIANCE_REVIEW', to: 'APPROVED' } as const;
    expect(checkTransition(transferMachine, { ...review, actor: investor })).toBe(
      'PERMISSION_DENIED',
    );
    expect(checkTransition(transferMachine, { ...review, actor: officer })).toBeNull();
    expect(
      checkTransition(transferMachine, {
        from: 'COMPLIANCE_REVIEW',
        to: 'REJECTED',
        actor: officer,
      }),
    ).toBe('COMMENT_REQUIRED');
  });
});
