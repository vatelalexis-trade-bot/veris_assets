// Demonstration subscriptions (SPEC §28): the infrastructure notes are oversubscribed — 1 200 units
// approved for 1 000 available — and wait for their allocation (scenario 3); on the senior debt,
// one subscription waits for review and one was rejected.
import { addDays, dateInTimeZone } from '@veris/shared';
import { ELIGIBILITY_ENGINE_VERSION } from '../../src/modules/investor-compliance/domain/eligibility.js';
import { deterministicUuid } from './deterministic-id.js';
import { investorId } from './seed-investors.js';

const userId = (email: string) => deterministicUuid(`user:${email}`);
const OPERATOR = userId('northwind.operator@example.com');
const ADMIN = userId('northwind.admin1@example.com');
const ACCOUNT: Record<string, string> = {
  alpine: userId('investor.a@example.com'),
  baltic: userId('investor.b@example.com'),
  cedar: userId('investor.c@example.com'),
};

interface Demo {
  key: string;
  issuance: string;
  code: string;
  investor: string;
  units: string;
  submittedDaysAgo: number;
  outcome: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
}

export function demoSubscriptionRows(northwind: string, now = new Date()) {
  const today = dateInTimeZone(now, 'Europe/Paris');
  const debt = deterministicUuid('issuance:northwind-senior-debt-2026');
  const notes = deterministicUuid('issuance:northwind-infrastructure-notes-2026');
  const at = (days: number, hour: number) =>
    new Date(`${addDays(today, -days)}T${String(hour).padStart(2, '0')}:00:00Z`);
  const demos: Demo[] = [
    {
      key: 'nwin26:alpine',
      issuance: notes,
      code: 'NWIN26',
      investor: 'alpine',
      units: '500',
      submittedDaysAgo: 30,
      outcome: 'APPROVED',
    },
    {
      key: 'nwin26:baltic',
      issuance: notes,
      code: 'NWIN26',
      investor: 'baltic',
      units: '400',
      submittedDaysAgo: 20,
      outcome: 'APPROVED',
    },
    {
      key: 'nwin26:cedar',
      issuance: notes,
      code: 'NWIN26',
      investor: 'cedar',
      units: '300',
      submittedDaysAgo: 10,
      outcome: 'APPROVED',
    },
    {
      key: 'nwsd26:alpine',
      issuance: debt,
      code: 'NWSD26',
      investor: 'alpine',
      units: '200',
      submittedDaysAgo: 2,
      outcome: 'SUBMITTED',
    },
    {
      key: 'nwsd26:cedar',
      issuance: debt,
      code: 'NWSD26',
      investor: 'cedar',
      units: '150',
      submittedDaysAgo: 6,
      outcome: 'REJECTED',
    },
  ];

  const assessments = demos.map((demo) => ({
    id: deterministicUuid(`assessment:subscription:${demo.key}`),
    tenantId: northwind,
    investorId: investorId(demo.investor),
    issuanceId: demo.issuance,
    context: 'SUBSCRIPTION',
    result: 'ELIGIBLE',
    rules: [],
    rulesVersion: `${ELIGIBILITY_ENGINE_VERSION}/rules-1`,
    decidedBySystem: true,
    assessedAt: at(demo.submittedDaysAgo, 9),
  }));

  const subscriptions = demos.map((demo) => {
    const decided = demo.outcome !== 'SUBMITTED';
    return {
      id: deterministicUuid(`subscription:${demo.key}`),
      tenantId: northwind,
      issuanceId: demo.issuance,
      investorId: investorId(demo.investor),
      status: demo.outcome,
      requestedUnits: demo.units,
      requestedAmount: `${demo.units}000.00`,
      currency: 'EUR',
      paymentReference: 'FR76 0000 0000 0000 (demo)',
      documentsAcceptedAt: at(demo.submittedDaysAgo, 9),
      eligibilityDeclaredAt: at(demo.submittedDaysAgo, 9),
      submittedAt: at(demo.submittedDaysAgo, 9),
      eligibilityAssessmentId: deterministicUuid(`assessment:subscription:${demo.key}`),
      reviewedBy: decided ? OPERATOR : null,
      decidedBy: decided ? ADMIN : null,
      decidedAt: decided ? at(demo.submittedDaysAgo - 1, 11) : null,
      rejectionReason:
        demo.outcome === 'REJECTED' ? 'The payment account could not be verified (demo).' : null,
      createdBy: ACCOUNT[demo.investor] ?? null,
      version: decided ? 4 : 2,
    };
  });

  const transitions = demos.flatMap((demo) => {
    const investor = ACCOUNT[demo.investor] ?? null;
    const steps: [string | null, string, string | null, string, number, number][] = [
      [null, 'DRAFT', investor, 'INVESTOR', demo.submittedDaysAgo, 8],
      ['DRAFT', 'SUBMITTED', investor, 'INVESTOR', demo.submittedDaysAgo, 9],
      ...(demo.outcome === 'SUBMITTED'
        ? []
        : ([
            [
              'SUBMITTED',
              'UNDER_REVIEW',
              OPERATOR,
              'ISSUER_OPERATOR',
              demo.submittedDaysAgo - 1,
              10,
            ],
            ['UNDER_REVIEW', demo.outcome, ADMIN, 'ISSUER_ADMIN', demo.submittedDaysAgo - 1, 11],
          ] as [string | null, string, string | null, string, number, number][])),
    ];
    return steps.map(([from, to, actor, role, days, hour], index) => ({
      id: deterministicUuid(`transition:subscription:${demo.key}:${index}`),
      tenantId: northwind,
      resourceType: 'subscription',
      resourceId: deterministicUuid(`subscription:${demo.key}`),
      fromStatus: from,
      toStatus: to,
      actorUserId: actor,
      actorRole: role,
      comment: to === 'REJECTED' ? 'The payment account could not be verified (demo).' : null,
      occurredAt: at(days, hour),
    }));
  });
  return { assessments, subscriptions, transitions };
}
