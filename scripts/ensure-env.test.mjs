import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fillPlaceholders, missingVariableLines } from './ensure-env.mjs';

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

describe('missingVariableLines', () => {
  const template = '# comment\nA=1\nB=__RANDOM_HEX_16__\nC=3\n';

  it('returns only the variables absent from the existing file, with placeholders filled', () => {
    const lines = missingVariableLines('A=kept\nC=kept\n', template);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^B=[0-9a-f]{32}$/);
  });

  it('never returns variables that already exist, even with other values', () => {
    expect(missingVariableLines('A=x\nB=y\nC=z', template)).toEqual([]);
  });
});
