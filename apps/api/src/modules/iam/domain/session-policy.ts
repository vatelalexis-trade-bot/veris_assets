// Session lifetime (docs/ARCHITECTURE.md §4.12): 30 minutes of inactivity, 12 hours at most.
export const SESSION_IDLE_SECONDS = 30 * 60;
export const SESSION_REFRESH_SECONDS = 5 * 60;
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function exceedsMaximumAge(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() > SESSION_MAX_AGE_MS;
}
