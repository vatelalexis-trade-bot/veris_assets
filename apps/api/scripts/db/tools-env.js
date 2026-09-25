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
  POSTGRES_TEST_DB: required.default('virtus_assets_test'),
  DB_MIGRATOR_PASSWORD: required,
  DB_APP_PASSWORD: required,
});
export function loadToolsEnv() {
  if (existsSync(ROOT_ENV_FILE)) process.loadEnvFile(ROOT_ENV_FILE);
  const result = toolsEnvSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Missing or invalid database settings: ${problems}. Run "pnpm dev" once.`);
  }
  return result.data;
}
export function databaseName(env, target) {
  return target === 'test' ? env.POSTGRES_TEST_DB : env.POSTGRES_DB;
}
//# sourceMappingURL=tools-env.js.map
