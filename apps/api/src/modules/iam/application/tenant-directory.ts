import { Inject, Injectable } from '@nestjs/common';
import { dateInTimeZone, type BusinessDate } from '@veris/shared';
import { eq } from 'drizzle-orm';
import {
  DATABASE,
  type Database,
  type Transaction,
  withPlatformTransaction,
} from '../../../core/database/database.js';
import { tenant } from '../infrastructure/schema.js';

/**
 * Tenants for the other modules: the active ones and their time zone (daily jobs work tenant by
 * tenant, each in a transaction bound to that tenant), and "today" in a tenant's time zone.
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

  /** Today in the tenant's time zone (decision D-015), in the caller's transaction. */
  async todayOf(tx: Transaction, tenantId: string, now = new Date()): Promise<BusinessDate> {
    const [row] = await tx
      .select({ timezone: tenant.timezone })
      .from(tenant)
      .where(eq(tenant.id, tenantId));
    return dateInTimeZone(now, row?.timezone ?? 'Europe/Paris');
  }
}
