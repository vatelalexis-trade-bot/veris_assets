import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@virtus/shared';
import { setRequestUser } from '../../../core/context/request-context.js';
import { AppError } from '../../../core/errors/app-error.js';
import {
  ACCEPTS_TENANT_PARAMETER,
  ALLOW_PENDING_MFA,
  IS_PUBLIC,
  REQUIRED_PERMISSION,
  SESSION_ONLY,
} from '../../../core/security/public.decorator.js';
import { AuthenticationService, type AuthContext } from '../application/authentication.service.js';
import { requestInfo, type AuthenticatedRequest } from './http.js';

const TENANT_KEYS = ['tenantId', 'tenant_id'] as const;

/**
 * Applied to every route (deny by default, docs/ARCHITECTURE.md §4.4), in this order:
 * 1. @Public() routes are open;
 * 2. a valid session is required;
 * 3. users whose role requires two-factor authentication only reach @AllowPendingMfa() routes
 *    until they have set it up;
 * 4. a tenant identifier sent by the client is never trusted (SPEC §20): a different tenant gives
 *    404 and is audited; the user's own tenant is harmless and ignored (removed from the body;
 *    Express 5 re-parses the query string on every read, so query schemas ignore unknown keys);
 * 5. the route's permission must be granted by the user's roles; a route that declares no access
 *    rule is refused.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authentication: AuthenticationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const read = <T>(key: string) => this.reflector.getAllAndOverride<T>(key, targets);
    if (read<boolean>(IS_PUBLIC)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = await this.authentication.resolveSession(requestInfo(request));
    if (!auth) throw new AppError('UNAUTHENTICATED');
    request.auth = auth;
    setRequestUser({
      userId: auth.userId,
      tenantId: auth.tenantId,
      investorId: auth.investorId,
      roles: auth.roles,
      permissions: auth.permissions,
    });

    const allowPendingMfa = read<boolean>(ALLOW_PENDING_MFA);
    if (auth.mfaRequired && !auth.mfaEnabled && !allowPendingMfa) {
      throw new AppError('MFA_ENROLLMENT_REQUIRED');
    }

    if (!read<boolean>(ACCEPTS_TENANT_PARAMETER)) this.rejectForeignTenant(request, auth);

    const permission = read<Permission>(REQUIRED_PERMISSION);
    if (permission) {
      if (!auth.permissions.has(permission)) throw new AppError('PERMISSION_DENIED');
      return true;
    }
    if (allowPendingMfa || read<boolean>(SESSION_ONLY)) return true;
    this.logger.error(`Route without access rule refused: ${request.method} ${request.path}`);
    throw new AppError('PERMISSION_DENIED');
  }

  private rejectForeignTenant(request: AuthenticatedRequest, auth: AuthContext): void {
    const sources = [
      request.query as Record<string, unknown>,
      request.body as Record<string, unknown>,
    ];
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      for (const key of TENANT_KEYS) {
        if (!(key in source)) continue;
        if (source[key] === auth.tenantId) {
          delete source[key];
          continue;
        }
        // Audited by the exception filter, like every access denial.
        throw new AppError('RESOURCE_NOT_FOUND', [], { auditAction: 'TENANT_OVERRIDE_ATTEMPT' });
      }
    }
  }
}
