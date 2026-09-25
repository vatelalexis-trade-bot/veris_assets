import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppError } from '../errors/app-error.js';
import { REDIS } from '../redis/redis.module.js';

export interface RateLimit {
  /** Name of the protected action, part of the Redis key. */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

/** Fixed-window rate limiting shared by every API instance (SPEC §22.1, §24). */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Counts one attempt for `subject` and throws RATE_LIMITED once the limit is exceeded. */
  async consume(rule: RateLimit, subject: string): Promise<void> {
    const key = `rate:${rule.name}:${subject}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, rule.windowSeconds);
    if (count > rule.limit) {
      throw new AppError('RATE_LIMITED', [
        { code: 'RETRY_LATER', field: null, meta: { windowSeconds: rule.windowSeconds } },
      ]);
    }
  }
}
