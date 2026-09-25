import { ELIGIBILITY_RULE_CODES, INVESTOR_CLASSIFICATIONS, INVESTOR_TYPES } from '@virtus/shared';
import { z } from 'zod';
import { paginationQuery } from '../../../core/http/pagination.js';
import type { EligibilityAssessmentRow } from '../application/eligibility.service.js';
import type { EligibilityResult, RuleOutcome } from '../domain/eligibility.js';

const countryCode = z.string().regex(/^[A-Z]{2}$/);

/** Eligibility rules of an issuance (SPEC §6.2 step 3); issuances reuse it in phase 10. */
export const ruleSetSchema = z.strictObject({
  professionalOnly: z.boolean(),
  allowedCountries: z.array(countryCode).max(300),
  excludedCountries: z.array(countryCode).max(300),
  allowedInvestorTypes: z.array(z.enum(INVESTOR_TYPES)),
  allowedClassifications: z.array(z.enum(INVESTOR_CLASSIFICATIONS)),
  kycRequired: z.boolean(),
  kycMinRemainingValidityDays: z.int().min(0).max(3650),
  maxInvestors: z.int().min(1).nullable(),
  rulesVersion: z.int().min(0),
});

export const previewBody = z.strictObject({
  investorId: z.uuid(),
  ruleSet: ruleSetSchema,
  currentInvestorCount: z.int().min(0).optional(),
});

export const eligibilityStatusBody = z.strictObject({
  status: z.enum(['ELIGIBLE', 'NOT_ELIGIBLE', 'SUSPENDED']),
  justification: z.string().trim().min(1).max(4000),
});

const ruleOutcome = z.object({
  code: z.enum(ELIGIBILITY_RULE_CODES),
  passed: z.boolean(),
  detail: z.record(z.string(), z.union([z.string(), z.int(), z.null()])).optional(),
});

export const eligibilityResultView = z.object({
  result: z.enum(['ELIGIBLE', 'NOT_ELIGIBLE']),
  rules: z.array(ruleOutcome),
  rulesVersion: z.string(),
});

export const assessmentListQuery = paginationQuery.extend({
  investorId: z.uuid().optional(),
  context: z.enum(['INVITATION', 'SUBSCRIPTION', 'TRANSFER', 'MANUAL']).optional(),
});

export const assessmentView = eligibilityResultView.extend({
  id: z.uuid(),
  investorId: z.uuid(),
  investorName: z.string(),
  issuanceId: z.uuid().nullable(),
  context: z.enum(['INVITATION', 'SUBSCRIPTION', 'TRANSFER', 'MANUAL']),
  decidedByUserId: z.uuid().nullable(),
  decidedBySystem: z.boolean(),
  justification: z.string().nullable(),
  /** The rule set that was applied (null for a manual decision). */
  ruleSet: ruleSetSchema.nullable(),
  assessedAt: z.iso.datetime(),
});

export function toResultView(result: EligibilityResult): z.infer<typeof eligibilityResultView> {
  return { result: result.result, rules: result.rules, rulesVersion: result.rulesVersion };
}

export function toAssessmentView(
  row: EligibilityAssessmentRow & { investorName: string },
): z.infer<typeof assessmentView> {
  return {
    id: row.id,
    investorId: row.investorId,
    investorName: row.investorName,
    issuanceId: row.issuanceId,
    context: row.context as z.infer<typeof assessmentView>['context'],
    result: row.result as 'ELIGIBLE' | 'NOT_ELIGIBLE',
    rules: row.rules as RuleOutcome[],
    rulesVersion: row.rulesVersion,
    decidedByUserId: row.decidedByUserId,
    decidedBySystem: row.decidedBySystem,
    justification: row.justification,
    ruleSet: (row.ruleSet as z.infer<typeof ruleSetSchema> | null) ?? null,
    assessedAt: row.assessedAt.toISOString(),
  };
}
