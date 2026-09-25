// PostgreSQL roles (docs/ARCHITECTURE.md §4.5). Created by `pnpm db:setup`.
export const DB_ROLES = {
  /** Owns the schemas and runs migrations and seeds. Never used by the running API. */
  migrator: 'va_migrator',
  /** Only role used by the API: not owner, no BYPASSRLS, no UPDATE/DELETE on append-only tables. */
  app: 'va_app',
  /**
   * Role of the authentication component (decision D-030): reads users before any tenant is known,
   * owns sessions, credentials and TOTP secrets, and has no right on business tables.
   */
  auth: 'va_auth',
  /**
   * Owner of the job queue schema `pgboss` (decision D-039): pg-boss creates tables there at run
   * time. No right on the business schemas.
   */
  jobs: 'va_jobs',
} as const;
