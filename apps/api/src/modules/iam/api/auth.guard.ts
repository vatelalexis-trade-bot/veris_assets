import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../../../core/errors/app-error.js';
import { ALLOW_PENDING_MFA, IS_PUBLIC } from '../../../core/security/public.decorator.js';
import { AuthenticationService } from '../application/authentication.service.js';
import { requestInfo, type AuthenticatedRequest } from './http.js';

/**
 * Applied to every route (deny by default, docs/ARCHITECTURE.md §4.4): a valid session is
 * required unless the route is marked @Public(). Users whose role requires two-factor
 * authentication can only reach @AllowPendingMfa() routes until they have set it up.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authentication: AuthenticationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = await this.authentication.resolveSession(requestInfo(request));
    if (!auth) throw new AppError('UNAUTHENTICATED');
    const pendingMfa = auth.mfaRequired && !auth.mfaEnabled;
    if (pendingMfa && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_MFA, targets)) {
      throw new AppError('MFA_ENROLLMENT_REQUIRED');
    }
    request.auth = auth;
    return true;
  }
}
