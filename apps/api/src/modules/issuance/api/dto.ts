import {
  ASSET_CATEGORIES,
  BUSINESS_DAY_CONVENTIONS,
  CURRENCY_MINOR_UNITS,
  DAY_COUNTS,
  DISTRIBUTION_FREQUENCIES,
  INVESTOR_CLASSIFICATIONS,
  INVESTOR_TYPES,
  ISSUANCE_DOCUMENT_KINDS,
  ISSUANCE_STATUSES,
  ISSUANCE_TERMS_RULE_CODES,
  ISSUANCE_WIZARD_STEPS,
  PRINCIPAL_REPAYMENTS,
  RATE_TYPES,
  ROUNDING_METHODS,
  isCurrencyCode,
  parseDecimal,
  type IssuanceStatus,
  type IssuanceWizardStep,
} from '@virtus/shared';
import { z } from 'zod';
import { paginationQuery } from '../../../core/http/pagination.js';
import type { IssuanceDetail } from '../application/issuances.service.js';

const countryCode = z.string().regex(/^[A-Z]{2}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
/** Amounts travel as decimal strings (SPEC §21.2): "5000000.00". */
const amount = z.string().regex(/^\d{1,20}(\.\d{1,4})?$/, 'A positive decimal, e.g. 1000.00');
const businessDate = z.iso.date();

export const issuanceCreateBody = z.strictObject({
  name: text(200),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{2,20}$/),
  description: optionalText(4000),
  assetCategory: z.enum(ASSET_CATEGORIES).nullable().optional(),
  countryCode: countryCode.nullable().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .optional(),
  legalIssuerName: optionalText(200),
  spvName: optionalText(200),
});

export const issuanceUpdateBody = issuanceCreateBody
  .partial()
  .extend({ wizardStep: z.enum(ISSUANCE_WIZARD_STEPS).optional() });

export const termsBody = z
  .strictObject({
    targetAmount: amount.nullable(),
    minimumAmount: amount.nullable(),
    maximumAmount: amount.nullable(),
    nominalValue: amount.nullable(),
    totalUnits: z
      .string()
      .regex(/^\d{1,20}(\.\d{1,4})?$/)
      .nullable(),
    // Fraction: "0.05" for 5 %; a negative rate is refused at submission (SPEC §6.3).
    interestRate: z
      .string()
      .regex(/^-?\d{1,3}(\.\d{1,6})?$/)
      .nullable(),
    rateType: z.string().max(20).nullable(),
    distributionFrequency: z.string().max(20).nullable(),
    dayCount: z.enum(DAY_COUNTS).nullable(),
    issueDate: businessDate.nullable(),
    maturityDate: businessDate.nullable(),
    subscriptionStartDate: businessDate.nullable(),
    subscriptionEndDate: businessDate.nullable(),
    minSubscriptionAmount: amount.nullable(),
    maxAmountPerInvestor: amount.nullable(),
    gracePeriodDays: z.int().min(0).max(365),
    principalRepayment: z.enum(PRINCIPAL_REPAYMENTS),
    roundingMethod: z.enum(ROUNDING_METHODS),
    businessDayConvention: z.enum(BUSINESS_DAY_CONVENTIONS),
    recordDateOffsetBusinessDays: z.int().min(0).max(30),
    earlyRedemptionAllowed: z.boolean(),
  })
  .partial();

export const rulesBody = z
  .strictObject({
    professionalOnly: z.boolean(),
    allowedCountries: z.array(countryCode).max(300),
    excludedCountries: z.array(countryCode).max(300),
    allowedInvestorTypes: z.array(z.enum(INVESTOR_TYPES)),
    allowedClassifications: z.array(z.enum(INVESTOR_CLASSIFICATIONS)),
    kycRequired: z.boolean(),
    kycMinRemainingValidityDays: z.int().min(0).max(3650),
    transfersAllowed: z.boolean(),
    manualTransferApproval: z.boolean(),
    maxInvestors: z.int().min(1).nullable(),
    lockupEndDate: businessDate.nullable(),
  })
  .partial();

export const listQuery = paginationQuery.extend({
  status: z.enum(ISSUANCE_STATUSES).optional(),
  assetCategory: z.enum(ASSET_CATEGORIES).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  q: z.string().trim().max(100).optional(),
});

export const commentBody = z.strictObject({ comment: z.string().trim().min(1).max(4000) });
export const inviteBody = z.strictObject({ investorId: z.uuid() });
export const attachBody = z.strictObject({
  documentId: z.uuid(),
  kind: z.enum(ISSUANCE_DOCUMENT_KINDS),
});

const termsView = z.object({
  targetAmount: z.string().nullable(),
  minimumAmount: z.string().nullable(),
  maximumAmount: z.string().nullable(),
  nominalValue: z.string().nullable(),
  totalUnits: z.string().nullable(),
  interestRate: z.string().nullable(),
  rateType: z.enum(RATE_TYPES).nullable(),
  distributionFrequency: z.enum(DISTRIBUTION_FREQUENCIES).nullable(),
  dayCount: z.enum(DAY_COUNTS).nullable(),
  issueDate: businessDate.nullable(),
  maturityDate: businessDate.nullable(),
  subscriptionStartDate: businessDate.nullable(),
  subscriptionEndDate: businessDate.nullable(),
  minSubscriptionAmount: z.string().nullable(),
  maxAmountPerInvestor: z.string().nullable(),
  gracePeriodDays: z.int(),
  principalRepayment: z.enum(PRINCIPAL_REPAYMENTS),
  roundingMethod: z.enum(ROUNDING_METHODS),
  businessDayConvention: z.enum(BUSINESS_DAY_CONVENTIONS),
  recordDateOffsetBusinessDays: z.int(),
  earlyRedemptionAllowed: z.boolean(),
  version: z.int(),
});

const rulesView = z.object({
  professionalOnly: z.boolean(),
  allowedCountries: z.array(z.string()),
  excludedCountries: z.array(z.string()),
  allowedInvestorTypes: z.array(z.enum(INVESTOR_TYPES)),
  allowedClassifications: z.array(z.enum(INVESTOR_CLASSIFICATIONS)),
  kycRequired: z.boolean(),
  kycMinRemainingValidityDays: z.int(),
  transfersAllowed: z.boolean(),
  manualTransferApproval: z.boolean(),
  maxInvestors: z.int().nullable(),
  lockupEndDate: businessDate.nullable(),
  rulesVersion: z.int(),
  version: z.int(),
});

export const issuanceView = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  assetCategory: z.enum(ASSET_CATEGORIES).nullable(),
  countryCode: z.string().nullable(),
  currency: z.string().nullable(),
  legalIssuerName: z.string().nullable(),
  spvName: z.string().nullable(),
  status: z.enum(ISSUANCE_STATUSES),
  wizardStep: z.enum(ISSUANCE_WIZARD_STEPS),
  submittedBy: z.uuid().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  approvedBy: z.uuid().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  statusComment: z.string().nullable(),
  version: z.int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  terms: termsView,
  eligibilityRules: rulesView,
});

export const checksView = z.object({
  consistent: z.boolean(),
  failures: z.array(
    z.object({ code: z.enum(ISSUANCE_TERMS_RULE_CODES), field: z.string().nullable() }),
  ),
});

export const transitionView = z.object({
  fromStatus: z.enum(ISSUANCE_STATUSES).nullable(),
  toStatus: z.enum(ISSUANCE_STATUSES),
  actorUserId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  comment: z.string().nullable(),
  occurredAt: z.iso.datetime(),
});

export const invitationView = z.object({
  id: z.uuid(),
  investorId: z.uuid(),
  investorName: z.string(),
  status: z.enum(['INVITED', 'REVOKED']),
  eligibilityAssessmentId: z.uuid(),
  invitedAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});

export const issuanceDocumentView = z.object({
  documentId: z.uuid(),
  kind: z.enum(ISSUANCE_DOCUMENT_KINDS),
  name: z.string(),
  confidentiality: z.string(),
  status: z.string(),
});

/** Amounts with the currency's decimals ("5000000.00"), other decimals without trailing zeros. */
function decimal(value: string | null, places?: number): string | null {
  if (value === null) return null;
  const parsed = parseDecimal(value);
  return places === undefined ? parsed.toString() : parsed.toFixed(places);
}

export function toIssuanceView({
  issuance,
  terms,
  rules,
}: IssuanceDetail): z.infer<typeof issuanceView> {
  const places =
    issuance.currency && isCurrencyCode(issuance.currency)
      ? CURRENCY_MINOR_UNITS[issuance.currency]
      : undefined;
  const money = (value: string | null) => decimal(value, places);
  return {
    id: issuance.id,
    name: issuance.name,
    code: issuance.code,
    description: issuance.description,
    assetCategory: issuance.assetCategory as z.infer<typeof issuanceView>['assetCategory'],
    countryCode: issuance.countryCode,
    currency: issuance.currency,
    legalIssuerName: issuance.legalIssuerName,
    spvName: issuance.spvName,
    status: issuance.status as IssuanceStatus,
    wizardStep: issuance.wizardStep as IssuanceWizardStep,
    submittedBy: issuance.submittedBy,
    submittedAt: issuance.submittedAt?.toISOString() ?? null,
    approvedBy: issuance.approvedBy,
    approvedAt: issuance.approvedAt?.toISOString() ?? null,
    statusComment: issuance.statusComment,
    version: issuance.version,
    createdAt: issuance.createdAt.toISOString(),
    updatedAt: issuance.updatedAt.toISOString(),
    terms: {
      targetAmount: money(terms.targetAmount),
      minimumAmount: money(terms.minimumAmount),
      maximumAmount: money(terms.maximumAmount),
      nominalValue: money(terms.nominalValue),
      totalUnits: decimal(terms.totalUnits),
      interestRate: decimal(terms.interestRate),
      rateType: terms.rateType as 'FIXED' | null,
      distributionFrequency: terms.distributionFrequency as z.infer<
        typeof termsView
      >['distributionFrequency'],
      dayCount: terms.dayCount as z.infer<typeof termsView>['dayCount'],
      issueDate: terms.issueDate,
      maturityDate: terms.maturityDate,
      subscriptionStartDate: terms.subscriptionStartDate,
      subscriptionEndDate: terms.subscriptionEndDate,
      minSubscriptionAmount: money(terms.minSubscriptionAmount),
      maxAmountPerInvestor: money(terms.maxAmountPerInvestor),
      gracePeriodDays: terms.gracePeriodDays,
      principalRepayment: terms.principalRepayment as 'AT_MATURITY',
      roundingMethod: terms.roundingMethod as z.infer<typeof termsView>['roundingMethod'],
      businessDayConvention: terms.businessDayConvention as z.infer<
        typeof termsView
      >['businessDayConvention'],
      recordDateOffsetBusinessDays: terms.recordDateOffsetBusinessDays,
      earlyRedemptionAllowed: terms.earlyRedemptionAllowed,
      version: terms.version,
    },
    eligibilityRules: {
      professionalOnly: rules.professionalOnly,
      allowedCountries: rules.allowedCountries,
      excludedCountries: rules.excludedCountries,
      allowedInvestorTypes: rules.allowedInvestorTypes as z.infer<
        typeof rulesView
      >['allowedInvestorTypes'],
      allowedClassifications: rules.allowedClassifications as z.infer<
        typeof rulesView
      >['allowedClassifications'],
      kycRequired: rules.kycRequired,
      kycMinRemainingValidityDays: rules.kycMinRemainingValidityDays,
      transfersAllowed: rules.transfersAllowed,
      manualTransferApproval: rules.manualTransferApproval,
      maxInvestors: rules.maxInvestors,
      lockupEndDate: rules.lockupEndDate,
      rulesVersion: rules.rulesVersion,
      version: rules.version,
    },
  };
}
