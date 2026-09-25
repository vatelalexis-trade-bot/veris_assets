import { SENSITIVE_KEYS } from '../logging/redaction.js';

/** Replaces a sensitive value in the audit log: the reader sees that the field changed, not its value. */
export const MASKED = '[MASKED]';

/**
 * A field is sensitive when its name contains one of the common keys, whatever the prefix or case:
 * `email` also covers `contactEmail`, `phone` covers `mobilePhone`, `address` covers `postalAddress`.
 */
const SENSITIVE_FRAGMENTS = SENSITIVE_KEYS.map((key) => key.toLowerCase());
const isSensitive = (key: string) => SENSITIVE_FRAGMENTS.some((fragment) => key.includes(fragment));
const MAX_DEPTH = 6;

/**
 * Copy of `value` where the sensitive fields (SPEC §17.2, §8.5) are masked at any depth: those
 * whose name contains a key of the common list of the logs, plus `personalKeys` given by the
 * caller (e.g. `name` for a person).
 */
export function maskSensitive(value: unknown, personalKeys: readonly string[] = []): unknown {
  const extra = new Set(personalKeys.map((key) => key.toLowerCase()));
  const mask = (current: unknown, depth: number): unknown => {
    if (current === null || typeof current !== 'object') return current;
    if (current instanceof Date) return current.toISOString();
    if (depth >= MAX_DEPTH) return MASKED;
    if (Array.isArray(current)) return current.map((item) => mask(item, depth + 1));
    return Object.fromEntries(
      Object.entries(current).map(([key, item]) => {
        const lower = key.toLowerCase();
        const sensitive = isSensitive(lower) || extra.has(lower);
        return [
          key,
          sensitive && item !== null && item !== undefined ? MASKED : mask(item, depth + 1),
        ];
      }),
    );
  };
  return mask(value, 0);
}
