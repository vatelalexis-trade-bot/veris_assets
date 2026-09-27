// Configuration of the database scripts. Unlike the API, they need the superuser and migrator
// credentials. Values come from the environment, completed by the repository's .env file.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const ROOT_ENV_FILE = fileURLToPath(new URL('../../../../.env', import.meta.url));

const required = z.string().min(1);

const toolsEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  POSTGRES_HOST: required.default('127.0.0.1'),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  POSTGRES_USER: required,
  POSTGRES_PASSWORD: required,
  POSTGRES_DB: required,
  POSTGRES_TEST_DB: required.default('veris_assets_test'),
  DB_MIGRATOR_PASSWORD: required,
  DB_APP_PASSWORD: required,
  DB_AUTH_PASSWORD: required,
  DB_JOBS_PASSWORD: required,
  // Demonstration accounts are created only when their password is configured (decision D-017).
  DEMO_ACCOUNTS_PASSWORD: z.string().min(12).optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  // An online demonstration (fictitious data only) may be reset despite NODE_ENV=production.
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
});

export type ToolsEnv = z.infer<typeof toolsEnvSchema>;

/** Which database a script works on: the demo database or the one of the integration tests. */
export type DatabaseTarget = 'demo' | 'test';

export function loadToolsEnv(): ToolsEnv {
  // Variables already set (for example by the CI) take precedence over the file.
  if (existsSync(ROOT_ENV_FILE)) process.loadEnvFile(ROOT_ENV_FILE);
  const result = toolsEnvSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Missing or invalid database settings: ${problems}. Run "pnpm dev" once.`);
  }
  return result.data;
}

export function databaseName(env: ToolsEnv, target: DatabaseTarget): string {
  return target === 'test' ? env.POSTGRES_TEST_DB : env.POSTGRES_DB;
}
