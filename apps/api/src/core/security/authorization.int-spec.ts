// Authorisation tests generated from the routes and the role × permission matrix (docs/BACKLOG.md
// P6-5), and scenario 5 of SPEC §29 (tenant isolation) on every route with an identifier.
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody, RoleCode } from '@virtus/shared';
import { ROLE_PERMISSIONS } from '@virtus/shared';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from '../../test/integration-app.js';
import { discoverRoutes, type DiscoveredRoute } from '../../test/routes.js';

const ACCOUNT_OF_ROLE: Record<RoleCode, string> = {
  PLATFORM_ADMIN: 'platform.admin@example.com',
  ISSUER_ADMIN: 'northwind.admin1@example.com',
  ISSUER_OPERATOR: 'northwind.operator@example.com',
  COMPLIANCE_OFFICER: 'northwind.compliance@example.com',
  AUDITOR: 'northwind.auditor@example.com',
  INVESTOR: 'investor.a@example.com',
};

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let routes: DiscoveredRoute[];
const agents = new Map<RoleCode, Agent>();
const errorCode = (response: request.Response) =>
  (response.body as Partial<ErrorResponseBody>).error?.code;

/**
 * Sends a request that can never change data: invalid body, unknown identifiers and a stale
 * version (and a fresh idempotency key). Only the access decision is observed.
 */
function harmlessCall(agent: Agent, route: DiscoveredRoute, id: string, body: object = {}) {
  const path = route.path.replace(/:[A-Za-z]+/g, id);
  const call = agent[route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](
    path,
  )
    .set('If-Match', '"999999"')
    .set('Idempotency-Key', randomUUID());
  return route.method === 'GET' ? call : call.send(body);
}

/**
 * Valid bodies for the isolation test, so that the request passes validation and really looks the
 * foreign resource up (an invalid body would stop at 400 before reaching it).
 */
const VALID_BODIES: [RegExp, object][] = [
  [/^PUT \/api\/v1\/users\/:id\/roles$/, { roles: ['AUDITOR'] }],
  [/^POST \/api\/v1\/investors\/:id\/representatives$/, { fullName: 'Probe (demo)' }],
  [
    /^POST \/api\/v1\/investors\/:id\/beneficial-owners$/,
    { fullName: 'Probe (demo)', ownershipPercentage: '10' },
  ],
  [/^POST \/api\/v1\/investors\/:id\/comments$/, { body: 'Probe' }],
  [
    /^POST \/api\/v1\/kyc-cases\/:id\/documents$/,
    { documentId: '0192a000-0000-7000-8000-000000000000', kind: 'OTHER' },
  ],
  [/^POST \/api\/v1\/kyc-cases\/:id\/(reject|send-back)$/, { comment: 'Probe' }],
  [/^POST \/api\/v1\/issuances\/:id\/(return-to-draft|cancel)$/, { comment: 'Probe' }],
  [
    /^POST \/api\/v1\/subscriptions\/:id\/submit$/,
    { documentsAccepted: true, eligibilityDeclared: true },
  ],
  [/^POST \/api\/v1\/subscriptions\/:id\/(reject|cancel)$/, { reason: 'Probe' }],
  [/^POST \/api\/v1\/allocations\/:id\/reject$/, { comment: 'Probe' }],
  [/^POST \/api\/v1\/ledger\/corrections\/:id\/reject$/, { comment: 'Probe' }],
  [
    /^POST \/api\/v1\/issuances\/:id\/invitations$/,
    { investorId: '0192a000-0000-7000-8000-000000000000' },
  ],
  [
    /^POST \/api\/v1\/issuances\/:id\/documents$/,
    { documentId: '0192a000-0000-7000-8000-000000000000', kind: 'TERM_SHEET' },
  ],
  [
    /^POST \/api\/v1\/investors\/:id\/eligibility-status$/,
    { status: 'SUSPENDED', justification: 'Probe' },
  ],
];

beforeAll(async () => {
  ctx = await startIntegrationApp();
  routes = discoverRoutes(ctx.app);
  for (const [role, email] of Object.entries(ACCOUNT_OF_ROLE) as [RoleCode, string][]) {
    agents.set(role, await ctx.signIn(email));
  }
}, 120_000);

afterAll(async () => {
  await ctx.close();
});

describe('access rules', () => {
  it('finds the routes of the application', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it('declares an access rule on every route (deny by default)', () => {
    const undeclared = routes
      .filter((route) => !route.isPublic && !route.sessionOnly && !route.permission)
      .map((route) => `${route.method} ${route.path}`);
    expect(undeclared).toEqual([]);
  });
});

describe('role × permission matrix on every protected route', () => {
  it('refuses each role the routes whose permission it lacks, and never blocks the others', async () => {
    const mismatches: string[] = [];
    for (const route of routes.filter((candidate) => candidate.permission)) {
      for (const [role, agent] of agents) {
        const granted = ROLE_PERMISSIONS[role][route.permission!] !== undefined;
        const response = await harmlessCall(agent, route, randomUUID());
        const denied = response.status === 403 && errorCode(response) === 'PERMISSION_DENIED';
        if (granted === denied) {
          mismatches.push(
            `${role} ${route.method} ${route.path} → ${response.status} ${errorCode(response) ?? ''}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  }, 120_000);
});

/** A closed issuance of Contoso, then its treasury account (registry resources of phase 12). */
const CONTOSO_ISSUANCE = `WITH created AS (
    INSERT INTO issuance.issuance (tenant_id, name, code, status)
    SELECT id, 'Contoso Notes (demo)', 'CTR' || floor(random() * 1e6)::text, 'SUBSCRIPTION_CLOSED'
    FROM iam.tenant WHERE legal_name LIKE 'Contoso%' RETURNING id, tenant_id
  )`;
const CONTOSO_ACCOUNT = `${CONTOSO_ISSUANCE}, account AS (
    INSERT INTO registry.logical_account (tenant_id, issuance_id, type)
    SELECT tenant_id, id, 'ISSUER_TREASURY' FROM created RETURNING id, tenant_id, issuance_id
  )`;

describe('scenario 5 — tenant isolation (SPEC §20, §29)', () => {
  // Identifier of a resource of the other tenant (Contoso) for every route that takes one.
  // A new route with an identifier makes the coverage test fail until a case is added here.
  const foreignResources: [RegExp, () => Promise<string>][] = [
    [
      /^\/api\/v1\/users\/:id/,
      () => idOf(`SELECT id FROM iam.user WHERE email = 'contoso.operator@example.com'`),
    ],
    [
      /^\/api\/v1\/tenants\/:id/,
      () => idOf(`SELECT id FROM iam.tenant WHERE legal_name LIKE 'Contoso%'`),
    ],
    [
      /^\/api\/v1\/investors\/:id/,
      () => idOf(`SELECT id FROM investor.investor WHERE legal_name LIKE 'Quarry%'`),
    ],
    [
      /^\/api\/v1\/kyc-cases\/:id/,
      () =>
        idOf(
          `SELECT c.id FROM investor.kyc_case c JOIN investor.investor i ON i.id = c.investor_id
           WHERE i.legal_name LIKE 'Quarry%'`,
        ),
    ],
    [
      /^\/api\/v1\/documents\/:id/,
      () =>
        idOf(
          `WITH created AS (
             INSERT INTO core.document (tenant_id, type, name, confidentiality, owner_type)
             SELECT id, 'REPORT', 'Contoso report (demo)', 'INTERNAL', 'TENANT' FROM iam.tenant
             WHERE legal_name LIKE 'Contoso%' RETURNING id, tenant_id
           ), version AS (
             INSERT INTO core.document_version (tenant_id, document_id, version, storage_key,
               mime_type, size_bytes, checksum_sha256, scan_status, file_name, uploaded_by)
             SELECT tenant_id, id, 1, 'unused', 'application/pdf', 1, repeat('0', 64), 'CLEAN',
               'report.pdf', id FROM created
           )
           SELECT id FROM created`,
        ),
    ],
    [
      /^\/api\/v1\/subscriptions\/:id/,
      () =>
        idOf(
          `WITH contoso AS (
             SELECT id FROM iam.tenant WHERE legal_name LIKE 'Contoso%'
           ), created AS (
             INSERT INTO issuance.issuance (tenant_id, name, code, status)
             SELECT id, 'Contoso Notes (demo)', 'CTS' || floor(random() * 1e6)::text, 'SUBSCRIPTION_OPEN'
             FROM contoso RETURNING id, tenant_id
           )
           INSERT INTO registry.subscription (tenant_id, issuance_id, investor_id, status,
             requested_units, requested_amount, currency)
           SELECT created.tenant_id, created.id, i.id, 'SUBMITTED', 100, 100000, 'EUR'
           FROM created, investor.investor i WHERE i.legal_name LIKE 'Quarry%'
           RETURNING id`,
        ),
    ],
    [
      /^\/api\/v1\/allocations\/:id/,
      () =>
        idOf(
          `${CONTOSO_ISSUANCE}
           INSERT INTO registry.allocation_round (tenant_id, issuance_id)
           SELECT tenant_id, id FROM created RETURNING id`,
        ),
    ],
    [
      /^\/api\/v1\/positions\/:id/,
      () =>
        idOf(
          `${CONTOSO_ACCOUNT}
           INSERT INTO registry.position (tenant_id, issuance_id, account_id, currency)
           SELECT tenant_id, issuance_id, id, 'EUR' FROM account RETURNING id`,
        ),
    ],
    [
      /^\/api\/v1\/ledger\/corrections\/:id/,
      () =>
        idOf(
          `${CONTOSO_ACCOUNT}, entry AS (
             INSERT INTO registry.ledger_entry (tenant_id, issuance_id, sequence_no, type,
               destination_account_id, quantity, effective_date, recorded_at, business_reference,
               previous_hash, entry_hash)
             SELECT tenant_id, issuance_id, 1, 'ISSUANCE', id, 100, current_date, now(), 'probe',
               repeat('0', 64), repeat('0', 64)
             FROM account RETURNING id, tenant_id, issuance_id
           )
           INSERT INTO registry.correction_request (tenant_id, issuance_id, target_entry_id, reason,
             requested_by)
           SELECT entry.tenant_id, entry.issuance_id, entry.id, 'Probe', u.id
           FROM entry, iam.user u WHERE u.email = 'contoso.operator@example.com'
           RETURNING id`,
        ),
    ],
    [
      /^\/api\/v1\/ledger\/:id/,
      () =>
        idOf(
          `${CONTOSO_ACCOUNT}
           INSERT INTO registry.ledger_entry (tenant_id, issuance_id, sequence_no, type,
             destination_account_id, quantity, effective_date, recorded_at, business_reference,
             previous_hash, entry_hash)
           SELECT tenant_id, issuance_id, 1, 'ISSUANCE', id, 100, current_date, now(), 'probe',
             repeat('0', 64), repeat('0', 64)
           FROM account RETURNING id`,
        ),
    ],
    [
      /^\/api\/v1\/issuances\/:id/,
      () =>
        idOf(
          `WITH created AS (
             INSERT INTO issuance.issuance (tenant_id, name, code, status)
             SELECT id, 'Contoso Notes (demo)', 'CTN' || floor(random() * 1e6)::text, 'APPROVED'
             FROM iam.tenant WHERE legal_name LIKE 'Contoso%' RETURNING id, tenant_id
           ), terms AS (
             INSERT INTO issuance.issuance_terms (issuance_id, tenant_id) SELECT id, tenant_id FROM created
           ), rules AS (
             INSERT INTO issuance.eligibility_rule_set (issuance_id, tenant_id) SELECT id, tenant_id FROM created
           )
           SELECT id FROM created`,
        ),
    ],
    [
      /^\/api\/v1\/eligibility-assessments\/:id/,
      () =>
        idOf(
          `INSERT INTO investor.eligibility_assessment (tenant_id, investor_id, context, result, rules,
             rules_version, decided_by_system)
           SELECT tenant_id, id, 'MANUAL', 'ELIGIBLE', '[]', 'engine-1/rules-0', true
           FROM investor.investor WHERE legal_name LIKE 'Quarry%'
           RETURNING id`,
        ),
    ],
    [
      /^\/api\/v1\/audit-events\/:id/,
      () =>
        idOf(
          `INSERT INTO audit.audit_event (tenant_id, action, source, result)
           SELECT id, 'TEST_EVENT', 'SYSTEM', 'SUCCESS' FROM iam.tenant WHERE legal_name LIKE 'Contoso%'
           RETURNING id`,
        ),
    ],
    [
      /^\/api\/v1\/notifications\/:id/,
      () =>
        idOf(
          `INSERT INTO core.notification (tenant_id, user_id, category, event_type, title_key)
           SELECT tenant_id, id, 'SECURITY', 'test', 'ROLES_CHANGED' FROM iam.user
           WHERE email = 'contoso.operator@example.com'
           RETURNING id`,
        ),
    ],
  ];
  async function idOf(query: string): Promise<string> {
    return (await ctx.admin.query<{ id: string }>(query)).rows[0]!.id;
  }
  const tenantRoutes = () => routes.filter((route) => !route.isPublic && route.path.includes(':'));

  it('has a foreign resource case for every protected route with an identifier', () => {
    const uncovered = tenantRoutes()
      .filter((route) => !foreignResources.some(([pattern]) => pattern.test(route.path)))
      .map((route) => `${route.method} ${route.path}`);
    expect(uncovered).toEqual([]);
  });

  it('answers 404 (never the data) when a Northwind user targets a Contoso resource', async () => {
    const leaks: string[] = [];
    for (const route of tenantRoutes()) {
      const foreignId = await foreignResources.find(([pattern]) => pattern.test(route.path))![1]();
      for (const role of [
        'ISSUER_ADMIN',
        'ISSUER_OPERATOR',
        'COMPLIANCE_OFFICER',
        'AUDITOR',
      ] as RoleCode[]) {
        if (ROLE_PERMISSIONS[role][route.permission!] === undefined) continue;
        const body = VALID_BODIES.find(([pattern]) =>
          pattern.test(`${route.method} ${route.path}`),
        )?.[1];
        const response = await harmlessCall(agents.get(role)!, route, foreignId, body);
        if (response.status !== 404 || JSON.stringify(response.body).includes(foreignId)) {
          leaks.push(`${role} ${route.method} ${route.path} → ${response.status}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('never lists users of another tenant', async () => {
    const response = await agents.get('ISSUER_ADMIN')!.get('/api/v1/users').expect(200);
    const emails = (response.body as { email: string }[]).map((user) => user.email);
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.filter((email) => email.startsWith('contoso.'))).toEqual([]);
  });

  it('answers 404 and audits a tenant forced in the query string', async () => {
    const contoso = await idOf(`SELECT id FROM iam.tenant WHERE legal_name LIKE 'Contoso%'`);
    const response = await agents
      .get('ISSUER_ADMIN')!
      .get(`/api/v1/users?tenantId=${contoso}`)
      .expect(404);
    expect(errorCode(response)).toBe('RESOURCE_NOT_FOUND');
    await expect
      .poll(
        async () =>
          (
            await ctx.admin.query(
              `SELECT 1 FROM audit.audit_event WHERE action = 'TENANT_OVERRIDE_ATTEMPT' AND reason LIKE '%/api/v1/users'`,
            )
          ).rowCount,
      )
      .toBeGreaterThan(0);
  });

  it('audits every access denial', async () => {
    await expect
      .poll(
        async () =>
          (
            await ctx.admin.query(
              `SELECT 1 FROM audit.audit_event WHERE action = 'ACCESS_DENIED' AND result = 'DENIED'`,
            )
          ).rowCount,
      )
      .toBeGreaterThan(0);
  });
});
