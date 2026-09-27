// Security headers of the API (SPEC §24, P16-1).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from '../../test/integration-app.js';

let ctx: IntegrationApp;

beforeAll(async () => {
  ctx = await startIntegrationApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('security headers', () => {
  it('protect every API response, errors included', async () => {
    for (const response of [
      await request(ctx.app.getHttpServer()).get('/health'),
      await request(ctx.app.getHttpServer()).get('/api/v1/auth/me'),
      await request(ctx.app.getHttpServer()).get('/api/v1/unknown-route'),
    ]) {
      expect(response.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'DENY',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      });
      expect(response.headers['x-powered-by']).toBeUndefined();
    }
  });
});
