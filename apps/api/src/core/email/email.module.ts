import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { EMAIL_PROVIDER } from './email.provider.js';
import { SmtpEmailProvider } from './smtp-email.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) => new SmtpEmailProvider(env),
    },
  ],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
