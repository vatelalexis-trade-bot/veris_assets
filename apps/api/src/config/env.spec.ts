import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('applies defaults when variables are absent', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      API_HOST: '127.0.0.1',
      API_PORT: 4000,
    });
  });

  it('reads the port from a string', () => {
    expect(parseEnv({ API_PORT: '4100' }).API_PORT).toBe(4100);
  });

  it('rejects an invalid port with a readable message', () => {
    expect(() => parseEnv({ API_PORT: 'not-a-port' })).toThrow(
      /Invalid environment configuration: API_PORT/,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
