import { redirect } from '@/i18n/navigation';
import { getCurrentUser, type CurrentUser, type PortalName } from '@/lib/api/server';
import { PORTAL_PATHS } from './destination';

/**
 * Server-side guard of a portal layout (the API checks every call anyway): signed in, second
 * factor set up when the role requires it, and a role that may open this portal.
 */
export async function requirePortalAccess(
  portal: PortalName,
  locale: string,
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    return redirect({
      href: { pathname: '/login', query: { next: PORTAL_PATHS[portal] } },
      locale,
    });
  }
  if (user.mfa.required && !user.mfa.enabled) return redirect({ href: '/login/mfa-setup', locale });
  if (!user.portals.includes(portal))
    return redirect({ href: PORTAL_PATHS[user.homePortal], locale });
  return user;
}
