import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { country, currency, referenceData } from '../../src/core/database/schema.js';
import { tenant } from '../../src/modules/iam/infrastructure/schema.js';
import { connectionConfig, withClient } from './admin.js';
import * as data from './seed-data.js';
import { databaseName } from './tools-env.js';
export async function seedDatabase(env, target) {
  await withClient(connectionConfig(env, databaseName(env, target), 'migrator'), async (client) => {
    const db = drizzle({ client, casing: 'snake_case' });
    await db.transaction(async (tx) => {
      await tx.insert(country).values(data.countries).onConflictDoNothing();
      await tx.insert(currency).values(data.currencies).onConflictDoNothing();
      await tx.insert(referenceData).values(data.referenceData).onConflictDoNothing();
    });
    for (const row of data.tenants) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${row.id}, true)`);
        await tx.insert(tenant).values(row).onConflictDoNothing();
      });
    }
  });
}
//# sourceMappingURL=seed.js.map
