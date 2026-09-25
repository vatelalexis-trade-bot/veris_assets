import { Inject, Injectable } from '@nestjs/common';
import type { ErrorDetail } from '@virtus/shared';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { AppError } from '../../../core/errors/app-error.js';
import { RateLimiter, type RateLimit } from '../../../core/security/rate-limiter.js';
import { afterFailedSignIn, isLocked } from '../domain/lockout.js';
import { checkPassword } from '../domain/password-policy.js';
import {
  allowedPortals,
  homePortal,
  requiresMfa,
  type Portal,
  type RoleCode,
} from '../domain/roles.js';
import { exceedsMaximumAge } from '../domain/session-policy.js';
import { BETTER_AUTH, type BetterAuth } from '../infrastructure/better-auth.js';
import { isCommonPassword } from '../infrastructure/common-passwords.js';
import { IdentityRepository } from '../infrastructure/identity.repository.js';

/** What the API knows about the caller of a request, from the session cookie. */
export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  tenantId: string | null;
  locale: string;
  roles: RoleCode[];
  mfaEnabled: boolean;
  mfaRequired: boolean;
  homePortal: Portal;
  portals: Portal[];
  sessionExpiresAt: Date;
}

/** Request data passed to Better Auth: cookies, client address and user agent. */
export interface RequestInfo {
  headers: Headers;
  ip: string | null;
  userAgent: string | null;
}

export interface AuthOutcome<T = undefined> {
  /** Set-Cookie headers produced by Better Auth, to be sent to the browser. */
  cookies: string[];
  result: T;
}

const SIGN_IN_PER_IP: RateLimit = { name: 'sign-in-ip', limit: 30, windowSeconds: 15 * 60 };
const SIGN_IN_PER_ACCOUNT: RateLimit = {
  name: 'sign-in-account',
  limit: 10,
  windowSeconds: 15 * 60,
};
const SECOND_FACTOR_PER_IP: RateLimit = {
  name: 'second-factor-ip',
  limit: 15,
  windowSeconds: 5 * 60,
};
const PASSWORD_RESET_PER_IP: RateLimit = {
  name: 'password-reset-ip',
  limit: 5,
  windowSeconds: 15 * 60,
};

function betterAuthErrorCode(error: unknown): string | undefined {
  const body = (error as { body?: { code?: unknown } } | null)?.body;
  return typeof body?.code === 'string' ? body.code : undefined;
}

export function passwordRuleDetails(password: string): ErrorDetail[] {
  return checkPassword(password, isCommonPassword).map((code) => ({ code, field: 'password' }));
}

@Injectable()
export class AuthenticationService {
  constructor(
    @Inject(BETTER_AUTH) private readonly auth: BetterAuth,
    private readonly identities: IdentityRepository,
    private readonly audit: AuditWriter,
    private readonly rateLimiter: RateLimiter,
  ) {}

  /** Email + password. Answers MFA_REQUIRED when a second factor must follow. */
  async signIn(
    email: string,
    password: string,
    request: RequestInfo,
  ): Promise<AuthOutcome<{ status: 'SIGNED_IN' | 'MFA_REQUIRED' }>> {
    const normalizedEmail = email.trim().toLowerCase();
    await this.rateLimiter.consume(SIGN_IN_PER_IP, request.ip ?? 'unknown');
    await this.rateLimiter.consume(SIGN_IN_PER_ACCOUNT, normalizedEmail);

    const now = new Date();
    const identity = await this.identities.findUserByEmail(normalizedEmail);
    const auditBase = {
      tenantId: identity?.tenantId ?? null,
      actorUserId: identity?.id ?? null,
      action: 'AUTH_SIGN_IN',
      resourceType: 'user',
      resourceId: identity?.id ?? null,
      ipAddress: request.ip,
      userAgent: request.userAgent,
    };

    if (identity && isLocked(identity.lockedUntil, now)) {
      await this.audit.record({ ...auditBase, result: 'DENIED', reason: 'ACCOUNT_LOCKED' });
      throw new AppError('ACCOUNT_LOCKED');
    }

    let signIn: { headers: Headers; response: { twoFactorRedirect?: boolean } };
    try {
      signIn = (await this.auth.api.signInEmail({
        body: { email: normalizedEmail, password, rememberMe: false },
        headers: request.headers,
        returnHeaders: true,
      })) as { headers: Headers; response: { twoFactorRedirect?: boolean } };
    } catch (error) {
      if (betterAuthErrorCode(error) !== 'INVALID_EMAIL_OR_PASSWORD') throw error;
      if (identity) {
        const state = afterFailedSignIn(identity.failedLoginCount, now);
        await this.identities.saveSignInFailure(identity.id, state);
        await this.audit.record({
          ...auditBase,
          result: 'FAILED',
          reason: state.lockedUntil ? 'INVALID_CREDENTIALS_ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
        });
      } else {
        await this.audit.record({ ...auditBase, result: 'FAILED', reason: 'UNKNOWN_ACCOUNT' });
      }
      throw new AppError('INVALID_CREDENTIALS');
    }

    const cookies = signIn.headers.getSetCookie();
    if (identity?.status !== 'ACTIVE') {
      await this.auth.api
        .signOut({ headers: withCookies(request.headers, cookies) })
        .catch(() => undefined);
      await this.audit.record({ ...auditBase, result: 'DENIED', reason: 'ACCOUNT_INACTIVE' });
      throw new AppError('ACCOUNT_INACTIVE');
    }
    await this.identities.saveSignInSuccess(identity.id, now);
    const status = signIn.response.twoFactorRedirect ? 'MFA_REQUIRED' : 'SIGNED_IN';
    await this.audit.record({
      ...auditBase,
      result: 'SUCCESS',
      reason: status === 'MFA_REQUIRED' ? 'PASSWORD_VERIFIED_SECOND_FACTOR_PENDING' : undefined,
    });
    return { cookies, result: { status } };
  }

  /** Second step of sign-in: authenticator code or single-use backup code. */
  async verifySecondFactor(
    code: string,
    method: 'totp' | 'backup',
    request: RequestInfo,
  ): Promise<AuthOutcome<{ status: 'SIGNED_IN' }>> {
    await this.rateLimiter.consume(SECOND_FACTOR_PER_IP, request.ip ?? 'unknown');
    let verified: { headers: Headers; response: { user: { id: string } } };
    try {
      const call =
        method === 'totp'
          ? this.auth.api.verifyTOTP({
              body: { code },
              headers: request.headers,
              returnHeaders: true,
            })
          : this.auth.api.verifyBackupCode({
              body: { code },
              headers: request.headers,
              returnHeaders: true,
            });
      verified = await call;
    } catch (error) {
      const failure = betterAuthErrorCode(error);
      await this.audit.record({
        tenantId: null,
        actorUserId: null,
        action: 'AUTH_SECOND_FACTOR',
        result: 'FAILED',
        reason: failure ?? 'UNKNOWN',
        ipAddress: request.ip,
        userAgent: request.userAgent,
      });
      if (failure === 'INVALID_CODE' || failure === 'INVALID_BACKUP_CODE')
        throw new AppError('MFA_INVALID_CODE');
      // The temporary second-factor cookie is missing or expired: sign in again.
      throw new AppError('SESSION_EXPIRED');
    }
    const identity = await this.identities.findUserById(verified.response.user.id);
    await this.audit.record({
      tenantId: identity?.tenantId ?? null,
      actorUserId: identity?.id ?? null,
      action: 'AUTH_SECOND_FACTOR',
      resourceType: 'user',
      resourceId: identity?.id ?? null,
      result: 'SUCCESS',
      reason: method === 'backup' ? 'BACKUP_CODE_USED' : undefined,
      ipAddress: request.ip,
      userAgent: request.userAgent,
    });
    return { cookies: verified.headers.getSetCookie(), result: { status: 'SIGNED_IN' } };
  }

  /** Reads the session cookie. Null when there is no valid session. */
  async resolveSession(request: RequestInfo): Promise<AuthContext | null> {
    const found = await this.auth.api.getSession({ headers: request.headers });
    if (!found) return null;
    if (exceedsMaximumAge(new Date(found.session.createdAt), new Date())) {
      await this.auth.api.signOut({ headers: request.headers }).catch(() => undefined);
      return null;
    }
    const identity = await this.identities.findUserById(found.user.id);
    if (!identity || identity.status !== 'ACTIVE') return null;
    const roles = await this.identities.rolesOf(identity.id);
    return {
      userId: identity.id,
      email: identity.email,
      name: identity.name,
      tenantId: identity.tenantId,
      locale: identity.locale,
      roles,
      mfaEnabled: identity.twoFactorEnabled,
      mfaRequired: requiresMfa(roles),
      homePortal: homePortal(roles),
      portals: allowedPortals(roles),
      sessionExpiresAt: new Date(found.session.expiresAt),
    };
  }

  async signOut(auth: AuthContext, request: RequestInfo): Promise<AuthOutcome> {
    const result = (await this.auth.api.signOut({
      headers: request.headers,
      returnHeaders: true,
    })) as {
      headers: Headers;
    };
    await this.audit.record({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: 'AUTH_SIGN_OUT',
      resourceType: 'user',
      resourceId: auth.userId,
      result: 'SUCCESS',
      ipAddress: request.ip,
      userAgent: request.userAgent,
    });
    return { cookies: result.headers.getSetCookie(), result: undefined };
  }

  /** First step of MFA set-up: checks the password and returns the secret and backup codes. */
  async startMfaEnrollment(
    password: string,
    request: RequestInfo,
  ): Promise<{ totpUri: string; secretKey: string; backupCodes: string[] }> {
    try {
      const enabled = await this.auth.api.enableTwoFactor({
        body: { password, method: 'totp' },
        headers: request.headers,
      });
      if (enabled.method !== 'totp') throw new Error('Unexpected two-factor method');
      const secretKey = new URL(enabled.totpURI).searchParams.get('secret') ?? '';
      return { totpUri: enabled.totpURI, secretKey, backupCodes: enabled.backupCodes };
    } catch (error) {
      if (betterAuthErrorCode(error) === 'INVALID_PASSWORD')
        throw new AppError('INVALID_CREDENTIALS');
      throw error;
    }
  }

  /** Second step of MFA set-up: a first valid code activates two-factor authentication. */
  async confirmMfaEnrollment(
    auth: AuthContext,
    code: string,
    request: RequestInfo,
  ): Promise<AuthOutcome> {
    let verified: { headers: Headers };
    try {
      verified = await this.auth.api.verifyTOTP({
        body: { code },
        headers: request.headers,
        returnHeaders: true,
      });
    } catch (error) {
      if (betterAuthErrorCode(error) === 'INVALID_CODE') throw new AppError('MFA_INVALID_CODE');
      throw error;
    }
    await this.audit.record({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: 'AUTH_MFA_ENABLED',
      resourceType: 'user',
      resourceId: auth.userId,
      result: 'SUCCESS',
      ipAddress: request.ip,
      userAgent: request.userAgent,
    });
    return { cookies: verified.headers.getSetCookie(), result: undefined };
  }

  /** Always succeeds, so that the answer never reveals whether an account exists. */
  async requestPasswordReset(email: string, request: RequestInfo): Promise<void> {
    await this.rateLimiter.consume(PASSWORD_RESET_PER_IP, request.ip ?? 'unknown');
    const normalizedEmail = email.trim().toLowerCase();
    const identity = await this.identities.findUserByEmail(normalizedEmail);
    if (!identity || identity.status !== 'ACTIVE') return;
    await this.auth.api.requestPasswordReset({ body: { email: normalizedEmail } });
    await this.audit.record({
      tenantId: identity.tenantId,
      actorUserId: identity.id,
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      resourceType: 'user',
      resourceId: identity.id,
      result: 'SUCCESS',
      ipAddress: request.ip,
      userAgent: request.userAgent,
    });
  }

  async resetPassword(token: string, newPassword: string, request: RequestInfo): Promise<void> {
    await this.rateLimiter.consume(PASSWORD_RESET_PER_IP, request.ip ?? 'unknown');
    const problems = passwordRuleDetails(newPassword);
    if (problems.length > 0) throw new AppError('PASSWORD_TOO_WEAK', problems);
    try {
      await this.auth.api.resetPassword({ body: { token, newPassword } });
    } catch (error) {
      if (betterAuthErrorCode(error) === 'INVALID_TOKEN')
        throw new AppError('RESET_TOKEN_INVALID_OR_EXPIRED');
      throw error;
    }
    await this.audit.record({
      tenantId: null,
      actorUserId: null,
      action: 'AUTH_PASSWORD_RESET',
      result: 'SUCCESS',
      ipAddress: request.ip,
      userAgent: request.userAgent,
    });
  }
}

/** Adds freshly issued cookies to the incoming headers (to act on the new session at once). */
export function withCookies(headers: Headers, setCookies: string[]): Headers {
  const updated = new Headers(headers);
  const fresh = setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
  const existing = headers.get('cookie');
  updated.set('cookie', existing ? `${existing}; ${fresh}` : fresh);
  return updated;
}
