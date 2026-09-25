import { describe, expect, it } from 'vitest';
import { canonicalJson, requestHash } from './request-hash.js';

describe('request fingerprint', () => {
  it('does not depend on the order of the keys', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { f: 2, e: 3 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[1,{"e":3,"f":2}]},"b":1}',
    );
    expect(requestHash('post', '/api/v1/users', { a: 1, b: 2 })).toBe(
      requestHash('POST', '/api/v1/users', { b: 2, a: 1 }),
    );
  });

  it('changes with the method, the path or the body', () => {
    const reference = requestHash('POST', '/api/v1/users', { a: 1 });
    expect(requestHash('PUT', '/api/v1/users', { a: 1 })).not.toBe(reference);
    expect(requestHash('POST', '/api/v1/tenants', { a: 1 })).not.toBe(reference);
    expect(requestHash('POST', '/api/v1/users', { a: 2 })).not.toBe(reference);
  });

  it('treats a missing body and undefined fields as absent', () => {
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});
