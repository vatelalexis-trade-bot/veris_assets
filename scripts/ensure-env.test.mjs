import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fillPlaceholders } from './ensure-env.mjs';

describe('fillPlaceholders', () => {
  it('replaces every placeholder of .env.example', () => {
    const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
    expect(fillPlaceholders(template)).not.toMatch(/__RANDOM_/);
  });

  it('generates a distinct value for each occurrence', () => {
    const [first, second] = fillPlaceholders('A=__RANDOM_HEX_32__\nB=__RANDOM_HEX_32__')
      .split('\n')
      .map((line) => line.split('=')[1]);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
  });

  it('generates Garage-compatible access key ids', () => {
    expect(fillPlaceholders('__RANDOM_GARAGE_KEY_ID__')).toMatch(/^GK[0-9a-f]{24}$/);
  });

  it('rejects unknown placeholders', () => {
    expect(() => fillPlaceholders('__RANDOM_UNKNOWN__')).toThrow(/Unknown placeholder/);
  });
});
