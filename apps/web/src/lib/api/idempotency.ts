'use client';

import { useRef } from 'react';

/**
 * Idempotency-Key of a user action (docs/ARCHITECTURE.md §4.8). The key stays the same until the
 * server has answered, so that sending again after a network failure never does the work twice;
 * the next action then gets a new key.
 */
export function useIdempotencyKey() {
  const key = useRef<string | null>(null);
  return {
    /** Headers for the call; `answered` must be called once the server has replied. */
    header: () => ({ 'Idempotency-Key': (key.current ??= crypto.randomUUID()) }),
    answered: () => {
      key.current = null;
    },
  };
}
