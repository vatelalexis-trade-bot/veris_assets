import { AppError } from '../errors/app-error.js';

/**
 * Simple circuit breaker (docs/ARCHITECTURE.md §4.10): after `threshold` failures in a row, calls
 * fail at once with 503 PROVIDER_UNAVAILABLE for `openMs`, instead of insisting on a provider
 * that is down. One successful call closes it again.
 */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly threshold = 3,
    private readonly openMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {}

  get isOpen(): boolean {
    return this.now() < this.openUntil;
  }

  async call<T>(work: () => Promise<T>): Promise<T> {
    if (this.isOpen) throw new AppError('PROVIDER_UNAVAILABLE');
    try {
      const result = await work();
      this.failures = 0;
      return result;
    } catch (error) {
      this.failures += 1;
      if (this.failures >= this.threshold) {
        this.openUntil = this.now() + this.openMs;
        this.failures = 0;
      }
      throw error instanceof AppError ? error : new AppError('PROVIDER_UNAVAILABLE');
    }
  }
}
