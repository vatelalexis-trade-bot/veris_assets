import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIdempotencyKey } from './idempotency';

describe('useIdempotencyKey', () => {
  it('keeps the key until the server has answered, then uses a new one', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const first = result.current.header()['Idempotency-Key'];
    // A new attempt after a network failure: same key, so the server does the work once.
    expect(result.current.header()['Idempotency-Key']).toBe(first);
    result.current.answered();
    expect(result.current.header()['Idempotency-Key']).not.toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
