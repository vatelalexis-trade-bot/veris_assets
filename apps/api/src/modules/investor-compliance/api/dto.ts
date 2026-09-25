import {
  INVESTOR_CLASSIFICATIONS,
  INVESTOR_TYPES,
  KYC_CASE_STATUSES,
  KYC_STATUSES,
  PROFILE_STATUSES,
  RISK_LEVELS,
  ELIGIBILITY_STATUSES,
  parseDecimal,
  type EligibilityStatus,
  type InvestorClassification,
  type InvestorType,
  type KycCaseStatus,
  type KycStatus,
  type ProfileStatus,
  type RiskLevel,
} from '@virtus/shared';
import { z } from 'zod';
import { paginationQuery } from '../../../core/http/pagination.js';
import type {
  BeneficialOwnerRow,
  ComplianceCommentRow,
  InvestorRow,
  RepresentativeRow,
} from '../application/investors.service.js';
import {
  KYC_DOCUMENT_KINDS,
  type KycCaseDetail,
  type KycCaseRow,
} from '../application/kyc.service.js';

const countryCode = z.string().regex(/^[A-Z]{2}$/);
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();
const businessDate = z.iso.date();

export const address = z.strictObject({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullable().optional(),
  postalCode: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(100),
  countryCode,
});

const contact = {
  address: address.nullable().optional(),
  contactEmail: z.email().max(254).nullable().optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ().-]{6,25}$/)
    .nullable()
    .optional(),
};

export const investorCreateBody = z.strictObject({
  type: z.enum(INVESTOR_TYPES),
  legalName: z.string().trim().min(1).max(200),
  tradeName: optionalText(200),
  legalForm: optionalText(100),
  registrationNumber: optionalText(100),
  taxId: optionalText(50),
  countryOfIncorporation: countryCode,
  classification: z.enum(INVESTOR_CLASSIFICATIONS),
  profileStatus: z.enum(PROFILE_STATUSES).optional(),
  ...contact,
});

export const investorUpdateBody = investorCreateBody.partial();

export const ownProfileBody = z
  .strictObject({ tradeName: optionalText(200), ...contact })
  .partial();

export const investorListQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  kycStatus: z.enum(KYC_STATUSES).optional(),
  profileStatus: z.enum(PROFILE_STATUSES).optional(),
});

export const investorView = z.object({
  id: z.uuid(),
  type: z.enum(INVESTOR_TYPES),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  legalForm: z.string().nullable(),
  registrationNumber: z.string().nullable(),
  taxId: z.string().nullable(),
  countryOfIncorporation: z.string(),
  address: address.nullable(),
  contactEmail: z.string().nullable(),
  phone: z.string().nullable(),
  classification: z.enum(INVESTOR_CLASSIFICATIONS),
  profileStatus: z.enum(PROFILE_STATUSES),
  kycStatus: z.enum(KYC_STATUSES),
  kycLastReviewDate: businessDate.nullable(),
  kycExpiryDate: businessDate.nullable(),
  riskLevel: z.enum(RISK_LEVELS).nullable(),
  eligibilityStatus: z.enum(ELIGIBILITY_STATUSES),
  recipientCode: z.string(),
  version: z.int(),
  createdAt: z.iso.datetime(),
});

export function toInvestorView(row: InvestorRow): z.infer<typeof investorView> {
  return {
    id: row.id,
    type: row.type as InvestorType,
    legalName: row.legalName,
    tradeName: row.tradeName,
    legalForm: row.legalForm,
    registrationNumber: row.registrationNumber,
    taxId: row.taxId,
    countryOfIncorporation: row.countryOfIncorporation,
    address: (row.address as z.infer<typeof address> | null) ?? null,
    contactEmail: row.contactEmail,
    phone: row.phone,
    classification: row.classification as InvestorClassification,
    profileStatus: row.profileStatus as ProfileStatus,
    kycStatus: row.kycStatus as KycStatus,
    kycLastReviewDate: row.kycLastReviewDate,
    kycExpiryDate: row.kycExpiryDate,
    riskLevel: row.riskLevel as RiskLevel | null,
    eligibilityStatus: row.eligibilityStatus as EligibilityStatus,
    recipientCode: row.recipientCode,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

// Representatives and beneficial owners [DP]

export const representativeBody = z.strictObject({
  fullName: z.string().trim().min(1).max(200),
  title: optionalText(100),
  email: z.email().max(254).nullable().optional(),
  phone: contact.phone,
  dateOfBirth: businessDate.nullable().optional(),
});

export const beneficialOwnerBody = z.strictObject({
  fullName: z.string().trim().min(1).max(200),
  nationality: countryCode.nullable().optional(),
  // A decimal string, never a float (SPEC §31.2): "25" or "25.5" or "25.50".
  ownershipPercentage: z
    .string()
    .regex(/^(100(\.0{1,2})?|[0-9]{1,2}(\.[0-9]{1,2})?)$/)
    .refine((value) => parseDecimal(value).greaterThan(0), { message: 'Must be more than 0' }),
  dateOfBirth: businessDate.nullable().optional(),
});

export const representativeView = z.object({
  id: z.uuid(),
  fullName: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  dateOfBirth: businessDate.nullable(),
  pseudonymized: z.boolean(),
});

export const beneficialOwnerView = z.object({
  id: z.uuid(),
  fullName: z.string(),
  nationality: z.string().nullable(),
  ownershipPercentage: z.string(),
  dateOfBirth: businessDate.nullable(),
  pseudonymized: z.boolean(),
});

export function toRepresentativeView(row: RepresentativeRow): z.infer<typeof representativeView> {
  return {
    id: row.id,
    fullName: row.fullName,
    title: row.title,
    email: row.email,
    phone: row.phone,
    dateOfBirth: row.dateOfBirth,
    pseudonymized: row.pseudonymizedAt !== null,
  };
}

export function toBeneficialOwnerView(
  row: BeneficialOwnerRow,
): z.infer<typeof beneficialOwnerView> {
  return {
    id: row.id,
    fullName: row.fullName,
    nationality: row.nationality,
    ownershipPercentage: row.ownershipPercentage,
    dateOfBirth: row.dateOfBirth,
    pseudonymized: row.pseudonymizedAt !== null,
  };
}

// Compliance comments

export const commentBody = z.strictObject({
  body: z.string().trim().min(1).max(4000),
  kycCaseId: z.uuid().optional(),
});

export const commentView = z.object({
  id: z.uuid(),
  resourceType: z.string(),
  resourceId: z.uuid(),
  authorUserId: z.uuid(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});

export function toCommentView(row: ComplianceCommentRow): z.infer<typeof commentView> {
  return {
    id: row.id,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    authorUserId: row.authorUserId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

// KYC/KYB cases

export const kycListQuery = paginationQuery.extend({
  investorId: z.uuid().optional(),
  status: z.enum(KYC_CASE_STATUSES).optional(),
});

export const kycOpenBody = z.strictObject({ investorId: z.uuid() });
export const kycAttachBody = z.strictObject({
  documentId: z.uuid(),
  kind: z.enum(KYC_DOCUMENT_KINDS),
});
export const kycApproveBody = z.strictObject({
  comment: z.string().trim().max(4000).nullable().optional(),
});
export const kycCommentBody = z.strictObject({ comment: z.string().trim().min(1).max(4000) });

export const kycCaseView = z.object({
  id: z.uuid(),
  investorId: z.uuid(),
  status: z.enum(KYC_CASE_STATUSES),
  preparedBy: z.uuid(),
  preparedAt: z.iso.datetime(),
  decidedBy: z.uuid().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decisionComment: z.string().nullable(),
  validUntil: businessDate.nullable(),
  providerReference: z.string().nullable(),
  providerOutcome: z.enum(['CLEAR', 'REVIEW']).nullable(),
  suggestedRiskLevel: z.enum(RISK_LEVELS).nullable(),
  updatedAt: z.iso.datetime(),
});

export const kycCaseListItem = kycCaseView.extend({ investorName: z.string() });

export const kycCaseDetail = kycCaseView.extend({
  documents: z.array(
    z.object({
      documentId: z.uuid(),
      kind: z.enum(KYC_DOCUMENT_KINDS),
      name: z.string(),
      attachedAt: z.iso.datetime(),
    }),
  ),
});

export function toKycCaseView(row: KycCaseRow): z.infer<typeof kycCaseView> {
  return {
    id: row.id,
    investorId: row.investorId,
    status: row.status as KycCaseStatus,
    preparedBy: row.preparedBy,
    preparedAt: row.preparedAt.toISOString(),
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionComment: row.decisionComment,
    validUntil: row.validUntil,
    providerReference: row.providerReference,
    providerOutcome: row.providerOutcome as 'CLEAR' | 'REVIEW' | null,
    suggestedRiskLevel: row.suggestedRiskLevel as RiskLevel | null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toKycCaseDetail(row: KycCaseDetail): z.infer<typeof kycCaseDetail> {
  return {
    ...toKycCaseView(row),
    documents: row.documents.map((item) => ({
      documentId: item.documentId,
      kind: item.kind as (typeof KYC_DOCUMENT_KINDS)[number],
      name: item.name,
      attachedAt: item.attachedAt.toISOString(),
    })),
  };
}
