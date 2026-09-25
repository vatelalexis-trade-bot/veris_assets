import { PERMISSION_CODES, ROLE_PERMISSIONS } from '@virtus/shared';
import { describe, expect, it } from 'vitest';
import { PORTALS, visibleItems } from './portals';

describe('portal menus', () => {
  it('only use permissions of the catalogue', () => {
    for (const portal of Object.values(PORTALS)) {
      for (const item of portal.items)
        expect(PERMISSION_CODES, `${portal.id}.${item.section}`).toContain(item.permission);
    }
  });

  it('show the auditor a read-only issuer menu without the "To do" queue', () => {
    const auditor = Object.keys(ROLE_PERMISSIONS.AUDITOR);
    const sections = visibleItems(PORTALS.issuer, auditor).map((item) => item.section);
    expect(sections).toContain('audit');
    expect(sections).not.toContain('tasks');
  });

  it('show every issuer entry to the Issuer Administrator', () => {
    const admin = Object.keys(ROLE_PERMISSIONS.ISSUER_ADMIN);
    expect(visibleItems(PORTALS.issuer, admin)).toHaveLength(PORTALS.issuer.items.length);
  });

  it('give each role at least one entry of its home portal', () => {
    expect(
      visibleItems(PORTALS.investor, Object.keys(ROLE_PERMISSIONS.INVESTOR)).length,
    ).toBeGreaterThan(0);
    expect(
      visibleItems(PORTALS.platform, Object.keys(ROLE_PERMISSIONS.PLATFORM_ADMIN)).length,
    ).toBeGreaterThan(0);
    for (const role of ['ISSUER_OPERATOR', 'COMPLIANCE_OFFICER', 'AUDITOR'] as const) {
      expect(
        visibleItems(PORTALS.issuer, Object.keys(ROLE_PERMISSIONS[role])).length,
        role,
      ).toBeGreaterThan(0);
    }
  });
});
