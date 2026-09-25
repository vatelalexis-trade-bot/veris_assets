import { describe, expect, it } from 'vitest';
import { resolveCorrelationId } from './correlation-id.middleware.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveCorrelationId', () => {
  it('keeps a valid incoming UUID', () => {
    expect(resolveCorrelationId('0192F3A4-5B6C-7D8E-9F01-23456789ABCD')).toBe(
      '0192f3a4-5b6c-7d8e-9f01-23456789abcd',
    );
  });

  it.each([undefined, '', 'abc', 'x'.repeat(500), 'id\n{"level":"fatal"}'])(
    'replaces %j by a fresh UUID',
    (header) => {
      expect(resolveCorrelationId(header)).toMatch(UUID);
    },
  );

  it('generates a different ID for each request', () => {
    expect(resolveCorrelationId(undefined)).not.toBe(resolveCorrelationId(undefined));
  });
});
