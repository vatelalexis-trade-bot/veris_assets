import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { Permission, PermissionScope } from '@veris/shared';
import type { RoleCode } from '../domain/roles.js';
import { AUTH_DATABASE, type AuthDatabase } from './auth-database.js';
import {
  account,
  role,
  rolePermission,
  session,
  tenant,
  twoFactor,
  user,
  userInvitation,
  userRole,
} from './schema.js';

export interface IdentityUser {
  id: string;
  email: string;
  name: string;
  tenantId: string | null;
  /** Investor profile of an Investor account (portal), null otherwise. */
  investorId: string | null;
  status: string;
  locale: string;
  twoFactorEnabled: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  /** False when the user's tenant is deactivated: no sign-in, no session. */
  tenantActive: boolean;
}

export interface PendingInvitation {
  id: string;
  tenantId: string | null;
  email: string;
  name: string;
  roleCode: RoleCode;
  expiresAt: Date;
}

const userColumns = {
  id: user.id,
  email: user.email,
  name: user.name,
  tenantId: user.tenantId,
  investorId: user.investorId,
  status: user.status,
  locale: user.locale,
  twoFactorEnabled: user.twoFactorEnabled,
  failedLoginCount: user.failedLoginCount,
  lockedUntil: user.lockedUntil,
  tenantStatus: tenant.status,
};

type UserRow = Omit<IdentityUser, 'tenantActive'> & { tenantStatus: string | null };

function toIdentity({ tenantStatus, ...row }: UserRow): IdentityUser {
  return { ...row, tenantActive: row.tenantId === null || tenantStatus === 'ACTIVE' };
}

/**
 * Identity data read and written by the authentication component, with the va_auth role
 * (decision D-030): it may see users of every tenant, because the tenant is not known yet.
 */
@Injectable()
export class IdentityRepository {
  constructor(@Inject(AUTH_DATABASE) private readonly db: AuthDatabase) {}

  async findUserByEmail(email: string): Promise<IdentityUser | undefined> {
    const [found] = await this.db
      .select(userColumns)
      .from(user)
      .leftJoin(tenant, eq(tenant.id, user.tenantId))
      .where(eq(user.email, email.toLowerCase()));
    return found && toIdentity(found);
  }

  async findUserById(id: string): Promise<IdentityUser | undefined> {
    const [found] = await this.db
      .select(userColumns)
      .from(user)
      .leftJoin(tenant, eq(tenant.id, user.tenantId))
      .where(eq(user.id, id));
    return found && toIdentity(found);
  }

  /** Ends every session of a user (deactivation, change of roles: decision D-003). */
  async revokeSessionsOfUser(userId: string): Promise<void> {
    await this.db.delete(session).where(eq(session.userId, userId));
  }

  /** Ends every session of a tenant's users (tenant deactivation). */
  async revokeSessionsOfTenant(tenantId: string): Promise<void> {
    const users = this.db.select({ id: user.id }).from(user).where(eq(user.tenantId, tenantId));
    await this.db.delete(session).where(inArray(session.userId, users));
  }

  async rolesOf(userId: string): Promise<RoleCode[]> {
    const rows = await this.db
      .select({ code: role.code })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(eq(userRole.userId, userId));
    return rows.map((row) => row.code as RoleCode);
  }

  /** Permissions granted by the user's roles, read from the database (SPEC §4.7). */
  async permissionsOf(userId: string): Promise<Map<Permission, PermissionScope>> {
    const rows = await this.db
      .select({ code: rolePermission.permissionCode, scope: rolePermission.scope })
      .from(userRole)
      .innerJoin(rolePermission, eq(rolePermission.roleId, userRole.roleId))
      .where(eq(userRole.userId, userId));
    const granted = new Map<Permission, PermissionScope>();
    for (const row of rows) {
      if (granted.get(row.code as Permission) !== 'all') {
        granted.set(row.code as Permission, row.scope as PermissionScope);
      }
    }
    return granted;
  }

  async saveSignInFailure(
    userId: string,
    state: { failedLoginCount: number; lockedUntil: Date | null },
  ) {
    await this.db.update(user).set(state).where(eq(user.id, userId));
  }

  async saveSignInSuccess(userId: string, now: Date): Promise<void> {
    await this.db
      .update(user)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now })
      .where(eq(user.id, userId));
  }

  /** Encrypted TOTP secret, used only by the demonstration login page (decision D-016). */
  async findEncryptedTotpSecret(userId: string): Promise<string | undefined> {
    const [found] = await this.db
      .select({ secret: twoFactor.secret })
      .from(twoFactor)
      .where(and(eq(twoFactor.userId, userId), eq(twoFactor.verified, true)));
    return found?.secret;
  }

  /** An invitation that is neither accepted nor expired. */
  async findPendingInvitation(
    tokenHash: string,
    now: Date,
  ): Promise<PendingInvitation | undefined> {
    const [found] = await this.db
      .select({
        id: userInvitation.id,
        tenantId: userInvitation.tenantId,
        email: userInvitation.email,
        name: userInvitation.name,
        roleCode: role.code,
        expiresAt: userInvitation.expiresAt,
      })
      .from(userInvitation)
      .innerJoin(role, eq(role.id, userInvitation.roleId))
      .where(
        and(
          eq(userInvitation.tokenHash, tokenHash),
          isNull(userInvitation.acceptedAt),
          gt(userInvitation.expiresAt, now),
        ),
      );
    return found ? { ...found, roleCode: found.roleCode as RoleCode } : undefined;
  }

  /**
   * Creates the user, the password credential (same format as Better Auth: provider "credential",
   * account id = user id) and the role, and closes the invitation — all or nothing.
   */
  async createUserFromInvitation(
    invitation: PendingInvitation,
    passwordHash: string,
    now: Date,
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(user)
        .values({ name: invitation.name, email: invitation.email, tenantId: invitation.tenantId })
        .returning({ id: user.id });
      const userId = created!.id;
      await tx
        .insert(account)
        .values({ accountId: userId, providerId: 'credential', userId, password: passwordHash });
      const [roleRow] = await tx
        .select({ id: role.id })
        .from(role)
        .where(eq(role.code, invitation.roleCode));
      await tx
        .insert(userRole)
        .values({ userId, roleId: roleRow!.id, tenantId: invitation.tenantId });
      const closed = await tx
        .update(userInvitation)
        .set({ acceptedAt: now })
        .where(and(eq(userInvitation.id, invitation.id), isNull(userInvitation.acceptedAt)))
        .returning({ id: userInvitation.id });
      // Two simultaneous acceptances: only one may succeed.
      if (closed.length === 0) throw new Error('Invitation already accepted');
      return userId;
    });
  }
}
