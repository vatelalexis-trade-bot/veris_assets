import { describe, expect, it, vi } from 'vitest';
import { runReadinessChecks, type ReadinessCheck } from './readiness-check.js';

const up = (name: string): ReadinessCheck => ({ name, check: () => Promise.resolve() });
const down = (name: string): ReadinessCheck => ({
  name,
  check: () => Promise.reject(new Error('connection refused')),
});
const hanging = (name: string): ReadinessCheck => ({
  name,
  check: () => new Promise<void>(() => undefined),
});

describe('runReadinessChecks', () => {
  it('is ok when every dependency answers', async () => {
    await expect(runReadinessChecks([up('database'), up('redis')])).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('is unavailable when one dependency fails, and reports which one', async () => {
    const onFailure = vi.fn();
    const report = await runReadinessChecks([up('database'), down('storage')], 50, onFailure);
    expect(report).toEqual({ status: 'unavailable', checks: { database: 'up', storage: 'down' } });
    expect(onFailure).toHaveBeenCalledWith('storage', expect.any(Error));
  });

  it('treats a dependency that does not answer in time as down', async () => {
    const report = await runReadinessChecks([hanging('redis')], 20);
    expect(report.checks).toEqual({ redis: 'down' });
  });
});
