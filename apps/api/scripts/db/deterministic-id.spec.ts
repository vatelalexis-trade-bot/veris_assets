import { describe, expect, it } from 'vitest';
import { deterministicUuid } from './deterministic-id.js';

describe('deterministicUuid', () => {
  it('always gives the same identifier for the same name', () => {
    expect(deterministicUuid('tenant:northwind')).toBe(deterministicUuid('tenant:northwind'));
  });

  it('gives different identifiers for different names', () => {
    expect(deterministicUuid('tenant:northwind')).not.toBe(deterministicUuid('tenant:contoso'));
  });

  it('produces a valid UUID version 8 with the RFC 9562 variant', () => {
    expect(deterministicUuid('anything')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
