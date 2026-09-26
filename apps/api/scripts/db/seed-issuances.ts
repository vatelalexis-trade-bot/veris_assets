// Demonstration issuances (SPEC §28): a private debt issuance open to subscriptions, with invited
// investors, a solar project approved but not yet open, and infrastructure notes whose
// subscriptions are closed and oversubscribed, ready to be allocated (scenario 3). "Helios Solar
// SPV 2027" is left to scenario 1, which creates it.
import { addDays, addMonths, dateInTimeZone } from '@virtus/shared';
import { ELIGIBILITY_ENGINE_VERSION } from '../../src/modules/investor-compliance/domain/eligibility.js';
import { deterministicUuid } from './deterministic-id.js';
import { investorId } from './seed-investors.js';

const userId = (email: string) => deterministicUuid(`user:${email}`);
const OPERATOR = userId('northwind.operator@example.com');
const ADMIN = userId('northwind.admin1@example.com');

export function demoIssuanceRows(northwind: string, now = new Date()) {
  const today = dateInTimeZone(now, 'Europe/Paris');
  const debt = deterministicUuid('issuance:northwind-senior-debt-2026');
  const solar = deterministicUuid('issuance:aurora-solar-2027');
  const notes = deterministicUuid('issuance:northwind-infrastructure-notes-2026');
  const at = (day: string, hour = 10) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);

  const issuances = [
    {
      id: debt,
      tenantId: northwind,
      name: 'Northwind Senior Debt 2026',
      code: 'NWSD26',
      description: 'Senior secured loans to European mid-market companies (demo).',
      assetCategory: 'PRIVATE_DEBT',
      countryCode: 'FR',
      currency: 'EUR',
      legalIssuerName: 'Northwind Senior Debt SCSp (demo)',
      spvName: null,
      status: 'SUBSCRIPTION_OPEN',
      wizardStep: 'REVIEW',
      submittedBy: OPERATOR,
      submittedAt: at(addDays(today, -30)),
      approvedBy: ADMIN,
      approvedAt: at(addDays(today, -28)),
      createdBy: OPERATOR,
    },
    {
      id: solar,
      tenantId: northwind,
      name: 'Aurora Solar Park 2027',
      code: 'AURORA27',
      description: 'Construction and operation of a 40 MW solar park (demo).',
      assetCategory: 'RENEWABLE_ENERGY',
      countryCode: 'ES',
      currency: 'EUR',
      legalIssuerName: 'Aurora Solar SPV SL (demo)',
      spvName: 'Aurora Solar SPV SL (demo)',
      status: 'APPROVED',
      wizardStep: 'REVIEW',
      submittedBy: OPERATOR,
      submittedAt: at(addDays(today, -5)),
      approvedBy: ADMIN,
      approvedAt: at(addDays(today, -3)),
      createdBy: OPERATOR,
    },
    {
      id: notes,
      tenantId: northwind,
      name: 'Northwind Infrastructure Notes 2026',
      code: 'NWIN26',
      description: 'Notes financing fibre networks in rural France (demo).',
      assetCategory: 'INFRASTRUCTURE',
      countryCode: 'FR',
      currency: 'EUR',
      legalIssuerName: 'Northwind Infrastructure Notes SAS (demo)',
      spvName: null,
      status: 'SUBSCRIPTION_CLOSED',
      wizardStep: 'REVIEW',
      submittedBy: OPERATOR,
      submittedAt: at(addDays(today, -60)),
      approvedBy: ADMIN,
      approvedAt: at(addDays(today, -58)),
      createdBy: OPERATOR,
    },
  ];

  const debtIssue = addDays(today, 50);
  const notesIssue = addDays(today, 20);
  const solarStart = addDays(today, 10);
  const terms = [
    {
      issuanceId: debt,
      tenantId: northwind,
      targetAmount: '10000000.00',
      minimumAmount: '5000000.00',
      maximumAmount: '12000000.00',
      nominalValue: '1000.00',
      totalUnits: '10000',
      interestRate: '0.06',
      rateType: 'FIXED',
      distributionFrequency: 'QUARTERLY',
      dayCount: 'ACT_365F',
      issueDate: debtIssue,
      maturityDate: addMonths(debtIssue, 60),
      subscriptionStartDate: addDays(today, -20),
      subscriptionEndDate: addDays(today, 40),
      minSubscriptionAmount: '100000.00',
      maxAmountPerInvestor: '2000000.00',
      createdBy: OPERATOR,
    },
    {
      issuanceId: solar,
      tenantId: northwind,
      targetAmount: '5000000.00',
      minimumAmount: '2000000.00',
      maximumAmount: '6000000.00',
      nominalValue: '1000.00',
      totalUnits: '5000',
      interestRate: '0.05',
      rateType: 'FIXED',
      distributionFrequency: 'SEMI_ANNUAL',
      dayCount: '30E_360',
      issueDate: addDays(solarStart, 75),
      maturityDate: addMonths(addDays(solarStart, 75), 84),
      subscriptionStartDate: solarStart,
      subscriptionEndDate: addDays(solarStart, 60),
      minSubscriptionAmount: '50000.00',
      maxAmountPerInvestor: '1000000.00',
      createdBy: OPERATOR,
    },
    {
      issuanceId: notes,
      tenantId: northwind,
      targetAmount: '1000000.00',
      minimumAmount: '500000.00',
      maximumAmount: '1000000.00',
      nominalValue: '1000.00',
      totalUnits: '1000',
      interestRate: '0.045',
      rateType: 'FIXED',
      distributionFrequency: 'SEMI_ANNUAL',
      dayCount: '30E_360',
      issueDate: notesIssue,
      maturityDate: addMonths(notesIssue, 36),
      subscriptionStartDate: addDays(today, -45),
      subscriptionEndDate: addDays(today, -3),
      minSubscriptionAmount: '100000.00',
      maxAmountPerInvestor: '600000.00',
      createdBy: OPERATOR,
    },
  ];

  const rules = [
    {
      issuanceId: debt,
      tenantId: northwind,
      kycMinRemainingValidityDays: 30,
      transfersAllowed: true,
      maxInvestors: 50,
      createdBy: OPERATOR,
    },
    {
      issuanceId: solar,
      tenantId: northwind,
      excludedCountries: ['US'],
      allowedInvestorTypes: ['LEGAL_ENTITY'],
      kycMinRemainingValidityDays: 90,
      transfersAllowed: true,
      lockupEndDate: addMonths(addDays(solarStart, 75), 6),
      maxInvestors: 30,
      createdBy: OPERATOR,
    },
    {
      issuanceId: notes,
      tenantId: northwind,
      kycMinRemainingValidityDays: 30,
      transfersAllowed: true,
      maxInvestors: 20,
      createdBy: OPERATOR,
    },
  ];

  // Iris was invited while its KYC/KYB was still valid; it has expired since (scenario 2).
  const invited = ['alpine', 'baltic', 'cedar', 'danube', 'estuary', 'iris'];
  const invitedToNotes = ['alpine', 'baltic', 'cedar'];
  const assessments = invited.map((key) => ({
    id: deterministicUuid(`assessment:nwsd26:${key}`),
    tenantId: northwind,
    investorId: investorId(key),
    issuanceId: debt,
    context: 'INVITATION',
    result: 'ELIGIBLE',
    rules: [],
    rulesVersion: `${ELIGIBILITY_ENGINE_VERSION}/rules-1`,
    decidedBySystem: true,
    assessedAt: at(addDays(today, -25)),
  }));
  assessments.push(
    ...invitedToNotes.map((key) => ({
      ...assessments.find((row) => row.investorId === investorId(key))!,
      id: deterministicUuid(`assessment:nwin26:${key}`),
      issuanceId: notes,
      assessedAt: at(addDays(today, -44)),
    })),
  );
  const invitations = invited.map((key) => ({
    id: deterministicUuid(`invitation:nwsd26:${key}`),
    tenantId: northwind,
    issuanceId: debt,
    investorId: investorId(key),
    eligibilityAssessmentId: deterministicUuid(`assessment:nwsd26:${key}`),
    invitedBy: OPERATOR,
    invitedAt: at(addDays(today, -25)),
    createdBy: OPERATOR,
  }));

  invitations.push(
    ...invitedToNotes.map((key) => ({
      id: deterministicUuid(`invitation:nwin26:${key}`),
      tenantId: northwind,
      issuanceId: notes,
      investorId: investorId(key),
      eligibilityAssessmentId: deterministicUuid(`assessment:nwin26:${key}`),
      invitedBy: OPERATOR,
      invitedAt: at(addDays(today, -44)),
      createdBy: OPERATOR,
    })),
  );

  const steps = (id: string, key: string, statuses: [string | null, string, string, string][]) =>
    statuses.map(([from, to, actor, day], index) => ({
      id: deterministicUuid(`transition:${key}:${index}`),
      tenantId: northwind,
      resourceType: 'issuance',
      resourceId: id,
      fromStatus: from,
      toStatus: to,
      actorUserId: actor,
      actorRole: actor === ADMIN ? 'ISSUER_ADMIN' : 'ISSUER_OPERATOR',
      occurredAt: at(day, 9 + index),
    }));
  const transitions = [
    ...steps(debt, 'nwsd26', [
      [null, 'DRAFT', OPERATOR, addDays(today, -35)],
      ['DRAFT', 'UNDER_REVIEW', OPERATOR, addDays(today, -30)],
      ['UNDER_REVIEW', 'APPROVED', ADMIN, addDays(today, -28)],
      ['APPROVED', 'SUBSCRIPTION_OPEN', ADMIN, addDays(today, -20)],
    ]),
    ...steps(solar, 'aurora27', [
      [null, 'DRAFT', OPERATOR, addDays(today, -9)],
      ['DRAFT', 'UNDER_REVIEW', OPERATOR, addDays(today, -5)],
      ['UNDER_REVIEW', 'APPROVED', ADMIN, addDays(today, -3)],
    ]),
    ...steps(notes, 'nwin26', [
      [null, 'DRAFT', OPERATOR, addDays(today, -65)],
      ['DRAFT', 'UNDER_REVIEW', OPERATOR, addDays(today, -60)],
      ['UNDER_REVIEW', 'APPROVED', ADMIN, addDays(today, -58)],
      ['APPROVED', 'SUBSCRIPTION_OPEN', ADMIN, addDays(today, -45)],
      ['SUBSCRIPTION_OPEN', 'SUBSCRIPTION_CLOSED', ADMIN, addDays(today, -2)],
    ]),
  ];
  return { issuances, terms, rules, assessments, invitations, transitions };
}
