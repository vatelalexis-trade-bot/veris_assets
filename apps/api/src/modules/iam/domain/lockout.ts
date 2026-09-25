// Temporary lock after repeated failed sign-ins (SPEC §24 "blocage après échecs").
export const MAX_FAILED_SIGN_INS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/** State after one more failed attempt: the 5th consecutive failure locks the account. */
export function afterFailedSignIn(
  failedCount: number,
  now: Date,
): { failedLoginCount: number; lockedUntil: Date | null } {
  const failedLoginCount = failedCount + 1;
  if (failedLoginCount >= MAX_FAILED_SIGN_INS) {
    return { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) };
  }
  return { failedLoginCount, lockedUntil: null };
}
