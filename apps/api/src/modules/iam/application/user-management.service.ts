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
import { TENANT_STAFF_ROLES, type RoleCode } from '../domain/roles.js';
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
 * bound to the session's tenant: users of other tenants are invisible (404).
 */
@Injectable()
export class UserManagementService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly identities: IdentityRepository,
    private readonly invitations: InvitationService,
    private readonly audit: AuditWriter,
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
    return withCurrentTenant(this.db, async (tx) => {
      const [found] = await tx.select().from(user).where(eq(user.id, id));
      if (!found) throw new AppError('RESOURCE_NOT_FOUND');
      return toManaged(found, (await this.rolesByUser(tx, [id])).get(id) ?? []);
    });
  }

  async update(id: string, changes: { name?: string; locale?: EmailLocale }): Promise<ManagedUser> {
    await withCurrentTenant(this.db, async (tx) => {
      const updated = await tx
        .update(user)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(user.id, id))
        .returning({ id: user.id });
      if (updated.length === 0) throw new AppError('RESOURCE_NOT_FOUND');
    });
    await this.record('USER_UPDATED', id, Object.keys(changes).join(','));
    return this.get(id);
  }

  async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<ManagedUser> {
    this.refuseOwnAccount(id);
    await withCurrentTenant(this.db, async (tx) => {
      const target = await this.get(id);
      if (status === 'INACTIVE' && target.roles.includes('ISSUER_ADMIN'))
        await this.keepOneAdministrator(tx, id);
      await tx.update(user).set({ status, updatedAt: new Date() }).where(eq(user.id, id));
    });
    if (status === 'INACTIVE') await this.identities.revokeSessionsOfUser(id);
    await this.record(status === 'ACTIVE' ? 'USER_REACTIVATED' : 'USER_DEACTIVATED', id);
    return this.get(id);
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
    const before = (await this.get(id)).roles;
    await withCurrentTenant(this.db, async (tx, tenantId) => {
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
    });
    await this.identities.revokeSessionsOfUser(id);
    await this.record('USER_ROLES_CHANGED', id, `${before.join(',')} -> ${wanted.join(',')}`);
    return this.get(id);
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

  private record(action: string, userId: string, reason?: string): Promise<void> {
    const actor = currentUser();
    return this.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorRole: actor.roles.join(','),
      action,
      resourceType: 'user',
      resourceId: userId,
      result: 'SUCCESS',
      reason,
    });
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
