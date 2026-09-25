import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'virtus:isPublic';
export const ALLOW_PENDING_MFA = 'virtus:allowPendingMfa';

/** The route is reachable without a session (sign-in, health probes…). Everything else is not. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * The route stays reachable by a signed-in user who must still set up two-factor authentication
 * (enrolment, sign-out, current user).
 */
export const AllowPendingMfa = () => SetMetadata(ALLOW_PENDING_MFA, true);
