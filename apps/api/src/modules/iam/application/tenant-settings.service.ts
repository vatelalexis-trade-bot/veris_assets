import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { currentUser } from '../../../core/context/request-context.js';
import { DATABASE, type Database, withCurrentTenant } from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { tenant } from '../infrastructure/schema.js';

/** Settings of the signed-in user's own organisation (SPEC §4.2, docs/API.md §2.4). */
@Injectable()
export class TenantSettingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditWriter,
  ) {}

  async get() {
    const [found] = await withCurrentTenant(this.db, (tx) => tx.select().from(tenant));
    if (!found) throw new AppError('RESOURCE_NOT_FOUND');
    return found;
  }

  async update(
    version: number,
    changes: { tradeName?: string | null; defaultLocale?: 'en-GB' | 'fr-FR'; timezone?: string },
  ) {
    const [updated] = await withCurrentTenant(this.db, (tx, tenantId) =>
      tx
        .update(tenant)
        .set({ ...changes, version: sql`${tenant.version} + 1`, updatedAt: new Date() })
        .where(and(eq(tenant.id, tenantId), eq(tenant.version, version)))
        .returning(),
    );
    if (!updated) throw new AppError('VERSION_CONFLICT');
    const actor = currentUser();
    await this.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorRole: actor.roles.join(','),
      action: 'TENANT_SETTINGS_UPDATED',
      resourceType: 'tenant',
      resourceId: updated.id,
      result: 'SUCCESS',
      reason: Object.keys(changes).join(','),
    });
    return updated;
  }
}
