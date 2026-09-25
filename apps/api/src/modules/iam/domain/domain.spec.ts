import { describe, expect, it } from 'vitest';
import { afterFailedSignIn, isLocked, LOCK_DURATION_MS } from './lockout.js';
import { checkPassword } from './password-policy.js';
import { allowedPortals, homePortal, invitableRoles, requiresMfa } from './roles.js';
import { exceedsMaximumAge } from './session-policy.js';

const never = () => false;

describe('password policy', () => {
  it('accepts a long passphrase without complexity rules', () => {
    expect(checkPassword('correct horse battery staple', never)).toEqual([]);
  });

  it('refuses short, overlong and common passwords', () => {
    expect(checkPassword('short1!', never)).toEqual(['PASSWORD_TOO_SHORT']);
    expect(checkPassword('x'.repeat(129), never)).toEqual(['PASSWORD_TOO_LONG']);
    expect(checkPassword('qwerty123456', () => true)).toEqual(['PASSWORD_TOO_COMMON']);
  });

  it('counts characters, not bytes', () => {
    expect(checkPassword('éééééééééééé', never)).toEqual([]);
  });
});

describe('lockout', () => {
  const now = new Date('2026-09-25T10:00:00Z');

  it('locks the account for 15 minutes at the 5th consecutive failure', () => {
    expect(afterFailedSignIn(3, now)).toEqual({ failedLoginCount: 4, lockedUntil: null });
    const locked = afterFailedSignIn(4, now);
    expect(locked.lockedUntil?.getTime()).toBe(now.getTime() + LOCK_DURATION_MS);
    expect(isLocked(locked.lockedUntil, now)).toBe(true);
    expect(isLocked(locked.lockedUntil, new Date(now.getTime() + LOCK_DURATION_MS + 1))).toBe(
      false,
    );
  });
});

describe('roles', () => {
  it('requires MFA for administration and compliance roles only (SPEC §24)', () => {
    expect(requiresMfa(['ISSUER_ADMIN'])).toBe(true);
    expect(requiresMfa(['COMPLIANCE_OFFICER'])).toBe(true);
    expect(requiresMfa(['PLATFORM_ADMIN'])).toBe(true);
    expect(requiresMfa(['ISSUER_OPERATOR', 'AUDITOR', 'INVESTOR'])).toBe(false);
  });

  it('sends each user to the right portal', () => {
    expect(homePortal(['PLATFORM_ADMIN'])).toBe('platform');
    expect(homePortal(['INVESTOR'])).toBe('investor');
    expect(homePortal(['AUDITOR'])).toBe('issuer');
    expect(allowedPortals(['INVESTOR'])).toEqual(['investor']);
  });

  it('lets only administrators invite, within their scope', () => {
    expect(invitableRoles(['ISSUER_OPERATOR'])).toEqual([]);
    expect(invitableRoles(['ISSUER_ADMIN'])).not.toContain('PLATFORM_ADMIN');
    expect(invitableRoles(['PLATFORM_ADMIN'])).toEqual(['PLATFORM_ADMIN', 'ISSUER_ADMIN']);
  });
});

describe('session policy', () => {
  it('ends sessions after 12 hours whatever the activity', () => {
    const created = new Date('2026-09-25T00:00:00Z');
    expect(exceedsMaximumAge(created, new Date('2026-09-25T11:59:00Z'))).toBe(false);
    expect(exceedsMaximumAge(created, new Date('2026-09-25T12:01:00Z'))).toBe(true);
  });
});
