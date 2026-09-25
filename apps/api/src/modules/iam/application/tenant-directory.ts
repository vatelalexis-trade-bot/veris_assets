import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  DATABASE,
  type Database,
  withPlatformTransaction,
} from '../../../core/database/database.js';
import { tenant } from '../infrastructure/schema.js';

/**
 * Active tenants and their time zone, for the daily jobs of the other modules: they then work
 * tenant by tenant, each in a transaction bound to that tenant.
 */
@Injectable()
export class TenantDirectory {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  activeTenants(): Promise<{ id: string; timezone: string }[]> {
    return withPlatformTransaction(this.db, (tx) =>
      tx
        .select({ id: tenant.id, timezone: tenant.timezone })
        .from(tenant)
        .where(eq(tenant.status, 'ACTIVE')),
    );
  }
}
