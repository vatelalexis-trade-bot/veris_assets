import { Global, Module } from '@nestjs/common';
import { RateLimiter } from './rate-limiter.js';
import { SecurityMonitor } from './security-monitor.js';

@Global()
@Module({ providers: [RateLimiter, SecurityMonitor], exports: [RateLimiter, SecurityMonitor] })
export class SecurityModule {}
