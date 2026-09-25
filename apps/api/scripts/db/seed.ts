// Loads the demonstration data. Idempotent: running it again changes nothing.
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { country, currency, referenceData } from '../../src/core/database/schema.js';
import { tenant } from '../../src/modules/iam/infrastructure/schema.js';
import {
  beneficialOwner,
  investor,
  investorRepresentative,
  kycCase,
} from '../../src/modules/investor-compliance/infrastructure/schema.js';
import { connectionConfig, withClient } from './admin.js';
import * as data from './seed-data.js';
import { seedIdentities } from './seed-identities.js';
import { demoInvestorRows } from './seed-investors.js';
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
  });
  await seedIdentities(env, target);
}
