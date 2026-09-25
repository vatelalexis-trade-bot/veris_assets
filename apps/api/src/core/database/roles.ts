// PostgreSQL roles (docs/ARCHITECTURE.md §4.5). Created by `pnpm db:setup`.
export const DB_ROLES = {
  /** Owns the schemas and runs migrations and seeds. Never used by the running API. */
  migrator: 'va_migrator',
  /** Only role used by the API: not owner, no BYPASSRLS, no UPDATE/DELETE on append-only tables. */
  app: 'va_app',
} as const;
