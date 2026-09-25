/** A dependency that must be reachable for the API to serve requests. */
export interface ReadinessCheck {
  readonly name: string;
  /** Resolves when the dependency answers; rejects otherwise. */
  check(): Promise<void>;
}

/** Injection token of the list of readiness checks. */
export const READINESS_CHECKS = Symbol('READINESS_CHECKS');

export const READINESS_TIMEOUT_MS = 2000;

export type CheckStatus = 'up' | 'down';

export interface ReadinessReport {
  readonly status: 'ok' | 'unavailable';
  readonly checks: Readonly<Record<string, CheckStatus>>;
}

function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Runs every check in parallel; one failing or slow check makes the API not ready. */
export async function runReadinessChecks(
  checks: readonly ReadinessCheck[],
  timeoutMs = READINESS_TIMEOUT_MS,
  onFailure: (name: string, error: unknown) => void = () => undefined,
): Promise<ReadinessReport> {
  const results = await Promise.all(
    checks.map(async (readinessCheck): Promise<[string, CheckStatus]> => {
      try {
        await withTimeout(readinessCheck.check(), timeoutMs);
        return [readinessCheck.name, 'up'];
      } catch (error) {
        onFailure(readinessCheck.name, error);
        return [readinessCheck.name, 'down'];
      }
    }),
  );
  return {
    status: results.every(([, status]) => status === 'up') ? 'ok' : 'unavailable',
    checks: Object.fromEntries(results),
  };
}
