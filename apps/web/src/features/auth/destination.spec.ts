import { describe, expect, it } from 'vitest';
import { safeNextPath } from './destination';

describe('safeNextPath', () => {
  it('keeps a path of this site', () => {
    expect(safeNextPath('/issuer/registry')).toBe('/issuer/registry');
  });

  it.each([null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'issuer'])(
    'refuses %j',
    (next) => {
      expect(safeNextPath(next)).toBeNull();
    },
  );
});
