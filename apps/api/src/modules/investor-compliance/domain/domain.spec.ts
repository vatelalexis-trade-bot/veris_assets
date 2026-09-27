import { checkTransition } from '@veris/shared';
import { describe, expect, it } from 'vitest';
import { kycCaseMachine, kycExpiryAction, kycValidUntil } from './kyc.js';
import { normaliseRecipientCode, RECIPIENT_CODE, recipientCodeFrom } from './recipient-code.js';

const operator = { userId: 'operator', permissions: new Set(['kyc:prepare']) };
const compliance = { userId: 'compliance', permissions: new Set(['kyc:decide']) };
const system = { userId: null, permissions: new Set<string>() };

describe('KYC case life cycle', () => {
  it('is prepared by the staff and decided by a Compliance Officer', () => {
    expect(
      checkTransition(kycCaseMachine, {
        from: 'IN_PROGRESS',
        to: 'PENDING_REVIEW',
        actor: operator,
      }),
    ).toBeNull();
    expect(
      checkTransition(kycCaseMachine, {
        from: 'PENDING_REVIEW',
        to: 'APPROVED',
        actor: compliance,
        initiatorUserId: 'operator',
      }),
    ).toBeNull();
    expect(
      checkTransition(kycCaseMachine, { from: 'PENDING_REVIEW', to: 'APPROVED', actor: operator }),
    ).toBe('PERMISSION_DENIED');
  });

  it('never lets the preparer decide (four eyes, SPEC §4.8)', () => {
    const both = { userId: 'same', permissions: new Set(['kyc:prepare', 'kyc:decide']) };
    expect(
      checkTransition(kycCaseMachine, {
        from: 'PENDING_REVIEW',
        to: 'APPROVED',
        actor: both,
        initiatorUserId: 'same',
      }),
    ).toBe('FOUR_EYES_VIOLATION');
  });

  it('requires a comment to reject or send back, and lets only the system expire', () => {
    const request = {
      from: 'PENDING_REVIEW',
      actor: compliance,
      initiatorUserId: 'operator',
    } as const;
    expect(checkTransition(kycCaseMachine, { ...request, to: 'REJECTED' })).toBe(
      'COMMENT_REQUIRED',
    );
    expect(checkTransition(kycCaseMachine, { ...request, to: 'IN_PROGRESS' })).toBe(
      'COMMENT_REQUIRED',
    );
    expect(
      checkTransition(kycCaseMachine, { from: 'APPROVED', to: 'EXPIRED', actor: compliance }),
    ).toBe('PERMISSION_DENIED');
    expect(
      checkTransition(kycCaseMachine, { from: 'APPROVED', to: 'EXPIRED', actor: system }),
    ).toBeNull();
    expect(
      checkTransition(kycCaseMachine, { from: 'REJECTED', to: 'APPROVED', actor: compliance }),
    ).toBe('INVALID_STATE_TRANSITION');
  });

  it('is valid 12 months, up to the day before the anniversary', () => {
    expect(kycValidUntil('2026-09-25')).toBe('2027-09-24');
    expect(kycValidUntil('2028-02-29')).toBe('2029-02-27');
  });

  it('is warned 30 days before expiry, once, and expired the day after its last valid day', () => {
    expect(kycExpiryAction('2026-10-25', '2026-09-25', false)).toBe('WARN');
    expect(kycExpiryAction('2026-10-26', '2026-09-25', false)).toBe('NONE');
    expect(kycExpiryAction('2026-10-25', '2026-09-25', true)).toBe('NONE');
    expect(kycExpiryAction('2026-09-25', '2026-09-25', true)).toBe('NONE');
    expect(kycExpiryAction('2026-09-24', '2026-09-25', true)).toBe('EXPIRE');
  });
});

describe('recipient code (D-010)', () => {
  it('has a readable format without ambiguous letters', () => {
    const code = recipientCodeFrom([0, 1, 18, 19, 20, 27, 30, 31]);
    expect(code).toBe('VA-01JK-MVYZ');
    expect(RECIPIENT_CODE.test(code)).toBe(true);
    expect(RECIPIENT_CODE.test('VA-01IL-MVYZ')).toBe(false);
  });

  it('accepts codes typed with spaces or in lower case', () => {
    expect(normaliseRecipientCode(' va-01jk - mvyz ')).toBe('VA-01JK-MVYZ');
  });
});
