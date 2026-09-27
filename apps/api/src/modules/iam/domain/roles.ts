// Roles of SPEC §4; the role × permission matrix is in @veris/shared.

import type { RoleCode } from '@veris/shared';

export { ROLE_CODES, type RoleCode } from '@veris/shared';

/** Roles for which two-factor authentication is mandatory (SPEC §24, decision D-001). */
export const MFA_REQUIRED_ROLES: readonly RoleCode[] = [
  'PLATFORM_ADMIN',
  'ISSUER_ADMIN',
  'COMPLIANCE_OFFICER',
];

export function requiresMfa(roles: readonly RoleCode[]): boolean {
  return roles.some((role) => MFA_REQUIRED_ROLES.includes(role));
}

export type Portal = 'platform' | 'issuer' | 'investor';

/** Portal a user lands on after signing in. */
export function homePortal(roles: readonly RoleCode[]): Portal {
  if (roles.includes('PLATFORM_ADMIN')) return 'platform';
  if (roles.includes('INVESTOR') && roles.length === 1) return 'investor';
  return 'issuer';
}

/** Portals a user may open. */
export function allowedPortals(roles: readonly RoleCode[]): Portal[] {
  const portals = new Set<Portal>();
  for (const role of roles) {
    if (role === 'PLATFORM_ADMIN') portals.add('platform');
    else if (role === 'INVESTOR') portals.add('investor');
    else portals.add('issuer');
  }
  return [...portals];
}

/** Roles an inviter may give (tenant roles only; investors are invited per issuance, phase 8). */
export function invitableRoles(inviterRoles: readonly RoleCode[]): RoleCode[] {
  if (inviterRoles.includes('PLATFORM_ADMIN')) return ['PLATFORM_ADMIN', 'ISSUER_ADMIN'];
  if (inviterRoles.includes('ISSUER_ADMIN')) {
    return ['ISSUER_ADMIN', 'ISSUER_OPERATOR', 'COMPLIANCE_OFFICER', 'AUDITOR'];
  }
  return [];
}

/** Roles that an Issuer Administrator gives to the staff of the organisation (SPEC §4.2 to §4.6). */
export const TENANT_STAFF_ROLES: readonly RoleCode[] = [
  'ISSUER_ADMIN',
  'ISSUER_OPERATOR',
  'COMPLIANCE_OFFICER',
  'AUDITOR',
];
