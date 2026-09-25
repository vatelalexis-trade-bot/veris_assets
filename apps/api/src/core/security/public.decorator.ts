import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@virtus/shared';

// Access rules of the routes (docs/ARCHITECTURE.md §4.4). Every route declares exactly one:
// @Public(), @SessionOnly(), @AllowPendingMfa() or @RequirePermission(). A route that declares
// none is refused (deny by default) and a test lists such routes.

export const IS_PUBLIC = 'virtus:isPublic';
export const ALLOW_PENDING_MFA = 'virtus:allowPendingMfa';
export const SESSION_ONLY = 'virtus:sessionOnly';
export const REQUIRED_PERMISSION = 'virtus:requiredPermission';
export const ACCEPTS_TENANT_PARAMETER = 'virtus:acceptsTenantParameter';

/** The route is reachable without a session (sign-in, health probes…). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * A session is enough, even when two-factor authentication still has to be set up
 * (enrolment, sign-out, current user).
 */
export const AllowPendingMfa = () => SetMetadata(ALLOW_PENDING_MFA, true);

/** A session is enough (the route only concerns the signed-in user). */
export const SessionOnly = () => SetMetadata(SESSION_ONLY, true);

/** The signed-in user needs this permission of the role × permission matrix (SPEC §4.7). */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION, permission);

/**
 * Platform routes where a tenant identifier in the request is a legitimate parameter (for example
 * the first administrator of a tenant). Everywhere else it is refused (SPEC §20, scenario 5).
 */
export const AcceptsTenantParameter = () => SetMetadata(ACCEPTS_TENANT_PARAMETER, true);
