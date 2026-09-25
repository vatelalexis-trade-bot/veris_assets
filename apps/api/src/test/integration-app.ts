// Starts the complete API against the integration test database and the local Redis, with an
// email provider that keeps messages in memory instead of sending them.
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createOTP } from '@better-auth/utils/otp';
import { symmetricDecrypt } from 'better-auth/crypto';
import pg from 'pg';
import request from 'supertest';
import { connectionConfig } from '../../scripts/db/admin.js';
import { loadToolsEnv } from '../../scripts/db/tools-env.js';
import { AppModule } from '../app.module.js';
import { ENV, parseEnv, type Env } from '../core/config/env.js';
import { configureApp } from '../core/configure-app.js';
import {
  EMAIL_PROVIDER,
  type EmailMessage,
  type EmailProvider,
} from '../core/email/email.provider.js';

export class CapturedEmails implements EmailProvider {
  readonly messages: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  /** First link of the last email sent to `to`. */
  lastLinkTo(to: string): string {
    const message = [...this.messages].reverse().find((candidate) => candidate.to === to);
    const link = message?.text.match(/https?:\/\/\S+/)?.[0];
    if (!link) throw new Error(`No email with a link was sent to ${to}`);
    return link;
  }
}

export interface IntegrationApp {
  app: NestExpressApplication;
  env: Env;
  emails: CapturedEmails;
  /** Direct access to the test database with the admin role, for assertions. */
  admin: pg.Client;
  /** Current authenticator code of a user who has set up two-factor authentication. */
  totpCode: (email: string) => Promise<string>;
  /** Signs a demo account in (answering the second factor if needed); the agent keeps cookies. */
  signIn: (email: string, password?: string) => Promise<ReturnType<typeof request.agent>>;
  close: () => Promise<void>;
}

export async function startIntegrationApp(): Promise<IntegrationApp> {
  const tools = loadToolsEnv();
  const env = parseEnv({
    // Settings of services these tests do not use (storage): placeholders when not configured,
    // as in CI where there is no .env file.
    S3_ENDPOINT: 'http://127.0.0.1:3900',
    S3_REGION: 'garage',
    S3_BUCKET: 'unused-in-tests',
    S3_ACCESS_KEY_ID: 'unused-in-tests',
    S3_SECRET_ACCESS_KEY: 'unused-in-tests',
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    POSTGRES_DB: tools.POSTGRES_TEST_DB,
    DEMO_MODE: 'true',
    JOBS_ENABLED: 'false',
    REDIS_KEY_PREFIX: `va-test:${randomUUID()}:`,
  });
  const emails = new CapturedEmails();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(env)
    .overrideProvider(EMAIL_PROVIDER)
    .useValue(emails)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: process.env.DEBUG_TEST_LOGS ? ['error'] : false,
  });
  configureApp(app, env);
  await app.init();

  const admin = new pg.Client(connectionConfig(tools, tools.POSTGRES_TEST_DB, 'admin'));
  await admin.connect();

  async function totpCode(email: string): Promise<string> {
    const { rows } = await admin.query<{ secret: string }>(
      `SELECT t.secret FROM iam.two_factor t JOIN iam.user u ON u.id = t.user_id WHERE u.email = $1`,
      [email],
    );
    const secret = await symmetricDecrypt({ key: env.BETTER_AUTH_SECRET, data: rows[0]!.secret });
    return createOTP(secret).totp();
  }

  return {
    app,
    env,
    emails,
    admin,
    totpCode,
    async signIn(email, password = env.DEMO_ACCOUNTS_PASSWORD) {
      const agent = request.agent(app.getHttpServer());
      const first = await agent.post('/api/v1/auth/sign-in').send({ email, password });
      if (first.status !== 200) throw new Error(`Sign-in of ${email} failed: ${first.status}`);
      if ((first.body as { status: string }).status === 'MFA_REQUIRED') {
        const code = await totpCode(email);
        const second = await agent.post('/api/v1/auth/mfa/verify').send({ code });
        if (second.status !== 200)
          throw new Error(`Second factor of ${email} failed: ${second.status}`);
      }
      return agent;
    },
    async close() {
      await admin.end();
      await app.close();
    },
  };
}
