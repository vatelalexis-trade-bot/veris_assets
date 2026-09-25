import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { currentUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withCurrentTenant,
} from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { Outbox } from '../../../core/outbox/outbox.js';
import { Workflow } from '../../../core/workflow/workflow.js';
import { IAM_EVENTS } from './iam-events.js';
import { TENANT_STAFF_ROLES, type RoleCode } from '../domain/roles.js';
import { userStatusMachine, type AccountStatus } from '../domain/statuses.js';
import type { EmailLocale } from '../infrastructure/emails.js';
import { IdentityRepository } from '../infrastructure/identity.repository.js';
import { role, user, userInvitation, userRole } from '../infrastructure/schema.js';
import { InvitationService } from './invitation.service.js';

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  locale: string;
  status: string;
  roles: RoleCode[];
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

/**
 * Users of the signed-in administrator's tenant (SPEC §4.2). Every query runs in a transaction
 * bound to the session's tenant: users of other tenants are invisible (404). Each change is
 * audited, and its events published, in the same transaction.
 */
@Injectable()
export class UserManagementService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly identities: IdentityRepository,
    private readonly invitations: InvitationService,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
    private readonly workflow: Workflow,
  ) {}

  list(): Promise<ManagedUser[]> {
    return withCurrentTenant(this.db, async (tx) => {
      const users = await tx.select().from(user).orderBy(asc(user.name));
      const roles = await this.rolesByUser(
        tx,
        users.map((row) => row.id),
      );
      return users.map((row) => toManaged(row, roles.get(row.id) ?? []));
    });
  }

  get(id: string): Promise<ManagedUser> {
    return withCurrentTenant(this.db, (tx) => this.find(tx, id));
  }

  private async find(tx: Transaction, id: string): Promise<ManagedUser> {
    const [found] = await tx.select().from(user).where(eq(user.id, id));
    if (!found) throw new AppError('RESOURCE_NOT_FOUND');
    return toManaged(found, (await this.rolesByUser(tx, [id])).get(id) ?? []);
  }

  async update(id: string, changes: { name?: string; locale?: EmailLocale }): Promise<ManagedUser> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const before = await this.find(tx, id);
      await tx
        .update(user)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(user.id, id));
      const fields = Object.keys(changes) as (keyof typeof changes)[];
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'USER_UPDATED',
        resourceType: 'user',
        resourceId: id,
        oldValue: Object.fromEntries(fields.map((field) => [field, before[field]])),
        newValue: changes,
        personalKeys: ['name'],
        result: 'SUCCESS',
      });
      return this.find(tx, id);
    });
  }

  async setStatus(id: string, status: AccountStatus): Promise<ManagedUser> {
    this.refuseOwnAccount(id);
    const updated = await withCurrentTenant(this.db, async (tx, tenantId) => {
      const target = await this.find(tx, id);
      const from = target.status as AccountStatus;
      await this.workflow.transition(tx, userStatusMachine, {
        tenantId,
        resourceId: id,
        from,
        to: status,
      });
      if (status === 'INACTIVE' && target.roles.includes('ISSUER_ADMIN'))
        await this.keepOneAdministrator(tx, id);
      await tx.update(user).set({ status, updatedAt: new Date() }).where(eq(user.id, id));
      await this.audit.recordIn(tx, {
        tenantId,
        action: status === 'ACTIVE' ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
        resourceType: 'user',
        resourceId: id,
        oldValue: { status: from },
        newValue: { status },
        result: 'SUCCESS',
      });
      return this.find(tx, id);
    });
    if (status === 'INACTIVE') await this.identities.revokeSessionsOfUser(id);
    return updated;
  }

  /** Replaces the roles of a user; the user's sessions end (new rights at next sign-in, D-003). */
  async setRoles(id: string, roles: RoleCode[]): Promise<ManagedUser> {
    this.refuseOwnAccount(id);
    const wanted = [...new Set(roles)];
    const invalid = wanted.filter((code) => !TENANT_STAFF_ROLES.includes(code));
    if (wanted.length === 0 || invalid.length > 0) {
      throw new AppError('VALIDATION_FAILED', [
        { code: 'ROLE_NOT_ASSIGNABLE', field: 'roles', meta: { roles: invalid } },
      ]);
    }
    const updated = await withCurrentTenant(this.db, async (tx, tenantId) => {
      const before = (await this.find(tx, id)).roles;
      if (before.includes('ISSUER_ADMIN') && !wanted.includes('ISSUER_ADMIN'))
        await this.keepOneAdministrator(tx, id);
      const roleRows = await tx
        .select({ id: role.id })
        .from(role)
        .where(inArray(role.code, wanted));
      await tx.delete(userRole).where(eq(userRole.userId, id));
      await tx.insert(userRole).values(
        roleRows.map((row) => ({
          userId: id,
          roleId: row.id,
          tenantId,
          grantedBy: currentUser().userId,
        })),
      );
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'USER_ROLES_CHANGED',
        resourceType: 'user',
        resourceId: id,
        oldValue: { roles: before },
        newValue: { roles: wanted },
        result: 'SUCCESS',
      });
      await this.outbox.publish(tx, {
        tenantId,
        eventType: IAM_EVENTS.rolesChanged,
        aggregateType: 'user',
        aggregateId: id,
      });
      return this.find(tx, id);
    });
    await this.identities.revokeSessionsOfUser(id);
    return updated;
  }

  async invite(invitee: { email: string; name: string; roleCode: RoleCode; locale: EmailLocale }) {
    if (!TENANT_STAFF_ROLES.includes(invitee.roleCode)) {
      throw new AppError('VALIDATION_FAILED', [{ code: 'ROLE_NOT_ASSIGNABLE', field: 'roleCode' }]);
    }
    const actor = currentUser();
    if (!actor.tenantId) throw new AppError('PERMISSION_DENIED');
    return this.invitations.invite(actor, { ...invitee, tenantId: actor.tenantId });
  }

  pendingInvitations() {
    return withCurrentTenant(this.db, (tx) =>
      tx
        .select({
          id: userInvitation.id,
          email: userInvitation.email,
          name: userInvitation.name,
          roleCode: role.code,
          expiresAt: userInvitation.expiresAt,
          createdAt: userInvitation.createdAt,
        })
        .from(userInvitation)
        .innerJoin(role, eq(role.id, userInvitation.roleId))
        .where(isNull(userInvitation.acceptedAt))
        .orderBy(desc(userInvitation.createdAt)),
    );
  }

  private refuseOwnAccount(id: string): void {
    if (id === currentUser().userId) {
      throw new AppError('VALIDATION_FAILED', [{ code: 'OWN_ACCOUNT', field: 'id' }]);
    }
  }

  /** An organisation always keeps at least one active Issuer Administrator. */
  private async keepOneAdministrator(tx: Transaction, leavingUserId: string): Promise<void> {
    const others = await tx
      .select({ id: user.id })
      .from(user)
      .innerJoin(userRole, eq(userRole.userId, user.id))
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(
        and(eq(role.code, 'ISSUER_ADMIN'), eq(user.status, 'ACTIVE'), ne(user.id, leavingUserId)),
      );
    if (others.length === 0) {
      throw new AppError('VALIDATION_FAILED', [{ code: 'LAST_ADMINISTRATOR', field: 'id' }]);
    }
  }

  private async rolesByUser(tx: Transaction, userIds: string[]): Promise<Map<string, RoleCode[]>> {
    const byUser = new Map<string, RoleCode[]>();
    if (userIds.length === 0) return byUser;
    const rows = await tx
      .select({ userId: userRole.userId, code: role.code })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(inArray(userRole.userId, userIds));
    for (const row of rows)
      byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.code as RoleCode]);
    return byUser;
  }
}

function toManaged(row: typeof user.$inferSelect, roles: RoleCode[]): ManagedUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    locale: row.locale,
    status: row.status,
    roles,
    mfaEnabled: row.twoFactorEnabled,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}
