import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PRODUCT_NAME } from '@virtus/shared';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { ENV, type Env } from './core/config/env.js';
import { configureApp } from './core/configure-app.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const env = app.get<Env>(ENV);
  configureApp(app, env);
  await app.listen(env.API_PORT, env.API_HOST);
  logger.log(
    `${PRODUCT_NAME} API listening on http://${env.API_HOST}:${env.API_PORT}`,
    'Bootstrap',
  );
}

await bootstrap();
