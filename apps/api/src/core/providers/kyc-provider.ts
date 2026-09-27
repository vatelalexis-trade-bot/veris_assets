import { createHash } from 'node:crypto';
import type { RiskLevel } from '@veris/shared';
import { AppError } from '../errors/app-error.js';

export interface KycCheckRequest {
  /** Identifier of the case, never personal data. */
  caseId: string;
  investorType: 'LEGAL_ENTITY' | 'NATURAL_PERSON';
  countryCode: string;
}

export interface KycCheckResult {
  reference: string;
  /** CLEAR: nothing found; REVIEW: the provider recommends a careful review. */
  outcome: 'CLEAR' | 'REVIEW';
  suggestedRiskLevel: RiskLevel;
}

/**
 * KYC/KYB provider (SPEC §27). Its answer is only a recommendation: the decision is always taken
 * by a Compliance Officer (SPEC §4.4, §4.8).
 */
export interface KycProvider {
  check(request: KycCheckRequest): Promise<KycCheckResult>;
}

export const KYC_PROVIDER = Symbol('KYC_PROVIDER');

/** Countries the fictitious provider flags as higher risk (demonstration only). */
const HIGHER_RISK_COUNTRIES = new Set(['AE', 'SG', 'US', 'CA', 'JP']);

/**
 * Fictitious provider: no real check is made (SPEC §31.2, no real KYC). The mode chooses the
 * answer: `success` (clear), `reject` (review recommended, high risk) or `outage` (unavailable).
 */
export class FakeKycProvider implements KycProvider {
  constructor(private readonly mode: 'success' | 'reject' | 'outage') {}

  check(request: KycCheckRequest): Promise<KycCheckResult> {
    if (this.mode === 'outage') return Promise.reject(new AppError('PROVIDER_UNAVAILABLE'));
    const reference = `FAKE-KYC-${createHash('sha256').update(request.caseId).digest('hex').slice(0, 12).toUpperCase()}`;
    if (this.mode === 'reject') {
      return Promise.resolve({ reference, outcome: 'REVIEW', suggestedRiskLevel: 'HIGH' });
    }
    return Promise.resolve({
      reference,
      outcome: 'CLEAR',
      suggestedRiskLevel: HIGHER_RISK_COUNTRIES.has(request.countryCode) ? 'MEDIUM' : 'LOW',
    });
  }
}
