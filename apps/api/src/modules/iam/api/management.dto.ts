import { z } from 'zod';
import { ROLE_CODES } from '../domain/roles.js';

// Bodies and answers of the management routes (docs/API.md §2.3 and §2.4).

const locale = z.enum(['en-GB', 'fr-FR']);
// Time zones known to the runtime (IANA database), e.g. Europe/Paris.
const timezone = z.string().refine((value) => Intl.supportedValuesOf('timeZone').includes(value), {
  message: 'Unknown time zone',
});
const organizationType = z.enum(['ISSUER', 'ASSET_MANAGER', 'FUND']);

export const idParam = z.uuid();

/** An emergency access of a Platform Administrator (D-103). */
export const breakGlassView = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  reason: z.string(),
  startedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
});

export const person = z.strictObject({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(200),
  locale: locale.default('en-GB'),
});

export const tenantCreateBody = z.strictObject({
  legalName: z.string().trim().min(1).max(200),
  tradeName: z.string().trim().max(200).nullable().optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  baseCurrency: z.string().regex(/^[A-Z]{3}$/),
  defaultLocale: locale.default('en-GB'),
  timezone: timezone.default('Europe/Paris'),
  organizationType,
  firstAdministrator: person,
});
export const tenantUpdateBody = z
  .strictObject({
    legalName: z.string().trim().min(1).max(200),
    tradeName: z.string().trim().max(200).nullable(),
    defaultLocale: locale,
    timezone,
    organizationType,
  })
  .partial();

export const tenantView = z.object({
  id: z.uuid(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  countryCode: z.string(),
  baseCurrency: z.string(),
  defaultLocale: locale,
  timezone: z.string(),
  organizationType,
  status: z.enum(['ACTIVE', 'INACTIVE']),
  version: z.int(),
  createdAt: z.iso.datetime(),
});

export const settingsUpdateBody = z
  .strictObject({
    tradeName: z.string().trim().max(200).nullable(),
    defaultLocale: locale,
    timezone,
  })
  .partial();

export const staffInvitationBody = person.extend({ roleCode: z.enum(ROLE_CODES) });
export const userUpdateBody = z
  .strictObject({ name: z.string().trim().min(1).max(200), locale })
  .partial();
export const rolesBody = z.strictObject({ roles: z.array(z.enum(ROLE_CODES)).min(1).max(4) });

export const userView = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  locale,
  status: z.enum(['ACTIVE', 'INACTIVE']),
  roles: z.array(z.enum(ROLE_CODES)),
  mfaEnabled: z.boolean(),
  lastLoginAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export const invitationView = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  roleCode: z.enum(ROLE_CODES),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export const invitationCreated = z.object({ id: z.uuid(), expiresAt: z.iso.datetime() });
export const roleView = z.object({
  code: z.enum(ROLE_CODES),
  permissions: z.array(z.object({ code: z.string(), scope: z.enum(['all', 'own']) })),
});
