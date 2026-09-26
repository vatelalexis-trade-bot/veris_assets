// Demonstration registry (SPEC §28): "Northwind Private Debt Fund I" is allocated and paid, with
// positions and their ledger, and a transfer waiting for the compliance review; "Northwind Green
// Notes" is active, its first semi-annual coupon due (scenario 6). The movements are chained with
// the application's own hash, so the daily reconciliation finds them consistent.
import {
  addDays,
  addMonths,
  dateInTimeZone,
  parseDecimal,
  type BusinessDate,
} from '@virtus/shared';
import { entryHash } from '../../src/modules/registry/application/ledger-hash.js';
import { ZERO_HASH, type LedgerEntryType } from '../../src/modules/registry/domain/ledger.js';
import { ELIGIBILITY_ENGINE_VERSION } from '../../src/modules/investor-compliance/domain/eligibility.js';
import { generateSchedule } from '../../src/modules/servicing/domain/schedule.js';
import { deterministicUuid } from './deterministic-id.js';
import { investorId, recipientCode } from './seed-investors.js';

const userId = (email: string) => deterministicUuid(`user:${email}`);
const OPERATOR = userId('northwind.operator@example.com');
const ADMIN = userId('northwind.admin1@example.com');
const ADMIN2 = userId('northwind.admin2@example.com');

interface FundOptions {
  key: string;
  code: string;
  name: string;
  description: string;
  assetCategory: string;
  countryCode: string;
  legalIssuerName: string;
  status: 'ALLOCATED' | 'ACTIVE';
  totalUnits: string;
  interestRate: string;
  distributionFrequency: 'QUARTERLY' | 'SEMI_ANNUAL';
  dayCount: '30E_360' | 'ACT_365F';
  issueDate: BusinessDate;
  maturityDate: BusinessDate;
  /** Days before today of the allocation (the ledger's effective dates). */
  allocatedDaysAgo: number;
  /** Units of each holder, allocated and paid: [investor key, units, user account]. */
  holders: [string, string, string | null][];
  pendingTransfer?: { from: string; to: string; quantity: string };
}

export function demoRegistryRows(northwind: string, now = new Date()) {
  const today = dateInTimeZone(now, 'Europe/Paris');
  // The first coupon of the green notes ended on a 15th a few days ago: 180 days in 30E/360.
  const couponEnd =
    today.slice(8) >= '18' ? `${today.slice(0, 8)}15` : `${addMonths(today, -1).slice(0, 8)}15`;
  const greenIssue = addMonths(couponEnd, -6);
  const funds: FundOptions[] = [
    {
      key: 'nwpd1',
      code: 'NWPD1',
      name: 'Northwind Private Debt Fund I',
      description: 'Unitranche loans to European mid-market companies (demo).',
      assetCategory: 'PRIVATE_DEBT',
      countryCode: 'LU',
      legalIssuerName: 'Northwind Private Debt Fund I SCSp (demo)',
      status: 'ALLOCATED',
      totalUnits: '2000',
      interestRate: '0.055',
      distributionFrequency: 'QUARTERLY',
      dayCount: '30E_360',
      issueDate: addDays(today, -10),
      maturityDate: addMonths(addDays(today, -10), 48),
      allocatedDaysAgo: 37,
      holders: [
        ['alpine', '800', userId('investor.a@example.com')],
        ['baltic', '600', userId('investor.b@example.com')],
        ['cedar', '400', userId('investor.c@example.com')],
      ],
      pendingTransfer: { from: 'alpine', to: 'danube', quantity: '100' },
    },
    {
      key: 'nwgn',
      code: 'NWGN',
      name: 'Northwind Green Notes',
      description: 'Notes financing energy renovation of French schools (demo).',
      assetCategory: 'RENEWABLE_ENERGY',
      countryCode: 'FR',
      legalIssuerName: 'Northwind Green Notes SAS (demo)',
      status: 'ACTIVE',
      totalUnits: '1000',
      interestRate: '0.05',
      distributionFrequency: 'SEMI_ANNUAL',
      dayCount: '30E_360',
      issueDate: greenIssue,
      maturityDate: addMonths(greenIssue, 36),
      allocatedDaysAgo: daysBefore(today, greenIssue) + 5,
      holders: [
        ['alpine', '100', userId('investor.a@example.com')],
        ['baltic', '250', userId('investor.b@example.com')],
        ['cedar', '150', userId('investor.c@example.com')],
      ],
    },
  ];
  const all = funds.map((fund) => fundRows(northwind, today, fund));
  const merged = {} as ReturnType<typeof fundRows>;
  for (const rows of all) {
    for (const [name, values] of Object.entries(rows) as [keyof typeof merged, never[]][]) {
      merged[name] = [...((merged[name] as never[] | undefined) ?? []), ...values] as never;
    }
  }
  return merged;
}

/** Whole days from `earlier` to `later` (calendar integers, not amounts). */
function daysBefore(later: BusinessDate, earlier: BusinessDate): number {
  let days = 0;
  while (addDays(earlier, days) < later) days += 1;
  return days;
}

function fundRows(northwind: string, today: BusinessDate, options: FundOptions) {
  const key = options.key;
  const holders = options.holders;
  const pending = options.pendingTransfer;
  // Every event is placed relative to the allocation, `allocatedDaysAgo` days before today.
  const shift = options.allocatedDaysAgo - 37;
  const fund = deterministicUuid(
    key === 'nwpd1' ? 'issuance:northwind-private-debt-fund-i' : `issuance:${key}`,
  );
  const at = (days: number, hour: number) =>
    new Date(`${addDays(today, -days)}T${String(hour).padStart(2, '0')}:00:00.000Z`);
  const ago = (days: number, hour: number) => at(days + shift, hour);
  const id = (name: string) => deterministicUuid(`${name}:${key}`);
  const allocated = holders.reduce((sum, [, units]) => sum.plus(units), parseDecimal('0'));
  const total = parseDecimal(options.totalUnits);
  const amount = (units: string) => parseDecimal(units).times(1000).toFixed(2);

  const issuances = [
    {
      id: fund,
      tenantId: northwind,
      name: options.name,
      code: options.code,
      description: options.description,
      assetCategory: options.assetCategory,
      countryCode: options.countryCode,
      currency: 'EUR',
      legalIssuerName: options.legalIssuerName,
      spvName: null,
      status: options.status,
      wizardStep: 'REVIEW',
      submittedBy: OPERATOR,
      submittedAt: ago(90, 9),
      approvedBy: ADMIN,
      approvedAt: ago(88, 9),
      createdBy: OPERATOR,
    },
  ];
  const terms = [
    {
      issuanceId: fund,
      tenantId: northwind,
      targetAmount: amount(options.totalUnits),
      minimumAmount: total.times(500).toFixed(2),
      maximumAmount: amount(options.totalUnits),
      nominalValue: '1000.00',
      totalUnits: options.totalUnits,
      interestRate: options.interestRate,
      rateType: 'FIXED',
      distributionFrequency: options.distributionFrequency,
      dayCount: options.dayCount,
      issueDate: options.issueDate,
      maturityDate: options.maturityDate,
      subscriptionStartDate: addDays(today, -(80 + shift)),
      subscriptionEndDate: addDays(today, -(40 + shift)),
      minSubscriptionAmount: '100000.00',
      maxAmountPerInvestor: '1000000.00',
      createdBy: OPERATOR,
    },
  ];
  const rules = [
    {
      issuanceId: fund,
      tenantId: northwind,
      kycMinRemainingValidityDays: 30,
      transfersAllowed: true,
      maxInvestors: 50,
      createdBy: OPERATOR,
    },
  ];
  const assessment = (investor: string, context: string, when: Date) => ({
    id: deterministicUuid(`assessment:${key}:${context}:${investor}`),
    tenantId: northwind,
    investorId: investorId(investor),
    issuanceId: fund,
    context,
    result: 'ELIGIBLE',
    rules: [],
    rulesVersion: `${ELIGIBILITY_ENGINE_VERSION}/rules-1`,
    decidedBySystem: true,
    assessedAt: when,
  });
  const assessments = [
    ...holders.map(([investor]) => assessment(investor, 'INVITATION', ago(78, 9))),
    ...holders.map(([investor]) => assessment(investor, 'SUBSCRIPTION', ago(70, 9))),
    ...(pending ? [assessment(pending.to, 'TRANSFER', at(1, 9))] : []),
  ];
  const invitations = holders.map(([investor]) => ({
    id: deterministicUuid(`invitation:${key}:${investor}`),
    tenantId: northwind,
    issuanceId: fund,
    investorId: investorId(investor),
    eligibilityAssessmentId: deterministicUuid(`assessment:${key}:INVITATION:${investor}`),
    invitedBy: OPERATOR,
    invitedAt: ago(78, 10),
    createdBy: OPERATOR,
  }));
  const subscriptionId = (investor: string) => deterministicUuid(`subscription:${key}:${investor}`);
  const subscriptions = holders.map(([investor, units, account]) => ({
    id: subscriptionId(investor),
    tenantId: northwind,
    issuanceId: fund,
    investorId: investorId(investor),
    status: 'ALLOCATED',
    requestedUnits: units,
    requestedAmount: amount(units),
    currency: 'EUR',
    allocatedUnits: units,
    amountDue: amount(units),
    paymentReference: 'FR76 0000 0000 0000 (demo)',
    documentsAcceptedAt: ago(70, 9),
    eligibilityDeclaredAt: ago(70, 9),
    submittedAt: ago(70, 9),
    eligibilityAssessmentId: deterministicUuid(`assessment:${key}:SUBSCRIPTION:${investor}`),
    reviewedBy: OPERATOR,
    decidedBy: ADMIN,
    decidedAt: ago(69, 11),
    createdBy: account,
    version: 7,
  }));
  const round = id('allocation-round');
  const allocationRounds = [
    {
      id: round,
      tenantId: northwind,
      issuanceId: fund,
      status: 'VALIDATED',
      totalAllocatedUnits: allocated.toString(),
      proposedBy: OPERATOR,
      proposedAt: ago(38, 10),
      validatedBy: ADMIN,
      validatedAt: ago(37, 10),
      createdBy: OPERATOR,
      version: 4,
    },
  ];
  const allocations = holders.map(([investor, units]) => ({
    id: deterministicUuid(`allocation:${key}:${investor}`),
    tenantId: northwind,
    allocationRoundId: round,
    subscriptionId: subscriptionId(investor),
    investorId: investorId(investor),
    allocatedUnits: units,
    amount: amount(units),
    currency: 'EUR',
    createdBy: OPERATOR,
  }));
  const paymentId = (investor: string) => deterministicUuid(`payment:${key}:${investor}`);
  const payments = holders.map(([investor, units], index) => ({
    id: paymentId(investor),
    tenantId: northwind,
    subscriptionId: subscriptionId(investor),
    amount: amount(units),
    currency: 'EUR',
    status: 'CONFIRMED',
    preparedBy: OPERATOR,
    preparedAt: ago(35 - index, 9),
    confirmedBy: ADMIN2,
    confirmedAt: ago(35 - index, 15),
    providerReference: `FAKE-PAY-DEMO${key.toUpperCase()}${index + 1}`,
    createdBy: OPERATOR,
  }));

  // Accounts, then the ledger: creation, allocation and block, unblock at payment; a pending
  // transfer blocks units of its sender.
  const accountId = (investor: string | null) =>
    deterministicUuid(`account:${key}:${investor ?? 'treasury'}`);
  const accounts = [null, ...holders.map(([investor]) => investor)].map((investor) => ({
    id: accountId(investor),
    tenantId: northwind,
    issuanceId: fund,
    investorId: investor ? investorId(investor) : null,
    type: investor ? 'INVESTOR' : 'ISSUER_TREASURY',
    createdAt: ago(37, 10),
  }));
  const transfer = deterministicUuid(`transfer:${key}:${pending?.from}-${pending?.to}`);
  const raw: {
    type: LedgerEntryType;
    source: string | null;
    destination: string | null;
    quantity: string;
    at: Date;
    reference: string;
    metadata: Record<string, string>;
    user: string;
  }[] = [
    {
      type: 'ISSUANCE',
      source: null,
      destination: accountId(null),
      quantity: options.totalUnits,
      at: ago(37, 10),
      reference: `allocation-round:${round}`,
      metadata: { allocationRoundId: round },
      user: ADMIN,
    },
  ];
  for (const [investor, units] of holders) {
    const metadata = { allocationRoundId: round, subscriptionId: subscriptionId(investor) };
    const common = {
      quantity: units,
      at: ago(37, 10),
      reference: `allocation-round:${round}`,
      metadata,
      user: ADMIN,
    };
    raw.push(
      { type: 'ALLOCATION', source: accountId(null), destination: accountId(investor), ...common },
      { type: 'BLOCK', source: accountId(investor), destination: accountId(investor), ...common },
    );
  }
  holders.forEach(([investor, units], index) => {
    raw.push({
      type: 'UNBLOCK',
      source: accountId(investor),
      destination: accountId(investor),
      quantity: units,
      at: ago(35 - index, 15),
      reference: `payment:${paymentId(investor)}`,
      metadata: { subscriptionId: subscriptionId(investor), paymentId: paymentId(investor) },
      user: ADMIN2,
    });
  });
  if (pending) {
    raw.push({
      type: 'BLOCK',
      source: accountId(pending.from),
      destination: accountId(pending.from),
      quantity: pending.quantity,
      at: at(1, 10),
      reference: `transfer:${transfer}`,
      metadata: { transferId: transfer },
      user: userId('investor.a@example.com'),
    });
  }
  let previousHash = ZERO_HASH;
  const ledgerEntries = raw.map((row, index) => {
    const hashed = {
      issuanceId: fund,
      sequenceNo: index + 1,
      type: row.type,
      sourceAccountId: row.source,
      destinationAccountId: row.destination,
      quantity: row.quantity,
      effectiveDate: dateInTimeZone(row.at, 'Europe/Paris'),
      recordedAt: row.at,
      businessReference: row.reference,
      reversesEntryId: null,
      initiatedByUserId: row.user,
      initiatedByService: null,
      metadata: row.metadata,
      correlationId: null,
    };
    const hash = entryHash(previousHash, hashed);
    const entry = {
      id: deterministicUuid(`ledger:${key}:${index + 1}`),
      tenantId: northwind,
      ...hashed,
      previousHash,
      entryHash: hash,
    };
    previousHash = hash;
    return entry;
  });
  const ledgerHeads = [
    { issuanceId: fund, tenantId: northwind, lastSequence: raw.length, lastHash: previousHash },
  ];
  const positions = [
    {
      id: deterministicUuid(`position:${key}:treasury`),
      tenantId: northwind,
      issuanceId: fund,
      accountId: accountId(null),
      investorId: null,
      quantityHeld: total.minus(allocated).toString(),
      quantityBlocked: '0',
      acquisitionAmount: '0',
      currency: 'EUR',
      version: 5,
    },
    ...holders.map(([investor, units]) => ({
      id: deterministicUuid(`position:${key}:${investor}`),
      tenantId: northwind,
      issuanceId: fund,
      accountId: accountId(investor),
      investorId: investorId(investor),
      quantityHeld: units,
      quantityBlocked: investor === pending?.from ? pending.quantity : '0',
      acquisitionAmount: amount(units),
      currency: 'EUR',
      version: investor === pending?.from ? 5 : 4,
    })),
  ];
  const transfers = pending
    ? [
        {
          id: transfer,
          tenantId: northwind,
          issuanceId: fund,
          fromInvestorId: investorId(pending.from),
          toInvestorId: investorId(pending.to),
          recipientCode: recipientCode(pending.to),
          quantity: pending.quantity,
          indicativePrice: '1010.00',
          indicativePriceCurrency: 'EUR',
          status: 'COMPLIANCE_REVIEW',
          blockEntryId: ledgerEntries.at(-1)!.id,
          eligibilityAssessmentId: deterministicUuid(`assessment:${key}:TRANSFER:${pending.to}`),
          requestedBy: userId('investor.a@example.com'),
          submittedAt: at(1, 10),
          createdBy: userId('investor.a@example.com'),
          version: 3,
        },
      ]
    : [];

  // An active issuance has its coupon schedule, generated at its activation.
  const schedules =
    options.status === 'ACTIVE'
      ? generateSchedule({
          issueDate: options.issueDate,
          maturityDate: options.maturityDate,
          frequency: options.distributionFrequency,
          businessDayConvention: 'FOLLOWING',
          recordDateOffsetBusinessDays: 1,
        }).map((row) => ({
          ...row,
          id: deterministicUuid(`coupon:${key}:${row.sequence}`),
          tenantId: northwind,
          issuanceId: fund,
          status: 'SCHEDULED',
        }))
      : [];

  const step = (
    resourceType: string,
    resourceId: string,
    stepKey: string,
    statuses: [string | null, string, string | null, string | null, Date][],
  ) =>
    statuses.map(([from, to, actor, role, when], index) => ({
      id: deterministicUuid(`transition:${stepKey}:${index}`),
      tenantId: northwind,
      resourceType,
      resourceId,
      fromStatus: from,
      toStatus: to,
      actorUserId: actor,
      actorRole: role,
      occurredAt: when,
    }));
  const investorA = userId('investor.a@example.com');
  const transitions = [
    ...step('issuance', fund, key, [
      [null, 'DRAFT', OPERATOR, 'ISSUER_OPERATOR', ago(95, 9)],
      ['DRAFT', 'UNDER_REVIEW', OPERATOR, 'ISSUER_OPERATOR', ago(90, 9)],
      ['UNDER_REVIEW', 'APPROVED', ADMIN, 'ISSUER_ADMIN', ago(88, 9)],
      ['APPROVED', 'SUBSCRIPTION_OPEN', ADMIN, 'ISSUER_ADMIN', ago(80, 9)],
      ['SUBSCRIPTION_OPEN', 'SUBSCRIPTION_CLOSED', null, null, ago(39, 2)],
      ['SUBSCRIPTION_CLOSED', 'ALLOCATED', ADMIN, 'ISSUER_ADMIN', ago(37, 10)],
      ...(options.status === 'ACTIVE'
        ? ([['ALLOCATED', 'ACTIVE', ADMIN, 'ISSUER_ADMIN', ago(30, 10)]] as [
            string,
            string,
            string,
            string,
            Date,
          ][])
        : []),
    ]),
    ...step('allocation_round', round, `${key}:round`, [
      [null, 'DRAFT', OPERATOR, 'ISSUER_OPERATOR', ago(38, 9)],
      ['DRAFT', 'PROPOSED', OPERATOR, 'ISSUER_OPERATOR', ago(38, 10)],
      ['PROPOSED', 'VALIDATED', ADMIN, 'ISSUER_ADMIN', ago(37, 10)],
    ]),
    ...holders.flatMap(([investor, , account], index) =>
      step('subscription', subscriptionId(investor), `${key}:subscription:${investor}`, [
        [null, 'DRAFT', account, 'INVESTOR', ago(70, 8)],
        ['DRAFT', 'SUBMITTED', account, 'INVESTOR', ago(70, 9)],
        ['SUBMITTED', 'UNDER_REVIEW', OPERATOR, 'ISSUER_OPERATOR', ago(69, 10)],
        ['UNDER_REVIEW', 'APPROVED', ADMIN, 'ISSUER_ADMIN', ago(69, 11)],
        ['APPROVED', 'PAYMENT_PENDING', ADMIN, 'ISSUER_ADMIN', ago(37, 10)],
        ['PAYMENT_PENDING', 'PAYMENT_CONFIRMED', ADMIN2, 'ISSUER_ADMIN', ago(35 - index, 15)],
        ['PAYMENT_CONFIRMED', 'ALLOCATED', ADMIN2, 'ISSUER_ADMIN', ago(35 - index, 15)],
      ]),
    ),
    ...(pending
      ? step('transfer', transfer, `${key}:transfer`, [
          [null, 'DRAFT', investorA, 'INVESTOR', at(1, 9)],
          ['DRAFT', 'SUBMITTED', investorA, 'INVESTOR', at(1, 10)],
          ['SUBMITTED', 'COMPLIANCE_REVIEW', investorA, 'INVESTOR', at(1, 10)],
        ])
      : []),
  ];
  return {
    issuances,
    terms,
    rules,
    assessments,
    invitations,
    subscriptions,
    allocationRounds,
    allocations,
    payments,
    accounts,
    positions,
    ledgerHeads,
    ledgerEntries,
    transfers,
    schedules,
    transitions,
  };
}
