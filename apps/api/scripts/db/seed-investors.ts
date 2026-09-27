// Demonstration investors (P8-6, SPEC §28): 20 fictitious institutional investors in Northwind,
// covering every KYC situation (approved, expiring soon, expired, pending review, in preparation,
// rejected, not started) and a country the demo issuances will exclude; 2 in Contoso.
import { createHash } from 'node:crypto';
import { addDays, dateInTimeZone, type KycCaseStatus } from '@veris/shared';
import { ELIGIBILITY_ENGINE_VERSION } from '../../src/modules/investor-compliance/domain/eligibility.js';
import { kycValidUntil } from '../../src/modules/investor-compliance/domain/kyc.js';
import { recipientCodeFrom } from '../../src/modules/investor-compliance/domain/recipient-code.js';
import { deterministicUuid } from './deterministic-id.js';

type Kyc =
  'APPROVED' | 'EXPIRING' | 'EXPIRED' | 'PENDING_REVIEW' | 'IN_PROGRESS' | 'REJECTED' | 'NONE';

interface DemoInvestor {
  key: string;
  tenant: 'northwind' | 'contoso';
  legalName: string;
  legalForm: string;
  country: string;
  city: string;
  classification: 'PROFESSIONAL' | 'ELIGIBLE_COUNTERPARTY';
  kyc: Kyc;
  profileStatus?: 'DRAFT' | 'ACTIVE';
}

// prettier-ignore
const INVESTORS: readonly DemoInvestor[] = [
  { key: 'alpine', tenant: 'northwind', legalName: 'Alpine Capital Partners SAS (demo)', legalForm: 'SAS', country: 'FR', city: 'Lyon', classification: 'PROFESSIONAL', kyc: 'APPROVED' },
  { key: 'baltic', tenant: 'northwind', legalName: 'Baltic Pension Fund SICAV (demo)', legalForm: 'SICAV', country: 'LU', city: 'Luxembourg', classification: 'ELIGIBLE_COUNTERPARTY', kyc: 'APPROVED' },
  { key: 'cedar', tenant: 'northwind', legalName: 'Cedar Family Office SA (demo)', legalForm: 'SA', country: 'CH', city: 'Geneva', classification: 'PROFESSIONAL', kyc: 'APPROVED' },
  { key: 'danube', tenant: 'northwind', legalName: 'Danube Versicherung AG (demo)', legalForm: 'AG', country: 'DE', city: 'Munich', classification: 'ELIGIBLE_COUNTERPARTY', kyc: 'APPROVED' },
  { key: 'estuary', tenant: 'northwind', legalName: 'Estuary Investments BV (demo)', legalForm: 'BV', country: 'NL', city: 'Rotterdam', classification: 'PROFESSIONAL', kyc: 'APPROVED' },
  { key: 'fjord', tenant: 'northwind', legalName: 'Fjord Kapital AS (demo)', legalForm: 'AS', country: 'NO', city: 'Oslo', classification: 'PROFESSIONAL', kyc: 'APPROVED' },
  { key: 'granite', tenant: 'northwind', legalName: 'Granite Mutual SGR (demo)', legalForm: 'SpA', country: 'IT', city: 'Milan', classification: 'PROFESSIONAL', kyc: 'APPROVED' },
  { key: 'heron', tenant: 'northwind', legalName: 'Heron Gestión SGIIC (demo)', legalForm: 'SA', country: 'ES', city: 'Madrid', classification: 'PROFESSIONAL', kyc: 'APPROVED' },
  { key: 'ivy', tenant: 'northwind', legalName: 'Ivy Endowment Trust (demo)', legalForm: 'Trust', country: 'GB', city: 'London', classification: 'PROFESSIONAL', kyc: 'APPROVED' },
  { key: 'jasper', tenant: 'northwind', legalName: 'Jasper Asset Management NV (demo)', legalForm: 'NV', country: 'BE', city: 'Brussels', classification: 'PROFESSIONAL', kyc: 'APPROVED' },
  { key: 'kilnworth', tenant: 'northwind', legalName: 'Kilnworth Pension Scheme DAC (demo)', legalForm: 'DAC', country: 'IE', city: 'Dublin', classification: 'ELIGIBLE_COUNTERPARTY', kyc: 'APPROVED' },
  { key: 'lumen', tenant: 'northwind', legalName: 'Lumen Kapitalförvaltning AB (demo)', legalForm: 'AB', country: 'SE', city: 'Stockholm', classification: 'PROFESSIONAL', kyc: 'APPROVED' },
  { key: 'harbour', tenant: 'northwind', legalName: 'Harbour Insurance Group plc (demo)', legalForm: 'plc', country: 'IE', city: 'Cork', classification: 'PROFESSIONAL', kyc: 'EXPIRING' },
  { key: 'iris', tenant: 'northwind', legalName: 'Iris Asset Holdings GmbH (demo)', legalForm: 'GmbH', country: 'DE', city: 'Frankfurt', classification: 'PROFESSIONAL', kyc: 'EXPIRED' },
  { key: 'juniper', tenant: 'northwind', legalName: 'Juniper Ventures LLC (demo)', legalForm: 'LLC', country: 'US', city: 'New York', classification: 'PROFESSIONAL', kyc: 'APPROVED' },
  { key: 'kestrel', tenant: 'northwind', legalName: 'Kestrel Treasury BV (demo)', legalForm: 'BV', country: 'NL', city: 'Amsterdam', classification: 'PROFESSIONAL', kyc: 'PENDING_REVIEW' },
  { key: 'linden', tenant: 'northwind', legalName: 'Linden Endowment ASBL (demo)', legalForm: 'ASBL', country: 'BE', city: 'Ghent', classification: 'PROFESSIONAL', kyc: 'IN_PROGRESS' },
  { key: 'maple', tenant: 'northwind', legalName: 'Maple Holdings Pte Ltd (demo)', legalForm: 'Pte Ltd', country: 'SG', city: 'Singapore', classification: 'PROFESSIONAL', kyc: 'REJECTED' },
  { key: 'nordic', tenant: 'northwind', legalName: 'Nordic Growth Fund Oy (demo)', legalForm: 'Oy', country: 'FI', city: 'Helsinki', classification: 'PROFESSIONAL', kyc: 'NONE' },
  { key: 'orchard', tenant: 'northwind', legalName: 'Orchard Seguros SA (demo)', legalForm: 'SA', country: 'PT', city: 'Lisbon', classification: 'PROFESSIONAL', kyc: 'NONE', profileStatus: 'DRAFT' },
  { key: 'quarry', tenant: 'contoso', legalName: 'Quarry Capital SARL (demo)', legalForm: 'SARL', country: 'LU', city: 'Esch-sur-Alzette', classification: 'PROFESSIONAL', kyc: 'APPROVED' },
  { key: 'reed', tenant: 'contoso', legalName: 'Reed Pensioenfonds (demo)', legalForm: 'Stichting', country: 'NL', city: 'Utrecht', classification: 'ELIGIBLE_COUNTERPARTY', kyc: 'APPROVED' },
];

/** Portal accounts of the investors (decision D-017). */
export const INVESTOR_OF_ACCOUNT: Record<string, string> = {
  'investor.a@example.com': investorId('alpine'),
  'investor.b@example.com': investorId('baltic'),
  'investor.c@example.com': investorId('cedar'),
  // KYC/KYB expired: its subscription is refused (scenario 2 of SPEC §29).
  'investor.d@example.com': investorId('iris'),
};

export function investorId(key: string): string {
  return deterministicUuid(`investor:${key}`);
}

const userId = (email: string) => deterministicUuid(`user:${email}`);

export function recipientCode(key: string): string {
  const bytes = createHash('sha256').update(`recipient:${key}`).digest();
  return recipientCodeFrom([...bytes.subarray(0, 8)]);
}

/** Rows of every table, for a given day (dates are relative, so the scenarios stay playable). */
export function demoInvestorRows(
  tenantIds: Record<'northwind' | 'contoso', string>,
  now = new Date(),
) {
  const today = dateInTimeZone(now, 'Europe/Paris');
  const investors = [];
  const cases = [];
  const eligibilityDecisions = {
    assessments: [] as {
      id: string;
      tenantId: string;
      investorId: string;
      issuanceId: null;
      context: string;
      result: string;
      rules: never[];
      rulesVersion: string;
      decidedByUserId: string;
      decidedBySystem: boolean;
      justification: string;
      assessedAt: Date;
    }[],
    transitions: [] as {
      id: string;
      tenantId: string;
      resourceType: string;
      resourceId: string;
      fromStatus: string;
      toStatus: string;
      actorUserId: string;
      actorRole: string;
      comment: string;
      occurredAt: Date;
    }[],
  };
  for (const [index, demo] of INVESTORS.entries()) {
    const id = investorId(demo.key);
    const tenantId = tenantIds[demo.tenant];
    const staff =
      demo.tenant === 'northwind'
        ? {
            preparer: userId('northwind.operator@example.com'),
            decider: userId('northwind.compliance@example.com'),
          }
        : {
            preparer: userId('contoso.operator@example.com'),
            decider: userId('contoso.admin@example.com'),
          };
    // Decision day of an approval: a spread of past days; the expiring and expired ones are older.
    const decidedOn =
      demo.kyc === 'EXPIRING'
        ? addDays(today, -345)
        : demo.kyc === 'EXPIRED'
          ? // Expired 11 days ago: still valid when invited to the debt issuance (scenario 2).
            addDays(today, -375)
          : addDays(today, -(30 + index * 9));
    const status: KycCaseStatus | null =
      demo.kyc === 'NONE' ? null : demo.kyc === 'EXPIRING' ? 'APPROVED' : demo.kyc;
    const validUntil =
      status === 'APPROVED' || status === 'EXPIRED' ? kycValidUntil(decidedOn) : null;
    const decided = status === 'APPROVED' || status === 'EXPIRED' || status === 'REJECTED';
    // General eligibility decided by the Compliance Officer the day after the KYC/KYB decision:
    // eligible once approved, not eligible once rejected; the others are not assessed yet.
    // (Northwind only: Contoso has no Compliance Officer.)
    const eligibility =
      demo.tenant !== 'northwind'
        ? 'NOT_ASSESSED'
        : status === 'APPROVED'
          ? 'ELIGIBLE'
          : status === 'REJECTED'
            ? 'NOT_ELIGIBLE'
            : 'NOT_ASSESSED';
    if (eligibility !== 'NOT_ASSESSED') {
      const decidedAt = new Date(`${addDays(decidedOn, 1)}T10:00:00Z`);
      const justification =
        eligibility === 'ELIGIBLE'
          ? 'KYC/KYB approved, professional investor (demo).'
          : 'KYC/KYB rejected: beneficial ownership not established (demo).';
      const assessment = deterministicUuid(`assessment:manual:${demo.key}`);
      eligibilityDecisions.assessments.push({
        id: assessment,
        tenantId,
        investorId: id,
        issuanceId: null,
        context: 'MANUAL',
        result: eligibility,
        rules: [],
        // The general rules of a Compliance Officer's decision (eligibility.service.ts).
        rulesVersion: `${ELIGIBILITY_ENGINE_VERSION}/rules-0`,
        decidedByUserId: staff.decider,
        decidedBySystem: false,
        justification,
        assessedAt: decidedAt,
      });
      eligibilityDecisions.transitions.push({
        id: deterministicUuid(`transition:eligibility:${demo.key}`),
        tenantId,
        resourceType: 'investor_eligibility',
        resourceId: id,
        fromStatus: 'NOT_ASSESSED',
        toStatus: eligibility,
        actorUserId: staff.decider,
        actorRole: 'COMPLIANCE_OFFICER',
        comment: justification,
        occurredAt: decidedAt,
      });
    }
    investors.push({
      id,
      tenantId,
      type: 'LEGAL_ENTITY',
      legalName: demo.legalName,
      tradeName: null,
      legalForm: demo.legalForm,
      registrationNumber: `DEMO-${demo.country}-${String(100000 + index * 7919).slice(0, 6)}`,
      taxId: `${demo.country}DEMO${String(index + 1).padStart(6, '0')}`,
      countryOfIncorporation: demo.country,
      address: {
        line1: `${index + 1} Demo Street`,
        postalCode: String(1000 + index),
        city: demo.city,
        countryCode: demo.country,
      },
      contactEmail: `contact.${demo.key}@example.com`,
      phone: `+352 20 00 ${String(10 + index).padStart(2, '0')} 00`,
      classification: demo.classification,
      profileStatus: demo.profileStatus ?? 'ACTIVE',
      kycStatus: status ?? 'NOT_STARTED',
      kycLastReviewDate: decided && status !== 'REJECTED' ? decidedOn : null,
      kycExpiryDate: validUntil,
      riskLevel:
        status === 'APPROVED' || status === 'EXPIRED'
          ? demo.country === 'US' || demo.country === 'SG'
            ? 'MEDIUM'
            : 'LOW'
          : null,
      eligibilityStatus: eligibility,
      recipientCode: recipientCode(demo.key),
      createdBy: staff.preparer,
    });
    if (status) {
      cases.push({
        id: deterministicUuid(`kyc-case:${demo.key}`),
        tenantId,
        investorId: id,
        status,
        preparedBy: staff.preparer,
        preparedAt: new Date(`${addDays(decidedOn, -2)}T09:00:00Z`),
        decidedBy: decided ? staff.decider : null,
        decidedAt: decided ? new Date(`${decidedOn}T14:00:00Z`) : null,
        decisionComment:
          status === 'REJECTED' ? 'Beneficial ownership could not be established (demo).' : null,
        validUntil,
        providerReference:
          status === 'IN_PROGRESS' ? null : `FAKE-KYC-DEMO-${demo.key.toUpperCase()}`,
        providerOutcome:
          status === 'IN_PROGRESS' ? null : status === 'REJECTED' ? 'REVIEW' : 'CLEAR',
        suggestedRiskLevel:
          status === 'IN_PROGRESS' ? null : status === 'REJECTED' ? 'HIGH' : 'LOW',
        createdBy: staff.preparer,
      });
    }
  }
  const representatives = ['alpine', 'baltic', 'cedar'].map((key, index) => ({
    id: deterministicUuid(`representative:${key}`),
    tenantId: tenantIds.northwind,
    investorId: investorId(key),
    fullName: ['Camille Durand (demo)', 'Jonas Weber (demo)', 'Sofia Rossi (demo)'][index]!,
    title: ['Managing Director', 'Chief Investment Officer', 'Head of Family Office'][index]!,
    email: `representative.${key}@example.com`,
  }));
  const beneficialOwners = ['alpine', 'cedar'].flatMap((key, index) => [
    {
      id: deterministicUuid(`beneficial-owner:${key}:1`),
      tenantId: tenantIds.northwind,
      investorId: investorId(key),
      fullName: ['Hugo Martin (demo)', 'Elena Keller (demo)'][index]!,
      nationality: ['FR', 'CH'][index]!,
      ownershipPercentage: ['60.00', '75.00'][index]!,
    },
    {
      id: deterministicUuid(`beneficial-owner:${key}:2`),
      tenantId: tenantIds.northwind,
      investorId: investorId(key),
      fullName: ['Léa Bernard (demo)', 'Marco Keller (demo)'][index]!,
      nationality: ['FR', 'IT'][index]!,
      ownershipPercentage: ['40.00', '25.00'][index]!,
    },
  ]);
  return { investors, cases, representatives, beneficialOwners, eligibilityDecisions };
}
