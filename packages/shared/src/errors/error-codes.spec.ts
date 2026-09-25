import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG, ERROR_CODES, isErrorCode } from './error-codes.js';
import { ELIGIBILITY_RULE_CODES, ISSUANCE_TERMS_RULE_CODES } from './rule-codes.js';

const SCREAMING_SNAKE_CASE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

describe('error catalog', () => {
  it('uses SCREAMING_SNAKE_CASE codes', () => {
    for (const code of ERROR_CODES) expect(code).toMatch(SCREAMING_SNAKE_CASE);
  });

  it('gives every code a non-empty English message ending with a period', () => {
    for (const code of ERROR_CODES) expect(ERROR_CATALOG[code].message).toMatch(/^[A-Z].*\.$/);
  });

  it('maps cross-tenant access to 404, never 403 (scenario 5)', () => {
    expect(ERROR_CATALOG.RESOURCE_NOT_FOUND.status).toBe(404);
  });

  it('keeps the example code of SPEC §22.2', () => {
    expect(ERROR_CATALOG.SUBSCRIPTION_LIMIT_EXCEEDED.message).toBe(
      'The requested subscription exceeds the permitted limit.',
    );
  });

  it('recognises known codes only', () => {
    expect(isErrorCode('VALIDATION_FAILED')).toBe(true);
    expect(isErrorCode('toString')).toBe(false);
    expect(isErrorCode('UNKNOWN_CODE')).toBe(false);
  });
});

describe('rule codes', () => {
  it.each([
    ['eligibility', ELIGIBILITY_RULE_CODES],
    ['issuance terms', ISSUANCE_TERMS_RULE_CODES],
  ])('%s codes are unique and well formed', (_, codes) => {
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(SCREAMING_SNAKE_CASE);
  });
});
