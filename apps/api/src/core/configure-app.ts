import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env.js';
import { correlationIdMiddleware } from './context/correlation-id.middleware.js';
import { AllExceptionsFilter } from './errors/all-exceptions.filter.js';
import { setupOpenApi } from './openapi/setup-openapi.js';

export const API_PREFIX = 'api/v1';

/** Application-wide setup, shared by main.ts and the tests so that both run the same app. */
export function configureApp(app: NestExpressApplication, env: Env): void {
  // Must stay first: every later step relies on the correlation ID and the request context.
  app.use(correlationIdMiddleware);
  app.disable('x-powered-by');
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'health/ready'] });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  if (env.NODE_ENV !== 'production') setupOpenApi(app);
}
