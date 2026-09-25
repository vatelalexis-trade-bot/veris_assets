import { getCurrentUser } from '@/lib/api/server';

/**
 * Permissions of the signed-in user for a page (the portal layout has already checked the
 * session). The API refuses the data anyway: this only decides what the page shows.
 */
export async function userPermissions(): Promise<Record<string, 'all' | 'own'>> {
  return (await getCurrentUser())?.permissions ?? {};
}
