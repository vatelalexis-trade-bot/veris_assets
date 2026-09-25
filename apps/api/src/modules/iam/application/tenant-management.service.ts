import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, sql } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { currentUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  withPlatformTransaction,
} from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
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
    const [found] = await withPlatformTransaction(this.db, (tx) =>
      tx.select().from(tenant).where(eq(tenant.id, id)),
    );
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
    const [created] = await withPlatformTransaction(this.db, (tx) =>
      tx
        .insert(tenant)
        .values({ ...input, createdBy: actor.userId })
        .returning(),
    );
    await this.invitations.invite(actor, {
      ...firstAdministrator,
      roleCode: 'ISSUER_ADMIN',
      tenantId: created!.id,
    });
    await this.audit.record({
      tenantId: created!.id,
      actorUserId: actor.userId,
      actorRole: actor.roles.join(','),
      action: 'TENANT_CREATED',
      resourceType: 'tenant',
      resourceId: created!.id,
      result: 'SUCCESS',
    });
    return created!;
  }

  async update(id: string, version: number, changes: Partial<TenantInput>): Promise<TenantRow> {
    const actor = currentUser();
    const [updated] = await withPlatformTransaction(this.db, (tx) =>
      tx
        .update(tenant)
        .set({ ...changes, version: sql`${tenant.version} + 1`, updatedAt: new Date() })
        .where(and(eq(tenant.id, id), eq(tenant.version, version)))
        .returning(),
    );
    if (!updated) {
      await this.get(id); // 404 when the tenant does not exist
      throw new AppError('VERSION_CONFLICT');
    }
    await this.audit.record({
      tenantId: id,
      actorUserId: actor.userId,
      actorRole: actor.roles.join(','),
      action: 'TENANT_UPDATED',
      resourceType: 'tenant',
      resourceId: id,
      result: 'SUCCESS',
      reason: Object.keys(changes).join(','),
    });
    return updated;
  }

  /** Deactivating a tenant ends at once every session of its users. */
  async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<TenantRow> {
    const actor = currentUser();
    const [updated] = await withPlatformTransaction(this.db, (tx) =>
      tx
        .update(tenant)
        .set({ status, version: sql`${tenant.version} + 1`, updatedAt: new Date() })
        .where(eq(tenant.id, id))
        .returning(),
    );
    if (!updated) throw new AppError('RESOURCE_NOT_FOUND');
    if (status === 'INACTIVE') await this.identities.revokeSessionsOfTenant(id);
    await this.audit.record({
      tenantId: id,
      actorUserId: actor.userId,
      actorRole: actor.roles.join(','),
      action: status === 'ACTIVE' ? 'TENANT_ACTIVATED' : 'TENANT_DEACTIVATED',
      resourceType: 'tenant',
      resourceId: id,
      result: 'SUCCESS',
    });
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
