import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, sql } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { currentUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  actOnTenant,
  type Transaction,
  withPlatformTransaction,
} from '../../../core/database/database.js';
import { changedValues } from '../../../core/audit/changed-values.js';
import { AppError } from '../../../core/errors/app-error.js';
import { Workflow } from '../../../core/workflow/workflow.js';
import { tenantStatusMachine, type AccountStatus } from '../domain/statuses.js';
import { offsetOf, type Page, type Pagination } from '../../../core/http/pagination.js';
import type { EmailLocale } from '../infrastructure/emails.js';
import { IdentityRepository } from '../infrastructure/identity.repository.js';
import { tenant } from '../infrastructure/schema.js';
import { InvitationService } from './invitation.service.js';

export type TenantRow = typeof tenant.$inferSelect;

export interface TenantInput {
  legalName: string;
  tradeName?: string | null;
  countryCode: string;
  baseCurrency: string;
  defaultLocale: EmailLocale;
  timezone: string;
  organizationType: 'ISSUER' | 'ASSET_MANAGER' | 'FUND';
}

export interface FirstAdministrator {
  email: string;
  name: string;
  locale: EmailLocale;
}

/** Organisations, managed by the Platform Administrator (SPEC §4.1, §6.1). */
@Injectable()
export class TenantManagementService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly invitations: InvitationService,
    private readonly identities: IdentityRepository,
    private readonly audit: AuditWriter,
    private readonly workflow: Workflow,
  ) {}

  async list(pagination: Pagination, search?: string): Promise<Page<TenantRow>> {
    // % and _ typed by the user are searched literally.
    const pattern = search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : undefined;
    const filter = pattern
      ? or(ilike(tenant.legalName, pattern), ilike(tenant.tradeName, pattern))
      : undefined;
    return withPlatformTransaction(this.db, async (tx) => {
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(tenant)
        .where(filter);
      const data = await tx
        .select()
        .from(tenant)
        .where(filter)
        .orderBy(asc(tenant.legalName))
        .limit(pagination.pageSize)
        .offset(offsetOf(pagination));
      return { data, meta: { ...pagination, total } };
    });
  }

  async get(id: string): Promise<TenantRow> {
    return withPlatformTransaction(this.db, (tx) => this.find(tx, id));
  }

  private async find(tx: Transaction, id: string): Promise<TenantRow> {
    const [found] = await tx.select().from(tenant).where(eq(tenant.id, id));
    if (!found) throw new AppError('RESOURCE_NOT_FOUND');
    return found;
  }

  /** Creates the tenant and invites its first Issuer Administrator (SPEC §6.1). */
  async create(input: TenantInput, firstAdministrator: FirstAdministrator): Promise<TenantRow> {
    const actor = currentUser();
    if (await this.identities.findUserByEmail(firstAdministrator.email)) {
      throw new AppError('VALIDATION_FAILED', [
        { code: 'EMAIL_ALREADY_REGISTERED', field: 'firstAdministrator.email' },
      ]);
    }
    const created = await withPlatformTransaction(this.db, async (tx) => {
      const [row] = await tx
        .insert(tenant)
        .values({ ...input, createdBy: actor.userId })
        .returning();
      // Recorded in the new tenant's own audit log.
      await actOnTenant(tx, row!.id);
      await this.audit.recordIn(tx, {
        tenantId: row!.id,
        action: 'TENANT_CREATED',
        resourceType: 'tenant',
        resourceId: row!.id,
        newValue: { ...input },
        result: 'SUCCESS',
      });
      return row!;
    });
    await this.invitations.invite(actor, {
      ...firstAdministrator,
      roleCode: 'ISSUER_ADMIN',
      tenantId: created.id,
    });
    return created;
  }

  async update(id: string, version: number, changes: Partial<TenantInput>): Promise<TenantRow> {
    return withPlatformTransaction(this.db, async (tx) => {
      const before = await this.find(tx, id);
      if (before.version !== version) throw new AppError('VERSION_CONFLICT');
      const [updated] = await tx
        .update(tenant)
        .set({ ...changes, version: sql`${tenant.version} + 1`, updatedAt: new Date() })
        .where(and(eq(tenant.id, id), eq(tenant.version, version)))
        .returning();
      if (!updated) throw new AppError('VERSION_CONFLICT');
      await actOnTenant(tx, id);
      await this.audit.recordIn(tx, {
        tenantId: id,
        action: 'TENANT_UPDATED',
        resourceType: 'tenant',
        resourceId: id,
        ...changedValues(before, changes),
        result: 'SUCCESS',
      });
      return updated;
    });
  }

  /** Deactivating a tenant ends at once every session of its users. */
  async setStatus(id: string, status: AccountStatus): Promise<TenantRow> {
    const updated = await withPlatformTransaction(this.db, async (tx) => {
      const before = await this.find(tx, id);
      const from = before.status as AccountStatus;
      await actOnTenant(tx, id);
      await this.workflow.transition(tx, tenantStatusMachine, {
        tenantId: id,
        resourceId: id,
        from,
        to: status,
      });
      const [row] = await tx
        .update(tenant)
        .set({ status, version: sql`${tenant.version} + 1`, updatedAt: new Date() })
        .where(eq(tenant.id, id))
        .returning();
      await this.audit.recordIn(tx, {
        tenantId: id,
        action: status === 'ACTIVE' ? 'TENANT_ACTIVATED' : 'TENANT_DEACTIVATED',
        resourceType: 'tenant',
        resourceId: id,
        oldValue: { status: from },
        newValue: { status },
        result: 'SUCCESS',
      });
      return row!;
    });
    if (status === 'INACTIVE') await this.identities.revokeSessionsOfTenant(id);
    return updated;
  }

  /** Invites another administrator of an existing tenant. */
  async inviteAdministrator(
    id: string,
    invitee: FirstAdministrator,
  ): Promise<{ id: string; expiresAt: Date }> {
    await this.get(id);
    return this.invitations.invite(currentUser(), {
      ...invitee,
      roleCode: 'ISSUER_ADMIN',
      tenantId: id,
    });
  }
}
