import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';
import { TEST_ENV_SOURCE } from '../../test/test-env.js';

describe('parseEnv', () => {
  it('applies defaults for optional variables', () => {
    expect(parseEnv(TEST_ENV_SOURCE)).toMatchObject({
      NODE_ENV: 'test',
      API_HOST: '127.0.0.1',
      API_PORT: 4000,
      POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PORT: 5432,
      REDIS_PORT: 6379,
    });
  });

  it('reads ports from strings', () => {
    expect(parseEnv({ ...TEST_ENV_SOURCE, API_PORT: '4100' }).API_PORT).toBe(4100);
  });

  it('rejects an invalid port with a readable message', () => {
    expect(() => parseEnv({ ...TEST_ENV_SOURCE, API_PORT: 'not-a-port' })).toThrow(
      /Invalid environment configuration: API_PORT/,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => parseEnv({ ...TEST_ENV_SOURCE, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('lists every missing required variable', () => {
    expect(() => parseEnv({})).toThrow(/DB_APP_PASSWORD.*S3_BUCKET/);
  });

  it('never prints secret values in the error message', () => {
    const secret = 'super-secret-value';
    let message = '';
    try {
      parseEnv({ ...TEST_ENV_SOURCE, S3_ENDPOINT: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/S3_ENDPOINT/);
    expect(message).not.toContain(secret);
  });
});
