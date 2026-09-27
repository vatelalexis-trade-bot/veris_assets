import { createHash } from 'node:crypto';

/**
 * Stable identifier derived from a name: the same name gives the same UUID at every reset, so the
 * demonstration data is deterministic (SPEC §28). Format: UUID version 8 (RFC 9562, custom).
 */
export function deterministicUuid(name: string): string {
  const hex = createHash('sha256').update(`veris-assets:${name}`).digest('hex').slice(0, 32);
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  const digits = `${hex.slice(0, 12)}8${hex.slice(13, 16)}${variant}${hex.slice(17)}`;
  return [
    digits.slice(0, 8),
    digits.slice(8, 12),
    digits.slice(12, 16),
    digits.slice(16, 20),
    digits.slice(20),
  ].join('-');
}
