// Loads the demonstration data. Idempotent: running it again changes nothing.
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  country,
  currency,
  referenceData,
  workflowTransition,
} from '../../src/core/database/schema.js';
import { tenant } from '../../src/modules/iam/infrastructure/schema.js';
import {
  eligibilityRuleSet,
  investorInvitation,
  issuance,
  issuanceTerms,
} from '../../src/modules/issuance/infrastructure/schema.js';
import {
  beneficialOwner,
  eligibilityAssessment,
  investor,
  investorRepresentative,
  kycCase,
} from '../../src/modules/investor-compliance/infrastructure/schema.js';
import {
  allocation,
  allocationRound,
  ledgerEntry,
  ledgerHead,
  logicalAccount,
  position,
  subscription,
  subscriptionPayment,
  transferRequest,
} from '../../src/modules/registry/infrastructure/schema.js';
import { connectionConfig, withClient } from './admin.js';
import * as data from './seed-data.js';
import { seedIdentities } from './seed-identities.js';
import { demoInvestorRows } from './seed-investors.js';
import { demoIssuanceRows } from './seed-issuances.js';
import { demoRegistryRows } from './seed-registry.js';
import { demoSubscriptionRows } from './seed-subscriptions.js';
import { databaseName, type DatabaseTarget, type ToolsEnv } from './tools-env.js';

export async function seedDatabase(env: ToolsEnv, target: DatabaseTarget): Promise<void> {
  await withClient(connectionConfig(env, databaseName(env, target), 'migrator'), async (client) => {
    const db = drizzle({ client, casing: 'snake_case' });

    await db.transaction(async (tx) => {
      await tx.insert(country).values(data.countries).onConflictDoNothing();
      await tx.insert(currency).values(data.currencies).onConflictDoNothing();
      await tx.insert(referenceData).values(data.referenceData).onConflictDoNothing();
    });

    // Row level security applies to the table owner too (FORCE): each tenant is written in a
    // transaction bound to that tenant, exactly like the API does.
    for (const row of data.tenants) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${row.id}, true)`);
        await tx.insert(tenant).values(row).onConflictDoNothing();
      });
    }

    const rows = demoInvestorRows({ northwind: data.tenants[0].id, contoso: data.tenants[1].id });
    for (const row of data.tenants) {
      const own = <T extends { tenantId: string }>(items: T[]) =>
        items.filter((item) => item.tenantId === row.id);
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${row.id}, true)`);
        const investors = own(rows.investors);
        if (investors.length === 0) return;
        await tx.insert(investor).values(investors).onConflictDoNothing();
        const cases = own(rows.cases);
        if (cases.length > 0) await tx.insert(kycCase).values(cases).onConflictDoNothing();
        const representatives = own(rows.representatives);
        if (representatives.length > 0) {
          await tx.insert(investorRepresentative).values(representatives).onConflictDoNothing();
        }
        const owners = own(rows.beneficialOwners);
        if (owners.length > 0)
          await tx.insert(beneficialOwner).values(owners).onConflictDoNothing();
      });
    }

    const northwind = data.tenants[0].id;
    const issuances = demoIssuanceRows(northwind);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${northwind}, true)`);
      await tx.insert(issuance).values(issuances.issuances).onConflictDoNothing();
      await tx.insert(issuanceTerms).values(issuances.terms).onConflictDoNothing();
      await tx.insert(eligibilityRuleSet).values(issuances.rules).onConflictDoNothing();
      await tx.insert(eligibilityAssessment).values(issuances.assessments).onConflictDoNothing();
      await tx.insert(investorInvitation).values(issuances.invitations).onConflictDoNothing();
      await tx.insert(workflowTransition).values(issuances.transitions).onConflictDoNothing();
      const subscriptions = demoSubscriptionRows(northwind);
      await tx
        .insert(eligibilityAssessment)
        .values(subscriptions.assessments)
        .onConflictDoNothing();
      await tx.insert(subscription).values(subscriptions.subscriptions).onConflictDoNothing();
      await tx.insert(workflowTransition).values(subscriptions.transitions).onConflictDoNothing();
      const registry = demoRegistryRows(northwind);
      await tx.insert(issuance).values(registry.issuances).onConflictDoNothing();
      await tx.insert(issuanceTerms).values(registry.terms).onConflictDoNothing();
      await tx.insert(eligibilityRuleSet).values(registry.rules).onConflictDoNothing();
      await tx.insert(eligibilityAssessment).values(registry.assessments).onConflictDoNothing();
      await tx.insert(investorInvitation).values(registry.invitations).onConflictDoNothing();
      await tx.insert(subscription).values(registry.subscriptions).onConflictDoNothing();
      await tx.insert(allocationRound).values(registry.allocationRounds).onConflictDoNothing();
      await tx.insert(allocation).values(registry.allocations).onConflictDoNothing();
      await tx.insert(subscriptionPayment).values(registry.payments).onConflictDoNothing();
      await tx.insert(logicalAccount).values(registry.accounts).onConflictDoNothing();
      await tx.insert(position).values(registry.positions).onConflictDoNothing();
      await tx.insert(ledgerHead).values(registry.ledgerHeads).onConflictDoNothing();
      await tx.insert(ledgerEntry).values(registry.ledgerEntries).onConflictDoNothing();
      await tx.insert(transferRequest).values(registry.transfers).onConflictDoNothing();
      await tx.insert(workflowTransition).values(registry.transitions).onConflictDoNothing();
    });
  });
  await seedIdentities(env, target);
}
