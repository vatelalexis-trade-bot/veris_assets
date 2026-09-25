'use client';

import { useCallback } from 'react';
import { api } from '@/lib/api/client';
import { useRouter } from '@/i18n/navigation';
import { PORTAL_PATHS, safeNextPath } from './destination';

/**
 * Where to go once the session exists: MFA set-up when the role requires it and it is missing,
 * otherwise the requested page or the user's own portal.
 */
export function useAfterSignIn() {
  const router = useRouter();
  return useCallback(
    async (next?: string | null) => {
      const { data } = await api.GET('/api/v1/auth/me');
      if (!data) {
        router.replace('/login');
        return;
      }
      if (data.mfa.required && !data.mfa.enabled) {
        router.replace('/login/mfa-setup');
        return;
      }
      router.replace(safeNextPath(next) ?? PORTAL_PATHS[data.homePortal]);
      router.refresh();
    },
    [router],
  );
}
