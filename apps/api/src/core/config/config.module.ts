import { Global, Module } from '@nestjs/common';
import { ENV, parseEnv } from './env.js';

/** Provides the validated environment everywhere under the `ENV` token. */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => parseEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
