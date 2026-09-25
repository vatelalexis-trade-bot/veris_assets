import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { ENV, type Env } from '../../../core/config/env.js';
import { DATABASE, type Database, withTenantTransaction } from '../../../core/database/database.js';
import { EMAIL_PROVIDER, type EmailProvider } from '../../../core/email/email.provider.js';
import { AppError } from '../../../core/errors/app-error.js';
import { RateLimiter, type RateLimit } from '../../../core/security/rate-limiter.js';
import { invitableRoles, type RoleCode } from '../domain/roles.js';
import { invitationEmail, LOCALE_PATH, type EmailLocale } from '../infrastructure/emails.js';
import { IdentityRepository } from '../infrastructure/identity.repository.js';
import { hashPassword } from '../infrastructure/password-hashing.js';
import { role, tenant, userInvitation } from '../infrastructure/schema.js';
import {
  AuthenticationService,
  passwordRuleDetails,
  type AuthContext,
  type AuthOutcome,
  type RequestInfo,
} from './authentication.service.js';

const INVITATION_VALIDITY_DAYS = 7;
const ACCEPT_PER_IP: RateLimit = {
  name: 'invitation-accept-ip',
  limit: 10,
  windowSeconds: 15 * 60,
};

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface InvitationRequest {
  email: string;
  name: string;
  roleCode: RoleCode;
  locale: EmailLocale;
  /** Only read for platform administrators inviting the first administrator of a tenant (SPEC §6.1). */
  tenantId?: string;
}

/** User invitations (SPEC §6.1). Phase 6 replaces the role checks by permissions. */
@Injectable()
export class InvitationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly identities: IdentityRepository,
    private readonly authentication: AuthenticationService,
    private readonly audit: AuditWriter,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async invite(
    inviter: AuthContext,
    request: InvitationRequest,
  ): Promise<{ id: string; expiresAt: Date }> {
    if (!invitableRoles(inviter.roles).includes(request.roleCode))
      throw new AppError('PERMISSION_DENIED');
    // The tenant always comes from the inviter's session, except for the platform administrator
    // creating a tenant's first administrator (SPEC §20: never trust a tenant sent by the client).
    const tenantId = inviter.roles.includes('PLATFORM_ADMIN')
      ? request.roleCode === 'PLATFORM_ADMIN'
        ? null
        : (request.tenantId ?? null)
      : inviter.tenantId;
    if (request.roleCode !== 'PLATFORM_ADMIN' && tenantId === null) {
      throw new AppError('VALIDATION_FAILED', [{ code: 'TENANT_REQUIRED', field: 'tenantId' }]);
    }
    const email = request.email.trim().toLowerCase();
    if (await this.identities.findUserByEmail(email)) {
      throw new AppError('VALIDATION_FAILED', [
        { code: 'EMAIL_ALREADY_REGISTERED', field: 'email' },
      ]);
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    const insert = async (executor: Pick<Database, 'select' | 'insert'>) => {
      const [roleRow] = await executor
        .select({ id: role.id })
        .from(role)
        .where(eq(role.code, request.roleCode));
      const [created] = await executor
        .insert(userInvitation)
        .values({
          tenantId,
          email,
          name: request.name,
          roleId: roleRow!.id,
          tokenHash: hashInvitationToken(token),
          expiresAt,
          invitedBy: inviter.userId,
        })
        .returning({ id: userInvitation.id });
      return created!.id;
    };
    let id: string;
    try {
      id = tenantId
        ? await withTenantTransaction(this.db, tenantId, insert)
        : await insert(this.db);
    } catch (error) {
      // Unknown tenant: the foreign key refuses the invitation.
      if ((error as { cause?: { code?: string } }).cause?.code === '23503') {
        throw new AppError('VALIDATION_FAILED', [{ code: 'TENANT_UNKNOWN', field: 'tenantId' }]);
      }
      throw error;
    }

    const url = `${this.env.WEB_ORIGIN}/${LOCALE_PATH[request.locale]}/invitation/${token}`;
    await this.email.send(
      invitationEmail(request.locale, {
        to: email,
        name: request.name,
        url,
        validDays: INVITATION_VALIDITY_DAYS,
      }),
    );
    await this.audit.record({
      tenantId,
      actorUserId: inviter.userId,
      actorRole: inviter.roles.join(','),
      action: 'USER_INVITED',
      resourceType: 'user_invitation',
      resourceId: id,
      result: 'SUCCESS',
      reason: request.roleCode,
    });
    return { id, expiresAt };
  }

  /** What the invitation page shows before the invitee chooses a password. */
  async preview(token: string) {
    const invitation = await this.identities.findPendingInvitation(
      hashInvitationToken(token),
      new Date(),
    );
    if (!invitation) throw new AppError('INVITATION_INVALID_OR_EXPIRED');
    let tenantName: string | null = null;
    if (invitation.tenantId) {
      const [found] = await withTenantTransaction(this.db, invitation.tenantId, (tx) =>
        tx.select({ legalName: tenant.legalName }).from(tenant),
      );
      tenantName = found?.legalName ?? null;
    }
    return {
      email: invitation.email,
      name: invitation.name,
      roleCode: invitation.roleCode,
      tenantName,
      expiresAt: invitation.expiresAt,
    };
  }

  /** Creates the account, then signs the new user in (MFA set-up follows when the role needs it). */
  async accept(
    token: string,
    password: string,
    request: RequestInfo,
  ): Promise<AuthOutcome<{ status: 'SIGNED_IN' | 'MFA_REQUIRED' }>> {
    await this.rateLimiter.consume(ACCEPT_PER_IP, request.ip ?? 'unknown');
    const now = new Date();
    const invitation = await this.identities.findPendingInvitation(hashInvitationToken(token), now);
    if (!invitation) throw new AppError('INVITATION_INVALID_OR_EXPIRED');
    const problems = passwordRuleDetails(password);
    if (problems.length > 0) throw new AppError('PASSWORD_TOO_WEAK', problems);
    if (await this.identities.findUserByEmail(invitation.email)) {
      throw new AppError('INVITATION_INVALID_OR_EXPIRED');
    }
    let userId: string;
    try {
      userId = await this.identities.createUserFromInvitation(
        invitation,
        await hashPassword(password),
        now,
      );
    } catch {
      throw new AppError('INVITATION_INVALID_OR_EXPIRED');
    }
    await this.audit.record({
      tenantId: invitation.tenantId,
      actorUserId: userId,
      action: 'USER_INVITATION_ACCEPTED',
      resourceType: 'user_invitation',
      resourceId: invitation.id,
      result: 'SUCCESS',
      ipAddress: request.ip,
      userAgent: request.userAgent,
    });
    return this.authentication.signIn(invitation.email, password, request);
  }
}
