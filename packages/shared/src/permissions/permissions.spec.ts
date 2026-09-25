import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PERMISSION_CODES,
  permissionsOf,
  ROLE_CODES,
  ROLE_PERMISSIONS,
  type Permission,
} from './permissions.js';

// Columns of the matrix in docs/DATA_MODEL.md §5, in order.
const DOC_ROLES = [
  'PLATFORM_ADMIN',
  'ISSUER_ADMIN',
  'ISSUER_OPERATOR',
  'COMPLIANCE_OFFICER',
  'AUDITOR',
  'INVESTOR',
] as const;

function documentedMatrix(): Map<string, string[]> {
  const doc = readFileSync(new URL('../../../../docs/DATA_MODEL.md', import.meta.url), 'utf8');
  const rows = new Map<string, string[]>();
  for (const line of doc.split('\n')) {
    const match = /^\| `([a-z-]+:[a-z-]+)` \|[^|]*\|(.*)\|\s*$/.exec(line);
    if (match)
      rows.set(
        match[1]!,
        match[2]!.split('|').map((cell) => cell.trim()),
      );
  }
  return rows;
}

describe('role × permission matrix', () => {
  it('is exactly the one validated in docs/DATA_MODEL.md §5', () => {
    const documented = documentedMatrix();
    expect([...documented.keys()].sort()).toEqual([...PERMISSION_CODES].sort());
    for (const [permission, cells] of documented) {
      DOC_ROLES.forEach((role, index) => {
        const expected = cells[index] === '✓' ? 'all' : cells[index] === 'P' ? 'own' : undefined;
        expect(ROLE_PERMISSIONS[role][permission as Permission], `${role} × ${permission}`).toBe(
          expected,
        );
      });
    }
  });

  it('gives the platform administrator no business permission (SPEC §4.1)', () => {
    const business = Object.keys(ROLE_PERMISSIONS.PLATFORM_ADMIN).filter(
      (permission) =>
        !/^(tenant|platform-settings|platform-metrics|notification-template|reference-data|break-glass|notification):/.test(
          permission,
        ),
    );
    expect(business).toEqual([]);
  });

  it('keeps the auditor read-only (SPEC §4.6)', () => {
    const writes = Object.keys(ROLE_PERMISSIONS.AUDITOR).filter(
      (permission) => !permission.endsWith(':read') && permission !== 'report:export',
    );
    expect(writes).toEqual([]);
  });

  it('limits the investor to its own data (SPEC §14.3)', () => {
    const scopes = Object.entries(ROLE_PERMISSIONS.INVESTOR).filter(
      ([permission]) => permission !== 'notification:read',
    );
    expect(scopes.every(([, scope]) => scope === 'own')).toBe(true);
  });

  it('keeps the broadest scope when roles are combined', () => {
    expect(permissionsOf(['INVESTOR', 'AUDITOR']).get('registry:read')).toBe('all');
    expect(permissionsOf(['INVESTOR']).get('registry:read')).toBe('own');
  });

  it('declares every role', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLE_CODES].sort());
  });
});
