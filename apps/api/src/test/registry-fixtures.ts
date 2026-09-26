// Test data of the registry: a closed issuance of Northwind with approved subscriptions, written
// directly in the database so that each test file has its own (files share one database).
import { randomUUID } from 'node:crypto';
import type request from 'supertest';
import type { IntegrationApp } from './integration-app.js';

type Agent = ReturnType<typeof request.agent>;

export interface ClosedIssuance {
  issuanceId: string;
  tenantId: string;
  /** Subscription of each investor, by the first word of its name (Alpine, Baltic, Cedar…). */
  subscriptions: Record<string, string>;
}

/** 1 000 units of 1 000 €, subscriptions closed, the given units requested and approved. */
export async function closedIssuance(
  ctx: IntegrationApp,
  requests: Record<string, string>,
): Promise<ClosedIssuance> {
  const code = `T${randomUUID().slice(0, 8).toUpperCase()}`;
  const { rows } = await ctx.admin.query<{ id: string; tenant_id: string }>(
    `WITH created AS (
       INSERT INTO issuance.issuance (tenant_id, name, code, status, currency, asset_category, country_code)
       SELECT id, 'Registry test notes ' || $1, $1, 'SUBSCRIPTION_CLOSED', 'EUR', 'INFRASTRUCTURE', 'FR'
       FROM iam.tenant WHERE legal_name LIKE 'Northwind%' RETURNING id, tenant_id
     ), terms AS (
       INSERT INTO issuance.issuance_terms (issuance_id, tenant_id, nominal_value, total_units,
         target_amount, minimum_amount, maximum_amount)
       SELECT id, tenant_id, 1000, 1000, 1000000, 500000, 1000000 FROM created
     ), rules AS (
       INSERT INTO issuance.eligibility_rule_set (issuance_id, tenant_id) SELECT id, tenant_id FROM created
     )
     SELECT id, tenant_id FROM created`,
    [code],
  );
  const { id: issuanceId, tenant_id: tenantId } = rows[0]!;
  const subscriptions: Record<string, string> = {};
  let order = 0;
  for (const [investor, units] of Object.entries(requests)) {
    order += 1;
    const inserted = await ctx.admin.query<{ id: string }>(
      `INSERT INTO registry.subscription (tenant_id, issuance_id, investor_id, status,
         requested_units, requested_amount, currency, submitted_at)
       SELECT $1, $2, i.id, 'APPROVED', $3::numeric, $3::numeric * 1000, 'EUR', now() - make_interval(mins => $4)
       FROM investor.investor i WHERE i.legal_name LIKE $5 AND i.tenant_id = $1
       RETURNING id`,
      [tenantId, issuanceId, units, 100 - order, `${investor}%`],
    );
    subscriptions[investor] = inserted.rows[0]!.id;
  }
  return { issuanceId, tenantId, subscriptions };
}

/** Allocation through the API: prepared and proposed by `preparer`, validated by `validator`. */
export async function allocate(
  preparer: Agent,
  validator: Agent,
  issuanceId: string,
  units: Record<string, string>,
): Promise<void> {
  const key = () => randomUUID();
  const created = await preparer
    .post(`/api/v1/issuances/${issuanceId}/allocation-rounds`)
    .set('Idempotency-Key', key())
    .expect(201);
  const round = created.body as {
    id: string;
    version: number;
    lines: { subscriptionId: string; investorName: string }[];
  };
  await preparer
    .patch(`/api/v1/allocations/${round.id}`)
    .set('If-Match', `"${round.version}"`)
    .send({
      lines: round.lines.map((line) => ({
        subscriptionId: line.subscriptionId,
        allocatedUnits: units[line.investorName.split(' ')[0]!]!,
      })),
    })
    .expect(200);
  await preparer
    .post(`/api/v1/allocations/${round.id}/propose`)
    .set('Idempotency-Key', key())
    .expect(200);
  await validator
    .post(`/api/v1/allocations/${round.id}/validate`)
    .set('Idempotency-Key', key())
    .expect(200);
}
