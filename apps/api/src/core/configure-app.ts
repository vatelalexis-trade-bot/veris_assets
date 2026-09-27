import type { NestExpressApplication } from '@nestjs/platform-express';
import { AuditWriter } from './audit/audit-writer.js';
import type { Env } from './config/env.js';
import { correlationIdMiddleware } from './context/correlation-id.middleware.js';
import { AllExceptionsFilter } from './errors/all-exceptions.filter.js';
import { createOriginCheck } from './security/origin.middleware.js';
import { OPENAPI_PATH, setupOpenApi } from './openapi/setup-openapi.js';
import { securityHeaders } from './security/security-headers.middleware.js';
import { SecurityMonitor } from './security/security-monitor.js';

export const API_PREFIX = 'api/v1';

/** Application-wide setup, shared by main.ts and the tests so that both run the same app. */
export function configureApp(app: NestExpressApplication, env: Env): void {
  // Must stay first: every later step relies on the correlation ID and the request context.
  app.use(correlationIdMiddleware);
  app.disable('x-powered-by');
  app.use(securityHeaders(`/${OPENAPI_PATH}`));
  // The API is only reached through the web app's proxy: the client address is taken from
  // X-Forwarded-For only when the request comes from it (localhost, or Railway's private network).
  app.set(
    'trust proxy',
    env.TRUST_PROXY.split(',').map((value) => value.trim()),
  );
  app.use(createOriginCheck([env.WEB_ORIGIN]));
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'health/ready'] });
  app.useGlobalFilters(new AllExceptionsFilter(app.get(AuditWriter), app.get(SecurityMonitor)));
  app.enableShutdownHooks();
  if (env.NODE_ENV !== 'production') setupOpenApi(app);
}
