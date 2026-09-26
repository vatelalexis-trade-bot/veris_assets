import type { RoleCode } from '../domain/roles.js';

// Demonstration accounts (decision D-017, SPEC §28). Fictitious names, @example.com addresses.
// Used by the demo seed and by the demo login page, which lists them (DEMO_MODE only).

export type DemoTenant = 'northwind' | 'contoso' | null;

export interface DemoAccount {
  email: string;
  name: string;
  role: RoleCode;
  tenant: DemoTenant;
  locale: 'en-GB' | 'fr-FR';
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    email: 'platform.admin@example.com',
    name: 'Platform Admin (demo)',
    role: 'PLATFORM_ADMIN',
    tenant: null,
    locale: 'en-GB',
  },
  {
    email: 'northwind.admin1@example.com',
    name: 'Northwind Admin One (demo)',
    role: 'ISSUER_ADMIN',
    tenant: 'northwind',
    locale: 'fr-FR',
  },
  {
    email: 'northwind.admin2@example.com',
    name: 'Northwind Admin Two (demo)',
    role: 'ISSUER_ADMIN',
    tenant: 'northwind',
    locale: 'en-GB',
  },
  {
    email: 'northwind.operator@example.com',
    name: 'Northwind Operator (demo)',
    role: 'ISSUER_OPERATOR',
    tenant: 'northwind',
    locale: 'fr-FR',
  },
  {
    email: 'northwind.compliance@example.com',
    name: 'Northwind Compliance (demo)',
    role: 'COMPLIANCE_OFFICER',
    tenant: 'northwind',
    locale: 'en-GB',
  },
  {
    email: 'northwind.auditor@example.com',
    name: 'Northwind Auditor (demo)',
    role: 'AUDITOR',
    tenant: 'northwind',
    locale: 'en-GB',
  },
  {
    email: 'investor.a@example.com',
    name: 'Investor A (demo)',
    role: 'INVESTOR',
    tenant: 'northwind',
    locale: 'en-GB',
  },
  {
    email: 'investor.b@example.com',
    name: 'Investor B (demo)',
    role: 'INVESTOR',
    tenant: 'northwind',
    locale: 'fr-FR',
  },
  {
    email: 'investor.c@example.com',
    name: 'Investor C (demo)',
    role: 'INVESTOR',
    tenant: 'northwind',
    locale: 'en-GB',
  },
  {
    email: 'investor.d@example.com',
    name: 'Investor D (demo)',
    role: 'INVESTOR',
    tenant: 'northwind',
    locale: 'fr-FR',
  },
  {
    email: 'contoso.admin@example.com',
    name: 'Contoso Admin (demo)',
    role: 'ISSUER_ADMIN',
    tenant: 'contoso',
    locale: 'en-GB',
  },
  {
    email: 'contoso.operator@example.com',
    name: 'Contoso Operator (demo)',
    role: 'ISSUER_OPERATOR',
    tenant: 'contoso',
    locale: 'en-GB',
  },
];
