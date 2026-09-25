import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyCleanup } from './idempotency-cleanup.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';

@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }, IdempotencyCleanup],
  exports: [IdempotencyCleanup],
})
export class IdempotencyModule {}
