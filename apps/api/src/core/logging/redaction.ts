// Values never written to logs (SPEC §8.5, §24, rule 15). Masked at the top level and one level deep;
// log identifiers rather than whole objects to stay within these paths.
export const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'token',
  'secret',
  'totpSecret',
  'backupCodes',
  'email',
  'phone',
  'taxId',
  'fullName',
  'dateOfBirth',
  'address',
  'iban',
];

export const REDACTED_PATHS: string[] = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`]),
];

export const REDACTION_CENSOR = '[REDACTED]';
