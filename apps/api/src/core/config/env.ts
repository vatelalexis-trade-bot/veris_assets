import { z } from 'zod';

// Environment variables are validated once at startup: the API refuses to start
// with a missing or malformed value instead of failing later at runtime.
// New variables are added here as the phases need them.
const port = z.coerce.number().int().min(1).max(65535);
const required = z.string().min(1);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_HOST: required.default('127.0.0.1'),
  API_PORT: port.default(4000),

  POSTGRES_HOST: required.default('127.0.0.1'),
  POSTGRES_PORT: port.default(5432),
  POSTGRES_DB: required,
  POSTGRES_USER: required,
  POSTGRES_PASSWORD: required,

  REDIS_HOST: required.default('127.0.0.1'),
  REDIS_PORT: port.default(6379),

  S3_ENDPOINT: z.url(),
  S3_REGION: required,
  S3_BUCKET: required,
  S3_ACCESS_KEY_ID: required,
  S3_SECRET_ACCESS_KEY: required,
});

export type Env = z.infer<typeof envSchema>;

/** Injection token of the validated environment. */
export const ENV = Symbol('ENV');

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Only variable names and problems are reported, never the values (they may be secrets).
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  return result.data;
}
