// History of the demonstration (SPEC §28): what the users would find after some weeks of use.
// - An issuance of the second organisation, Contoso, open to its own investors: signing in as
//   Contoso shows it, Northwind never sees it (isolation, scenario 5).
// - An invitation refused because the investor's country is excluded (Juniper, US, solar project).
// - Notifications of the demo users about the work that waits for them and what they received.
// - The audit log of every seeded change of status, as the application would have written it.
import { addDays, addMonths, dateInTimeZone } from '@virtus/shared';
import { ELIGIBILITY_ENGINE_VERSION } from '../../src/modules/investor-compliance/domain/eligibility.js';
import { deterministicUuid } from './deterministic-id.js';
import { investorId } from './seed-investors.js';

const userId = (email: string) => deterministicUuid(`user:${email}`);

/** "Contoso Real Estate Notes 2028", open to subscriptions, its two investors invited. */
export function demoContosoRows(contoso: string, now = new Date()) {
  const today = dateInTimeZone(now, 'Europe/Paris');
  const at = (day: string, hour = 10) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
  const operator = userId('contoso.operator@example.com');
  const admin = userId('contoso.admin@example.com');
  const notes = deterministicUuid('issuance:contoso-real-estate-notes-2028');
  const issue = addDays(today, 45);
  const invited = ['quarry', 'reed'];
  const issuances = [
    {
      id: notes,
      tenantId: contoso,
      name: 'Contoso Real Estate Notes 2028',
      code: 'CRE28',
      description: 'Notes financing the renovation of office buildings in Luxembourg (demo).',
      assetCategory: 'REAL_ESTATE',
      countryCode: 'LU',
      currency: 'EUR',
      legalIssuerName: 'Contoso Real Estate Notes S.A. (demo)',
      spvName: null,
      status: 'SUBSCRIPTION_OPEN',
      wizardStep: 'REVIEW',
      submittedBy: operator,
      submittedAt: at(addDays(today, -18)),
      approvedBy: admin,
      approvedAt: at(addDays(today, -16)),
      createdBy: operator,
    },
  ];
  const terms = [
    {
      issuanceId: notes,
      tenantId: contoso,
      targetAmount: '3000000.00',
      minimumAmount: '1500000.00',
      maximumAmount: '3000000.00',
      nominalValue: '1000.00',
      totalUnits: '3000',
      interestRate: '0.048',
      rateType: 'FIXED',
      distributionFrequency: 'ANNUAL',
      dayCount: 'ACT_365F',
      issueDate: issue,
      maturityDate: addMonths(issue, 36),
      subscriptionStartDate: addDays(today, -14),
      subscriptionEndDate: addDays(today, 30),
      minSubscriptionAmount: '100000.00',
      maxAmountPerInvestor: '1500000.00',
      createdBy: operator,
    },
  ];
  const rules = [
    {
      issuanceId: notes,
      tenantId: contoso,
      kycMinRemainingValidityDays: 30,
      transfersAllowed: true,
      maxInvestors: 20,
      createdBy: operator,
    },
  ];
  const assessments = invited.map((key) => ({
    id: deterministicUuid(`assessment:cre28:${key}`),
    tenantId: contoso,
    investorId: investorId(key),
    issuanceId: notes,
    context: 'INVITATION',
    result: 'ELIGIBLE',
    rules: [],
    rulesVersion: `${ELIGIBILITY_ENGINE_VERSION}/rules-1`,
    decidedBySystem: true,
    assessedAt: at(addDays(today, -15)),
  }));
  const invitations = invited.map((key) => ({
    id: deterministicUuid(`invitation:cre28:${key}`),
    tenantId: contoso,
    issuanceId: notes,
    investorId: investorId(key),
    eligibilityAssessmentId: deterministicUuid(`assessment:cre28:${key}`),
    invitedBy: operator,
    invitedAt: at(addDays(today, -15)),
    createdBy: operator,
  }));
  const steps: [string | null, string, string, string, Date][] = [
    [null, 'DRAFT', operator, 'ISSUER_OPERATOR', at(addDays(today, -21))],
    ['DRAFT', 'UNDER_REVIEW', operator, 'ISSUER_OPERATOR', at(addDays(today, -18))],
    ['UNDER_REVIEW', 'APPROVED', admin, 'ISSUER_ADMIN', at(addDays(today, -16))],
    ['APPROVED', 'SUBSCRIPTION_OPEN', admin, 'ISSUER_ADMIN', at(addDays(today, -14))],
  ];
  const transitions = steps.map(([from, to, actor, role, when], index) => ({
    id: deterministicUuid(`transition:cre28:${index}`),
    tenantId: contoso,
    resourceType: 'issuance',
    resourceId: notes,
    fromStatus: from,
    toStatus: to,
    actorUserId: actor,
    actorRole: role,
    occurredAt: when,
  }));
  return { issuances, terms, rules, assessments, invitations, transitions };
}

/**
 * Juniper Ventures LLC (US) proposed for the solar project, whose rules exclude the United
 * States: the invitation is refused, and the assessment keeps the reason (SPEC §8.3).
 */
export function demoRefusedInvitation(northwind: string, now = new Date()) {
  const today = dateInTimeZone(now, 'Europe/Paris');
  return {
    id: deterministicUuid('assessment:aurora27:juniper:refused'),
    tenantId: northwind,
    investorId: investorId('juniper'),
    issuanceId: deterministicUuid('issuance:aurora-solar-2027'),
    context: 'INVITATION',
    result: 'NOT_ELIGIBLE',
    rules: [
      { code: 'PROFILE_INACTIVE', passed: true, detail: { profileStatus: 'ACTIVE' } },
      { code: 'COUNTRY_EXCLUDED', passed: false, detail: { country: 'US' } },
    ],
    rulesVersion: `${ELIGIBILITY_ENGINE_VERSION}/rules-1`,
    decidedBySystem: true,
    assessedAt: new Date(`${addDays(today, -2)}T11:00:00Z`),
  };
}

interface SeededNotification {
  user: string;
  type: string;
  category: string;
  eventType: string;
  params: Record<string, string>;
  resourceType: string;
  resourceId: string;
  createdAt: Date;
  read: boolean;
}

/** Notifications of the demo users: the work waiting for them, and what they received. */
export function demoNotifications(northwind: string, now = new Date()) {
  const today = dateInTimeZone(now, 'Europe/Paris');
  const at = (days: number, hour: number) =>
    new Date(`${addDays(today, -days)}T${String(hour).padStart(2, '0')}:00:00Z`);
  const rows: SeededNotification[] = [
    {
      user: 'northwind.operator@example.com',
      type: 'SUBSCRIPTION_SUBMITTED',
      category: 'WORKFLOW',
      eventType: 'registry.subscription.submitted',
      params: { code: 'NWSD26' },
      resourceType: 'subscription',
      resourceId: deterministicUuid('subscription:nwsd26:alpine'),
      createdAt: at(2, 9),
      read: false,
    },
    {
      user: 'northwind.compliance@example.com',
      type: 'TRANSFER_TO_REVIEW',
      category: 'WORKFLOW',
      eventType: 'registry.transfer.submitted',
      params: { units: '100', code: 'NWPD1' },
      resourceType: 'transfer',
      resourceId: deterministicUuid('transfer:nwpd1:alpine-danube'),
      createdAt: at(1, 10),
      read: false,
    },
    {
      user: 'northwind.compliance@example.com',
      type: 'KYC_REVIEW_REQUESTED',
      category: 'WORKFLOW',
      eventType: 'investor.kyc.submitted',
      params: {},
      resourceType: 'kyc_case',
      resourceId: deterministicUuid('kyc-case:kestrel'),
      createdAt: at(4, 9),
      read: true,
    },
    {
      user: 'northwind.compliance@example.com',
      type: 'KYC_EXPIRED',
      category: 'COMPLIANCE',
      eventType: 'investor.kyc.expired',
      params: {},
      resourceType: 'kyc_case',
      resourceId: deterministicUuid('kyc-case:iris'),
      createdAt: at(11, 2),
      read: true,
    },
    ...(
      [
        ['investor.a@example.com', 'alpine', '800'],
        ['investor.b@example.com', 'baltic', '600'],
        ['investor.c@example.com', 'cedar', '400'],
      ] as const
    ).flatMap(([email, key, units]): SeededNotification[] => [
      {
        user: email,
        type: 'SUBSCRIPTION_ALLOCATED',
        category: 'INVESTMENT',
        eventType: 'registry.subscription.allocated',
        params: { units, code: 'NWPD1' },
        resourceType: 'subscription',
        resourceId: deterministicUuid(`subscription:nwpd1:${key}`),
        createdAt: at(37, 10),
        read: true,
      },
      {
        user: email,
        type: 'DISTRIBUTION_PAID',
        category: 'DISTRIBUTION',
        eventType: 'servicing.distribution.paid',
        params: { code: 'NWGN' },
        resourceType: 'distribution',
        resourceId: deterministicUuid('distribution:nwgn:1'),
        // The first coupon of the green notes was paid about six months ago.
        createdAt: new Date(`${addMonths(today, -6)}T15:00:00Z`),
        read: email !== 'investor.a@example.com',
      },
    ]),
  ];
  return rows.map((row) => ({
    id: deterministicUuid(`notification:${row.user}:${row.type}:${row.resourceId}`),
    tenantId: northwind,
    userId: userId(row.user),
    category: row.category,
    eventType: row.eventType,
    titleKey: row.type,
    params: row.params,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    sourceEventId: null,
    readAt: row.read ? new Date(row.createdAt.getTime() + 3_600_000) : null,
    createdAt: row.createdAt,
  }));
}

interface SeededTransition {
  id: string;
  tenantId: string;
  resourceType: string;
  resourceId: string;
  fromStatus: string | null;
  toStatus: string;
  actorUserId: string | null;
  actorRole: string | null;
  occurredAt: Date;
}

const ACTION_PREFIX: Record<string, string> = {
  issuance: 'ISSUANCE',
  subscription: 'SUBSCRIPTION',
  allocation_round: 'ALLOCATION_ROUND',
  transfer: 'TRANSFER',
  distribution: 'DISTRIBUTION',
};

/**
 * The audit log of the seeded changes of status, with the actions the application writes
 * (`SUBSCRIPTION_APPROVED`, `DISTRIBUTION_PAID`…); a change without actor was made by a job.
 */
export function demoAuditEvents(transitions: readonly SeededTransition[]) {
  return transitions.flatMap((row) => {
    const eligibility = row.resourceType === 'investor_eligibility';
    const prefix = ACTION_PREFIX[row.resourceType];
    if (!eligibility && !prefix) return [];
    const action = eligibility
      ? 'ELIGIBILITY_STATUS_CHANGED'
      : row.fromStatus === null
        ? `${prefix}_CREATED`
        : `${prefix}_${row.toStatus}`;
    const key = eligibility ? 'eligibilityStatus' : 'status';
    return [
      {
        id: deterministicUuid(`audit:${row.id}`),
        tenantId: row.tenantId,
        occurredAt: row.occurredAt,
        actorUserId: row.actorUserId,
        actorRole: row.actorRole,
        action,
        resourceType: eligibility ? 'investor' : row.resourceType,
        resourceId: row.resourceId,
        oldValue: row.fromStatus === null ? null : { [key]: row.fromStatus },
        newValue: { [key]: row.toStatus },
        source: row.actorUserId ? 'WEB' : 'JOB',
        result: 'SUCCESS',
      },
    ];
  });
}
