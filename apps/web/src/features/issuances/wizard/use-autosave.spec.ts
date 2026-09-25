import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutosave } from './use-autosave';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useAutosave', () => {
  it('sends only the changed fields, once the user stops typing', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const initial = { name: 'Helios', code: 'HELIOS27' };
    const { rerender, result } = renderHook(({ values }) => useAutosave(values, initial, save), {
      initialProps: { values: initial },
    });
    rerender({ values: { name: 'Helios S', code: 'HELIOS27' } });
    rerender({ values: { name: 'Helios Solar', code: 'HELIOS27' } });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ name: 'Helios Solar' });
    expect(result.current.state).toBe('saved');
    // Nothing changed since: nothing more is sent.
    await act(async () => {
      await result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps the changes to send again after a failure', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const initial = { rate: '5' };
    const { rerender, result } = renderHook(({ values }) => useAutosave(values, initial, save), {
      initialProps: { values: initial },
    });
    rerender({ values: { rate: '6' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(result.current.state).toBe('error');
    await act(async () => {
      await result.current.flush();
    });
    expect(save).toHaveBeenLastCalledWith({ rate: '6' });
    expect(result.current.state).toBe('saved');
  });
});
