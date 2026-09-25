import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import { DATABASE, type Database, withCurrentTenant } from '../../../core/database/database.js';
import { auditEvent } from '../../../core/database/schema.js';
import { AppError } from '../../../core/errors/app-error.js';
import { offsetOf, type Page, type Pagination } from '../../../core/http/pagination.js';
import { UserDirectory } from '../../iam/index.js';

export type AuditEventRow = typeof auditEvent.$inferSelect;
export type AuditEventWithActor = AuditEventRow & { actorName: string | null };

export interface AuditFilters {
  action?: string;
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
  result?: 'SUCCESS' | 'DENIED' | 'FAILED';
  /** Inclusive lower bound, UTC. */
  from?: Date;
  /** Exclusive upper bound, UTC. */
  to?: Date;
}

/**
 * Consultation of the audit log of the signed-in user's organisation (SPEC §17, §4.6). Read-only:
 * the log is append-only in the database. Rows of other tenants are invisible (row level security).
 */
@Injectable()
export class AuditLogService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UserDirectory,
  ) {}

  async list(filters: AuditFilters, pagination: Pagination): Promise<Page<AuditEventWithActor>> {
    const conditions: SQL[] = [];
    if (filters.action) conditions.push(eq(auditEvent.action, filters.action));
    if (filters.resourceType) conditions.push(eq(auditEvent.resourceType, filters.resourceType));
    if (filters.resourceId) conditions.push(eq(auditEvent.resourceId, filters.resourceId));
    if (filters.actorUserId) conditions.push(eq(auditEvent.actorUserId, filters.actorUserId));
    if (filters.result) conditions.push(eq(auditEvent.result, filters.result));
    if (filters.from) conditions.push(gte(auditEvent.occurredAt, filters.from));
    if (filters.to) conditions.push(lt(auditEvent.occurredAt, filters.to));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return withCurrentTenant(this.db, async (tx) => {
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(auditEvent)
        .where(where);
      const rows = await tx
        .select()
        .from(auditEvent)
        .where(where)
        .orderBy(desc(auditEvent.occurredAt), desc(auditEvent.id))
        .limit(pagination.pageSize)
        .offset(offsetOf(pagination));
      const names = await this.users.namesOf(
        tx,
        rows.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])),
      );
      return {
        data: rows.map((row) => withActor(row, names)),
        meta: { ...pagination, total },
      };
    });
  }

  async get(id: string): Promise<AuditEventWithActor> {
    return withCurrentTenant(this.db, async (tx) => {
      const [row] = await tx.select().from(auditEvent).where(eq(auditEvent.id, id));
      if (!row) throw new AppError('RESOURCE_NOT_FOUND');
      const names = await this.users.namesOf(tx, row.actorUserId ? [row.actorUserId] : []);
      return withActor(row, names);
    });
  }

  /** Actions present in the log, for the filter of the audit screen. */
  async actions(): Promise<string[]> {
    const rows = await withCurrentTenant(this.db, (tx) =>
      tx
        .selectDistinct({ action: auditEvent.action })
        .from(auditEvent)
        .orderBy(asc(auditEvent.action)),
    );
    return rows.map((row) => row.action);
  }
}

function withActor(row: AuditEventRow, names: Map<string, string>): AuditEventWithActor {
  return { ...row, actorName: row.actorUserId ? (names.get(row.actorUserId) ?? null) : null };
}
