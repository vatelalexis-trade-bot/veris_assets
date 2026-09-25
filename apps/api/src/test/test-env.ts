// Fictitious environment used by automated tests (no real service is contacted).
export const TEST_ENV_SOURCE: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  POSTGRES_DB: 'virtus_assets_test',
  DB_APP_PASSWORD: 'test-password',
  DB_AUTH_PASSWORD: 'test-auth-password',
  DB_JOBS_PASSWORD: 'test-jobs-password',
  JOBS_ENABLED: 'false',
  BETTER_AUTH_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
  S3_ENDPOINT: 'http://127.0.0.1:3900',
  S3_REGION: 'garage',
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY_ID: 'GK000000000000000000000000',
  S3_SECRET_ACCESS_KEY: 'test-secret',
};
