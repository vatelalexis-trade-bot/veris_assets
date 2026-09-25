import { describe, expect, it } from 'vitest';
import { STATUS_DOMAINS, STATUS_TONES, statusLabelKey, statusTone } from './status-map.js';

describe('status map', () => {
  it('covers the six business domains with statuses, and the audit results', () => {
    expect(STATUS_DOMAINS).toEqual([
      'issuance',
      'subscription',
      'kyc',
      'eligibility',
      'transfer',
      'distribution',
      'auditResult',
    ]);
  });

  it('lists exactly the issuance statuses of SPEC §7', () => {
    expect(Object.keys(STATUS_TONES.issuance)).toEqual([
      'DRAFT',
      'UNDER_REVIEW',
      'APPROVED',
      'SUBSCRIPTION_OPEN',
      'SUBSCRIPTION_CLOSED',
      'ALLOCATED',
      'ACTIVE',
      'MATURED',
      'CANCELLED',
    ]);
  });

  it('uses warning for waiting states and error for rejections (SPEC §23.1)', () => {
    expect(statusTone('subscription', 'PAYMENT_PENDING')).toBe('warning');
    expect(statusTone('transfer', 'REJECTED')).toBe('error');
    expect(statusTone('kyc', 'APPROVED')).toBe('success');
  });

  it('builds translation keys', () => {
    expect(statusLabelKey('kyc', 'EXPIRED')).toBe('status.kyc.EXPIRED');
  });
});
