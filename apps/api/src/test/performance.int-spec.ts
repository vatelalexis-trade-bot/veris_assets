// Performance budget of SPEC §25 (P16-2): every read route of the API answers in less than
// 500 ms on the demonstration data, for the role that uses it.
import type { RoleCode } from '@virtus/shared';
import { ROLE_PERMISSIONS } from '@virtus/shared';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from './integration-app.js';
import { discoverRoutes, type DiscoveredRoute } from './routes.js';

const BUDGET_MS = 500;

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
const agents = new Map<RoleCode, Agent>();

const ACCOUNTS: [RoleCode, string][] = [
  ['ISSUER_ADMIN', 'northwind.admin1@example.com'],
  ['COMPLIANCE_OFFICER', 'northwind.compliance@example.com'],
  ['INVESTOR', 'investor.a@example.com'],
  ['PLATFORM_ADMIN', 'platform.admin@example.com'],
];

/** An identifier of the demonstration data for each kind of path parameter. */
const IDS: [RegExp, string][] = [
  [/^\/api\/v1\/issuances\/:id/, `SELECT id FROM issuance.issuance WHERE code = 'NWGN'`],
  [
    /^\/api\/v1\/investors\/:id/,
    `SELECT id FROM investor.investor WHERE legal_name LIKE 'Alpine%'`,
  ],
  [
    /^\/api\/v1\/subscriptions\/:id/,
    `SELECT id FROM registry.subscription WHERE status = 'SUBMITTED' LIMIT 1`,
  ],
  [
    /^\/api\/v1\/distributions\/:id/,
    `SELECT id FROM servicing.distribution WHERE status = 'PAID' LIMIT 1`,
  ],
  [/^\/api\/v1\/transfers\/:id/, `SELECT id FROM registry.transfer_request LIMIT 1`],
  [
    /^\/api\/v1\/positions\/:id/,
    `SELECT p.id FROM registry.position p JOIN investor.investor i ON i.id = p.investor_id WHERE i.legal_name LIKE 'Alpine%' LIMIT 1`,
  ],
  [
    /^\/api\/v1\/me\/portfolio\/:id/,
    `SELECT p.id FROM registry.position p JOIN investor.investor i ON i.id = p.investor_id WHERE i.legal_name LIKE 'Alpine%' LIMIT 1`,
  ],
  [/^\/api\/v1\/ledger\/:id/, `SELECT id FROM registry.ledger_entry LIMIT 1`],
  [/^\/api\/v1\/allocations\/:id/, `SELECT id FROM registry.allocation_round LIMIT 1`],
  [/^\/api\/v1\/kyc-cases\/:id/, `SELECT id FROM investor.kyc_case LIMIT 1`],
  [
    /^\/api\/v1\/audit-events\/:id/,
    `SELECT id FROM audit.audit_event WHERE tenant_id IS NOT NULL LIMIT 1`,
  ],
  [/^\/api\/v1\/tenants\/:id/, `SELECT id FROM iam.tenant LIMIT 1`],
  [
    /^\/api\/v1\/users\/:id/,
    `SELECT id FROM iam.user WHERE email = 'northwind.operator@example.com'`,
  ],
];

/** The first account whose role may call the route. */
function roleFor(route: DiscoveredRoute): RoleCode | null {
  if (!route.permission) return 'ISSUER_ADMIN';
  const found = ACCOUNTS.find(([role]) => ROLE_PERMISSIONS[role][route.permission!] !== undefined);
  return found?.[0] ?? null;
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
  for (const [role, email] of ACCOUNTS) agents.set(role, await ctx.signIn(email));
});

afterAll(async () => {
  await ctx.close();
});

describe('performance budget (SPEC §25)', () => {
  it(`answers every read route in less than ${BUDGET_MS} ms on the demonstration data`, async () => {
    const measured: { path: string; status: number; ms: number }[] = [];
    const routes = discoverRoutes(ctx.app).filter(
      (route) =>
        route.method === 'GET' &&
        !route.path.includes('download') &&
        route.path.startsWith('/api/'),
    );
    for (const route of routes) {
      const role = roleFor(route);
      if (!role) continue;
      let path = route.path;
      if (path.includes(':')) {
        const lookup = IDS.find(([pattern]) => pattern.test(path));
        if (!lookup) continue;
        const { rows } = await ctx.admin.query<{ id: string }>(lookup[1]);
        if (!rows[0]) continue;
        path = path.replace(/:[a-zA-Z]+/, rows[0].id);
      }
      const agent = agents.get(role)!;
      // The first call warms the connections and caches; the second one is measured.
      await agent.get(path);
      const started = performance.now();
      const response = await agent.get(path);
      measured.push({
        path: route.path,
        status: response.status,
        ms: Math.round(performance.now() - started),
      });
    }
    expect(measured.filter((row) => row.status === 200).length).toBeGreaterThan(30);
    expect(measured.filter((row) => row.ms >= BUDGET_MS)).toEqual([]);
  });
});
