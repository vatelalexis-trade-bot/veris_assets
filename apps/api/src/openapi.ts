// Writes the OpenAPI document of the API to a file, without contacting any service; the web app
// generates its typed client from it (decision D-027). Usage: node dist/openapi.js <output file>.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

// Fictitious settings: connections are opened lazily, so none is made while building the document.
const PLACEHOLDERS: Record<string, string> = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'silent',
  POSTGRES_DB: 'unused',
  DB_APP_PASSWORD: 'unused',
  DB_AUTH_PASSWORD: 'unused',
  BETTER_AUTH_SECRET: 'openapi-export-placeholder-secret-0123456789',
  S3_ENDPOINT: 'http://127.0.0.1:3900',
  S3_REGION: 'unused',
  S3_BUCKET: 'unused',
  S3_ACCESS_KEY_ID: 'unused',
  S3_SECRET_ACCESS_KEY: 'unused',
};

async function exportOpenApi(output: string): Promise<void> {
  for (const [name, value] of Object.entries(PLACEHOLDERS)) process.env[name] = value;
  const { AppModule } = await import('./app.module.js');
  const { ENV } = await import('./core/config/env.js');
  const { configureApp } = await import('./core/configure-app.js');
  const { buildOpenApiDocument } = await import('./core/openapi/setup-openapi.js');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  configureApp(app, app.get(ENV));
  writeFileSync(output, `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
  await app.close();
}

const output = process.argv[2];
if (!output) throw new Error('Usage: node dist/openapi.js <output file>');
await exportOpenApi(output);
