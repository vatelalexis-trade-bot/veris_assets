import { z } from 'zod';
import { ROLE_CODES } from '../domain/roles.js';

// Request and response bodies of the authentication routes (docs/API.md §2.2). The same schemas
// validate input and produce the OpenAPI documentation used to generate the web client.

const email = z.email().max(254);
const password = z.string().min(1).max(256);
const locale = z.enum(['en-GB', 'fr-FR']);

export const signInBody = z.strictObject({ email, password });
export const secondFactorBody = z.strictObject({
  code: z.string().trim().min(6).max(32),
  method: z.enum(['totp', 'backup']).default('totp'),
});
export const passwordBody = z.strictObject({ password });
export const totpCodeBody = z.strictObject({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
export const forgotPasswordBody = z.strictObject({ email });
export const resetPasswordBody = z.strictObject({
  token: z.string().min(1).max(512),
  newPassword: password,
});
export const invitationBody = z.strictObject({
  email,
  name: z.string().trim().min(1).max(200),
  roleCode: z.enum(ROLE_CODES),
  locale: locale.default('en-GB'),
  tenantId: z.uuid().optional(),
});

export const signInResult = z.object({ status: z.enum(['SIGNED_IN', 'MFA_REQUIRED']) });
export const portal = z.enum(['platform', 'issuer', 'investor']);
export const meResult = z.object({
  user: z.object({ id: z.uuid(), name: z.string(), email: z.email(), locale }),
  tenant: z.object({ id: z.uuid(), legalName: z.string() }).nullable(),
  roles: z.array(z.enum(ROLE_CODES)),
  /** Granted permissions and their scope ('own' = the investor's own data only). */
  permissions: z.record(z.string(), z.enum(['all', 'own'])),
  portals: z.array(portal),
  homePortal: portal,
  mfa: z.object({ enabled: z.boolean(), required: z.boolean() }),
  sessionExpiresAt: z.iso.datetime(),
  /** Emergency access in progress (read-only, one organisation), or null. */
  breakGlass: z
    .object({ tenantId: z.uuid(), reason: z.string(), expiresAt: z.iso.datetime() })
    .nullable(),
});
export const mfaEnrollmentResult = z.object({
  totpUri: z.string(),
  secretKey: z.string(),
  backupCodes: z.array(z.string()),
});
export const invitationPreview = z.object({
  email: z.email(),
  name: z.string(),
  roleCode: z.enum(ROLE_CODES),
  tenantName: z.string().nullable(),
  expiresAt: z.iso.datetime(),
});
export const invitationCreated = z.object({ id: z.uuid(), expiresAt: z.iso.datetime() });
export const demoAccountsResult = z.object({
  password: z.string(),
  totpValidForSeconds: z.int(),
  accounts: z.array(
    z.object({
      email: z.email(),
      name: z.string(),
      role: z.enum(ROLE_CODES),
      tenant: z.enum(['northwind', 'contoso']).nullable(),
      totpCode: z.string().nullable(),
    }),
  ),
});
