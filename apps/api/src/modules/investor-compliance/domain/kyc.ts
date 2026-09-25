import {
  addDays,
  addMonths,
  defineStateMachine,
  KYC_CASE_STATUSES,
  KYC_EXPIRY_WARNING_DAYS,
  KYC_VALIDITY_MONTHS,
  type BusinessDate,
  type KycCaseStatus,
} from '@virtus/shared';

/**
 * Life cycle of a KYC/KYB case (SPEC §8.2, §4.8): prepared by the issuer's staff, decided by a
 * Compliance Officer who did not prepare it, expired by the daily job.
 */
export const kycCaseMachine = defineStateMachine<KycCaseStatus>({
  resourceType: 'kyc_case',
  states: KYC_CASE_STATUSES,
  transitions: [
    { from: ['IN_PROGRESS'], to: 'PENDING_REVIEW', permission: 'kyc:prepare' },
    {
      from: ['PENDING_REVIEW'],
      to: 'APPROVED',
      permission: 'kyc:decide',
      distinctFromInitiator: true,
    },
    {
      from: ['PENDING_REVIEW'],
      to: 'REJECTED',
      permission: 'kyc:decide',
      distinctFromInitiator: true,
      commentRequired: true,
    },
    // Sent back to the preparer for completion.
    {
      from: ['PENDING_REVIEW'],
      to: 'IN_PROGRESS',
      permission: 'kyc:decide',
      commentRequired: true,
    },
    // Only the daily job expires a case.
    { from: ['APPROVED'], to: 'EXPIRED', permission: null },
  ],
});

/** Cases still being worked on: an investor has at most one. */
export const OPEN_KYC_STATUSES: readonly KycCaseStatus[] = ['IN_PROGRESS', 'PENDING_REVIEW'];

/** Last day of validity of a case approved on `decisionDay`. */
export function kycValidUntil(decisionDay: BusinessDate): BusinessDate {
  return addDays(addMonths(decisionDay, KYC_VALIDITY_MONTHS), -1);
}

/** What the daily job does with an approved case on `today` (tenant time zone). */
export function kycExpiryAction(
  validUntil: BusinessDate,
  today: BusinessDate,
  alreadyWarned: boolean,
): 'EXPIRE' | 'WARN' | 'NONE' {
  if (validUntil < today) return 'EXPIRE';
  if (!alreadyWarned && validUntil <= addDays(today, KYC_EXPIRY_WARNING_DAYS)) return 'WARN';
  return 'NONE';
}
