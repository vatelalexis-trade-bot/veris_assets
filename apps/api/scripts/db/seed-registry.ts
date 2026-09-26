// Demonstration registry (SPEC §28): "Northwind Private Debt Fund I" is allocated and paid, with
// positions and their ledger, and a transfer waiting for the compliance review. The movements are
// chained with the application's own hash, so the daily reconciliation finds them consistent.
import { addDays, addMonths, dateInTimeZone } from '@virtus/shared';
import { entryHash } from '../../src/modules/registry/application/ledger-hash.js';
import { ZERO_HASH, type LedgerEntryType } from '../../src/modules/registry/domain/ledger.js';
import { ELIGIBILITY_ENGINE_VERSION } from '../../src/modules/investor-compliance/domain/eligibility.js';
import { deterministicUuid } from './deterministic-id.js';
import { investorId, recipientCode } from './seed-investors.js';

const userId = (email: string) => deterministicUuid(`user:${email}`);
const OPERATOR = userId('northwind.operator@example.com');
const ADMIN = userId('northwind.admin1@example.com');
const ADMIN2 = userId('northwind.admin2@example.com');

/** Units of each holder, allocated and paid. */
const HOLDERS: [string, string, string | null][] = [
  ['alpine', '800', userId('investor.a@example.com')],
  ['baltic', '600', userId('investor.b@example.com')],
  ['cedar', '400', userId('investor.c@example.com')],
];
const TOTAL_UNITS = '2000';
const PENDING_TRANSFER = { from: 'alpine', to: 'danube', quantity: '100' };

export function demoRegistryRows(northwind: string, now = new Date()) {
  const today = dateInTimeZone(now, 'Europe/Paris');
  const fund = deterministicUuid('issuance:northwind-private-debt-fund-i');
  const at = (days: number, hour: number) =>
    new Date(`${addDays(today, -days)}T${String(hour).padStart(2, '0')}:00:00.000Z`);
  const issueDate = addDays(today, -10);

  const issuances = [
    {
      id: fund,
      tenantId: northwind,
      name: 'Northwind Private Debt Fund I',
      code: 'NWPD1',
      description: 'Unitranche loans to European mid-market companies (demo).',
      assetCategory: 'PRIVATE_DEBT',
      countryCode: 'LU',
      currency: 'EUR',
      legalIssuerName: 'Northwind Private Debt Fund I SCSp (demo)',
      spvName: null,
      status: 'ALLOCATED',
      wizardStep: 'REVIEW',
      submittedBy: OPERATOR,
      submittedAt: at(90, 9),
      approvedBy: ADMIN,
      approvedAt: at(88, 9),
      createdBy: OPERATOR,
    },
  ];
  const terms = [
    {
      issuanceId: fund,
      tenantId: northwind,
      targetAmount: '2000000.00',
      minimumAmount: '1000000.00',
      maximumAmount: '2000000.00',
      nominalValue: '1000.00',
      totalUnits: TOTAL_UNITS,
      interestRate: '0.055',
      rateType: 'FIXED',
      distributionFrequency: 'QUARTERLY',
      dayCount: '30E_360',
      issueDate,
      maturityDate: addMonths(issueDate, 48),
      subscriptionStartDate: addDays(today, -80),
      subscriptionEndDate: addDays(today, -40),
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
  const assessment = (key: string, context: string, days: number) => ({
    id: deterministicUuid(`assessment:nwpd1:${context}:${key}`),
    tenantId: northwind,
    investorId: investorId(key),
    issuanceId: fund,
    context,
    result: 'ELIGIBLE',
    rules: [],
    rulesVersion: `${ELIGIBILITY_ENGINE_VERSION}/rules-1`,
    decidedBySystem: true,
    assessedAt: at(days, 9),
  });
  const assessments = [
    ...HOLDERS.map(([key]) => assessment(key, 'INVITATION', 78)),
    ...HOLDERS.map(([key]) => assessment(key, 'SUBSCRIPTION', 70)),
    assessment(PENDING_TRANSFER.to, 'TRANSFER', 1),
  ];
  const invitations = HOLDERS.map(([key]) => ({
    id: deterministicUuid(`invitation:nwpd1:${key}`),
    tenantId: northwind,
    issuanceId: fund,
    investorId: investorId(key),
    eligibilityAssessmentId: deterministicUuid(`assessment:nwpd1:INVITATION:${key}`),
    invitedBy: OPERATOR,
    invitedAt: at(78, 10),
    createdBy: OPERATOR,
  }));
  const subscriptionId = (key: string) => deterministicUuid(`subscription:nwpd1:${key}`);
  const subscriptions = HOLDERS.map(([key, units, account]) => ({
    id: subscriptionId(key),
    tenantId: northwind,
    issuanceId: fund,
    investorId: investorId(key),
    status: 'ALLOCATED',
    requestedUnits: units,
    requestedAmount: `${units}000.00`,
    currency: 'EUR',
    allocatedUnits: units,
    amountDue: `${units}000.00`,
    paymentReference: 'FR76 0000 0000 0000 (demo)',
    documentsAcceptedAt: at(70, 9),
    eligibilityDeclaredAt: at(70, 9),
    submittedAt: at(70, 9),
    eligibilityAssessmentId: deterministicUuid(`assessment:nwpd1:SUBSCRIPTION:${key}`),
    reviewedBy: OPERATOR,
    decidedBy: ADMIN,
    decidedAt: at(69, 11),
    createdBy: account,
    version: 7,
  }));
  const round = deterministicUuid('allocation-round:nwpd1');
  const allocationRounds = [
    {
      id: round,
      tenantId: northwind,
      issuanceId: fund,
      status: 'VALIDATED',
      totalAllocatedUnits: '1800',
      proposedBy: OPERATOR,
      proposedAt: at(38, 10),
      validatedBy: ADMIN,
      validatedAt: at(37, 10),
      createdBy: OPERATOR,
      version: 4,
    },
  ];
  const allocations = HOLDERS.map(([key, units]) => ({
    id: deterministicUuid(`allocation:nwpd1:${key}`),
    tenantId: northwind,
    allocationRoundId: round,
    subscriptionId: subscriptionId(key),
    investorId: investorId(key),
    allocatedUnits: units,
    amount: `${units}000.00`,
    currency: 'EUR',
    createdBy: OPERATOR,
  }));
  const payments = HOLDERS.map(([key, units], index) => ({
    id: deterministicUuid(`payment:nwpd1:${key}`),
    tenantId: northwind,
    subscriptionId: subscriptionId(key),
    amount: `${units}000.00`,
    currency: 'EUR',
    status: 'CONFIRMED',
    preparedBy: OPERATOR,
    preparedAt: at(35 - index, 9),
    confirmedBy: ADMIN2,
    confirmedAt: at(35 - index, 15),
    providerReference: `FAKE-PAY-DEMO000${index + 1}`,
    createdBy: OPERATOR,
  }));

  // Accounts and positions.
  const accountId = (key: string | null) => deterministicUuid(`account:nwpd1:${key ?? 'treasury'}`);
  const owners: (string | null)[] = [null, ...HOLDERS.map(([key]) => key), PENDING_TRANSFER.to];
  const accounts = owners
    .filter((key) => key !== PENDING_TRANSFER.to)
    .map((key) => ({
      id: accountId(key),
      tenantId: northwind,
      issuanceId: fund,
      investorId: key ? investorId(key) : null,
      type: key ? 'INVESTOR' : 'ISSUER_TREASURY',
      createdAt: at(37, 10),
    }));

  // The ledger: creation, then allocation and block, then unblock at payment; the pending
  // transfer blocks 100 units of Alpine.
  const transfer = deterministicUuid('transfer:nwpd1:alpine-danube');
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
      quantity: TOTAL_UNITS,
      at: at(37, 10),
      reference: `allocation-round:${round}`,
      metadata: { allocationRoundId: round },
      user: ADMIN,
    },
  ];
  for (const [key, units] of HOLDERS) {
    const metadata = { allocationRoundId: round, subscriptionId: subscriptionId(key) };
    raw.push(
      {
        type: 'ALLOCATION',
        source: accountId(null),
        destination: accountId(key),
        quantity: units,
        at: at(37, 10),
        reference: `allocation-round:${round}`,
        metadata,
        user: ADMIN,
      },
      {
        type: 'BLOCK',
        source: accountId(key),
        destination: accountId(key),
        quantity: units,
        at: at(37, 10),
        reference: `allocation-round:${round}`,
        metadata,
        user: ADMIN,
      },
    );
  }
  HOLDERS.forEach(([key, units], index) => {
    const paymentId = deterministicUuid(`payment:nwpd1:${key}`);
    raw.push({
      type: 'UNBLOCK',
      source: accountId(key),
      destination: accountId(key),
      quantity: units,
      at: at(35 - index, 15),
      reference: `payment:${paymentId}`,
      metadata: { subscriptionId: subscriptionId(key), paymentId },
      user: ADMIN2,
    });
  });
  raw.push({
    type: 'BLOCK',
    source: accountId(PENDING_TRANSFER.from),
    destination: accountId(PENDING_TRANSFER.from),
    quantity: PENDING_TRANSFER.quantity,
    at: at(1, 10),
    reference: `transfer:${transfer}`,
    metadata: { transferId: transfer },
    user: userId('investor.a@example.com'),
  });
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
      id: deterministicUuid(`ledger:nwpd1:${index + 1}`),
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
      id: deterministicUuid('position:nwpd1:treasury'),
      tenantId: northwind,
      issuanceId: fund,
      accountId: accountId(null),
      investorId: null,
      quantityHeld: '200',
      quantityBlocked: '0',
      acquisitionAmount: '0',
      currency: 'EUR',
      version: 5,
    },
    ...HOLDERS.map(([key, units]) => ({
      id: deterministicUuid(`position:nwpd1:${key}`),
      tenantId: northwind,
      issuanceId: fund,
      accountId: accountId(key),
      investorId: investorId(key),
      quantityHeld: units,
      quantityBlocked: key === PENDING_TRANSFER.from ? PENDING_TRANSFER.quantity : '0',
      acquisitionAmount: `${units}000.00`,
      currency: 'EUR',
      version: key === PENDING_TRANSFER.from ? 5 : 4,
    })),
  ];
  const transfers = [
    {
      id: transfer,
      tenantId: northwind,
      issuanceId: fund,
      fromInvestorId: investorId(PENDING_TRANSFER.from),
      toInvestorId: investorId(PENDING_TRANSFER.to),
      recipientCode: recipientCode(PENDING_TRANSFER.to),
      quantity: PENDING_TRANSFER.quantity,
      indicativePrice: '1010.00',
      indicativePriceCurrency: 'EUR',
      status: 'COMPLIANCE_REVIEW',
      blockEntryId: ledgerEntries.at(-1)!.id,
      eligibilityAssessmentId: deterministicUuid(
        `assessment:nwpd1:TRANSFER:${PENDING_TRANSFER.to}`,
      ),
      requestedBy: userId('investor.a@example.com'),
      submittedAt: at(1, 10),
      createdBy: userId('investor.a@example.com'),
      version: 3,
    },
  ];

  const step = (
    resourceType: string,
    resourceId: string,
    key: string,
    statuses: [string | null, string, string | null, string | null, Date][],
  ) =>
    statuses.map(([from, to, actor, role, when], index) => ({
      id: deterministicUuid(`transition:${key}:${index}`),
      tenantId: northwind,
      resourceType,
      resourceId,
      fromStatus: from,
      toStatus: to,
      actorUserId: actor,
      actorRole: role,
      occurredAt: when,
    }));
  const transitions = [
    ...step('issuance', fund, 'nwpd1', [
      [null, 'DRAFT', OPERATOR, 'ISSUER_OPERATOR', at(95, 9)],
      ['DRAFT', 'UNDER_REVIEW', OPERATOR, 'ISSUER_OPERATOR', at(90, 9)],
      ['UNDER_REVIEW', 'APPROVED', ADMIN, 'ISSUER_ADMIN', at(88, 9)],
      ['APPROVED', 'SUBSCRIPTION_OPEN', ADMIN, 'ISSUER_ADMIN', at(80, 9)],
      ['SUBSCRIPTION_OPEN', 'SUBSCRIPTION_CLOSED', null, null, at(39, 2)],
      ['SUBSCRIPTION_CLOSED', 'ALLOCATED', ADMIN, 'ISSUER_ADMIN', at(37, 10)],
    ]),
    ...step('allocation_round', round, 'nwpd1:round', [
      [null, 'DRAFT', OPERATOR, 'ISSUER_OPERATOR', at(38, 9)],
      ['DRAFT', 'PROPOSED', OPERATOR, 'ISSUER_OPERATOR', at(38, 10)],
      ['PROPOSED', 'VALIDATED', ADMIN, 'ISSUER_ADMIN', at(37, 10)],
    ]),
    ...HOLDERS.flatMap(([key, , account], index) =>
      step('subscription', subscriptionId(key), `nwpd1:subscription:${key}`, [
        [null, 'DRAFT', account, 'INVESTOR', at(70, 8)],
        ['DRAFT', 'SUBMITTED', account, 'INVESTOR', at(70, 9)],
        ['SUBMITTED', 'UNDER_REVIEW', OPERATOR, 'ISSUER_OPERATOR', at(69, 10)],
        ['UNDER_REVIEW', 'APPROVED', ADMIN, 'ISSUER_ADMIN', at(69, 11)],
        ['APPROVED', 'PAYMENT_PENDING', ADMIN, 'ISSUER_ADMIN', at(37, 10)],
        ['PAYMENT_PENDING', 'PAYMENT_CONFIRMED', ADMIN2, 'ISSUER_ADMIN', at(35 - index, 15)],
        ['PAYMENT_CONFIRMED', 'ALLOCATED', ADMIN2, 'ISSUER_ADMIN', at(35 - index, 15)],
      ]),
    ),
    ...step('transfer', transfer, 'nwpd1:transfer', [
      [null, 'DRAFT', userId('investor.a@example.com'), 'INVESTOR', at(1, 9)],
      ['DRAFT', 'SUBMITTED', userId('investor.a@example.com'), 'INVESTOR', at(1, 10)],
      ['SUBMITTED', 'COMPLIANCE_REVIEW', userId('investor.a@example.com'), 'INVESTOR', at(1, 10)],
    ]),
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
    transitions,
  };
}
