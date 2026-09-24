import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PRODUCT_NAME } from '@virtus/shared';
import { AppModule } from './app.module.js';
import { parseEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  const env = parseEnv(process.env);
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(env.API_PORT, env.API_HOST);
  Logger.log(
    `${PRODUCT_NAME} API listening on http://${env.API_HOST}:${env.API_PORT}`,
    'Bootstrap',
  );
}

await bootstrap();
