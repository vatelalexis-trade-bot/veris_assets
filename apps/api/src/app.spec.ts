import { Body, Controller, Get, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { ErrorResponseBody } from '@virtus/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppModule } from './app.module.js';
import { ENV, parseEnv } from './core/config/env.js';
import { configureApp } from './core/configure-app.js';
import { AppError } from './core/errors/app-error.js';
import { READINESS_CHECKS, type ReadinessCheck } from './core/health/readiness-check.js';
import { ZodValidationPipe } from './core/validation/zod-validation.pipe.js';
import { TEST_ENV_SOURCE } from './test/test-env.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const createSchema = z.strictObject({ name: z.string().min(1), units: z.string() });

/** Test-only routes that exercise the error handling of the real application setup. */
@Controller('test-errors')
class TestErrorsController {
  @Get('business')
  business(): never {
    throw new AppError('SUBSCRIPTION_LIMIT_EXCEEDED', [{ code: 'MAX_AMOUNT', field: 'amount' }]);
  }

  @Get('unexpected')
  unexpected(): never {
    throw new Error('database password is hunter2');
  }

  @Post('validated')
  validated(@Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return body;
  }
}

describe('API application', () => {
  let app: NestExpressApplication;
  let storageUp = true;

  beforeAll(async () => {
    const checks: ReadinessCheck[] = [
      { name: 'database', check: () => Promise.resolve() },
      {
        name: 'storage',
        check: () => (storageUp ? Promise.resolve() : Promise.reject(new Error('down'))),
      },
    ];
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestErrorsController],
    })
      .overrideProvider(ENV)
      .useValue(parseEnv(TEST_ENV_SOURCE))
      .overrideProvider(READINESS_CHECKS)
      .useValue(checks)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, parseEnv(TEST_ENV_SOURCE));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health probes', () => {
    it('answers /health outside the /api/v1 prefix', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);
      expect(response.body).toEqual({ status: 'ok' });
    });

    it('reports readiness per dependency', async () => {
      storageUp = true;
      const ok = await request(app.getHttpServer()).get('/health/ready').expect(200);
      expect(ok.body).toEqual({ status: 'ok', checks: { database: 'up', storage: 'up' } });

      storageUp = false;
      const ko = await request(app.getHttpServer()).get('/health/ready').expect(503);
      expect(ko.body).toEqual({
        status: 'unavailable',
        checks: { database: 'up', storage: 'down' },
      });
    });
  });

  describe('correlation ID', () => {
    it('creates one when the caller sends none', async () => {
      const response = await request(app.getHttpServer()).get('/health');
      expect(response.headers['x-correlation-id']).toMatch(UUID);
    });

    it('keeps a valid one sent by the caller', async () => {
      const id = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('X-Correlation-Id', id);
      expect(response.headers['x-correlation-id']).toBe(id);
    });
  });

  describe('error format (SPEC §22.2)', () => {
    it('returns RESOURCE_NOT_FOUND for an unknown route, with the correlation ID', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
      const body = response.body as ErrorResponseBody;
      expect(body.error).toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found.',
        details: [],
      });
      expect(body.error.correlationId).toBe(response.headers['x-correlation-id']);
      expect(new Date(body.error.timestamp).toISOString()).toBe(body.error.timestamp);
    });

    it('returns the catalog status and details of a business error', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test-errors/business')
        .expect(422);
      expect((response.body as ErrorResponseBody).error).toMatchObject({
        code: 'SUBSCRIPTION_LIMIT_EXCEEDED',
        message: 'The requested subscription exceeds the permitted limit.',
        details: [{ code: 'MAX_AMOUNT', field: 'amount' }],
      });
    });

    it('hides the cause of an unexpected error', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test-errors/unexpected')
        .expect(500);
      expect((response.body as ErrorResponseBody).error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(response.body)).not.toContain('hunter2');
    });

    it('rejects malformed JSON with VALIDATION_FAILED', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/test-errors/validated')
        .set('Content-Type', 'application/json')
        .send('{"name": ')
        .expect(400);
      expect((response.body as ErrorResponseBody).error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('input validation', () => {
    it('accepts a valid body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/test-errors/validated')
        .send({ name: 'Helios', units: '100' })
        .expect(201, { name: 'Helios', units: '100' });
    });

    it('rejects invalid and unknown fields with one detail per problem', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/test-errors/validated')
        .send({ name: '', units: 100, tenantId: 'someone-else' })
        .expect(400);
      const { error } = response.body as ErrorResponseBody;
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details.map((detail) => detail.field ?? detail.code).sort()).toEqual(
        ['UNRECOGNIZED_KEYS', 'name', 'units'].sort(),
      );
    });
  });

  it('does not reveal the framework in response headers', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
