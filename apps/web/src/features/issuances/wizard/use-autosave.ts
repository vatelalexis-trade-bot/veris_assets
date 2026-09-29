'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Fields whose value differs from the last saved one. */
function changesOf<T extends object>(values: T, saved: T): Partial<T> {
  const changes: Partial<T> = {};
  for (const key of Object.keys(values) as (keyof T)[]) {
    if (JSON.stringify(values[key]) !== JSON.stringify(saved[key])) changes[key] = values[key];
  }
  return changes;
}

/**
 * Automatic saving of a wizard step (SPEC §6.2 "sauvegarde automatique du brouillon"): a short
 * while after the last change, only the changed fields are sent. `flush` saves at once (before
 * leaving the step) and gives the outcome of the last save, if any: the step may be gone before
 * it can report it.
 */
export function useAutosave<T extends object>(
  values: T,
  initial: T,
  save: (changes: Partial<T>) => Promise<void>,
  delayMs = 800,
) {
  const saved = useRef(initial);
  const running = useRef<Promise<SaveState> | null>(null);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<unknown>(null);

  const flush = useCallback(async (): Promise<SaveState | undefined> => {
    const previous = running.current ? await running.current : undefined;
    const changes = changesOf(values, saved.current);
    if (Object.keys(changes).length === 0) return previous;
    setState('saving');
    running.current = save(changes)
      .then(() => {
        saved.current = values;
        setState('saved');
        setError(null);
        return 'saved' as const;
      })
      .catch((reason: unknown) => {
        setState('error');
        setError(reason);
        return 'error' as const;
      })
      .finally(() => {
        running.current = null;
      });
    return running.current;
  }, [values, save]);

  useEffect(() => {
    const timer = setTimeout(() => void flush(), delayMs);
    return () => clearTimeout(timer);
  }, [flush, delayMs]);

  return { state, error, flush };
}
