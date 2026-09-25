import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` compares these table definitions with the previous migrations and writes the
// SQL of the next migration into ./drizzle. Security (roles' rights, row level security,
// append-only triggers) is written by hand in custom migrations (`pnpm db:generate --custom`).
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/core/database/schema.ts', './src/modules/*/infrastructure/schema.ts'],
  out: './drizzle',
  casing: 'snake_case',
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
});
