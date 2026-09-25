import { createHash } from 'node:crypto';
export function deterministicUuid(name) {
  const hex = createHash('sha256').update(`virtus-assets:${name}`).digest('hex').slice(0, 32);
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
//# sourceMappingURL=deterministic-id.js.map
