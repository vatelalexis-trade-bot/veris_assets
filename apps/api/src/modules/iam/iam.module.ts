import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type pg from 'pg';
import { ENV, type Env } from '../../core/config/env.js';
import { AuthController } from './api/auth.controller.js';
import { AuthGuard } from './api/auth.guard.js';
import {
  InvitationAcceptanceController,
  UserInvitationsController,
} from './api/invitations.controller.js';
import { AuthenticationService } from './application/authentication.service.js';
import { DemoAccountsService } from './application/demo-accounts.service.js';
import { InvitationService } from './application/invitation.service.js';
import { PasswordResetMailer } from './application/password-reset-mailer.js';
import {
  AUTH_DATABASE,
  AUTH_POOL,
  createAuthDatabase,
  createAuthPool,
} from './infrastructure/auth-database.js';
import { BETTER_AUTH, createBetterAuth } from './infrastructure/better-auth.js';
import { IdentityRepository } from './infrastructure/identity.repository.js';

/**
 * Identity and access management (SPEC §5.1): tenants, users, sessions, MFA, invitations.
 * Its guard protects every route of the API.
 */
@Module({
  controllers: [AuthController, InvitationAcceptanceController, UserInvitationsController],
  providers: [
    { provide: AUTH_POOL, inject: [ENV], useFactory: (env: Env) => createAuthPool(env) },
    {
      provide: AUTH_DATABASE,
      inject: [AUTH_POOL],
      useFactory: (pool: pg.Pool) => createAuthDatabase(pool),
    },
    IdentityRepository,
    PasswordResetMailer,
    {
      provide: BETTER_AUTH,
      inject: [ENV, AUTH_DATABASE, PasswordResetMailer],
      useFactory: (
        env: Env,
        db: ReturnType<typeof createAuthDatabase>,
        mailer: PasswordResetMailer,
      ) =>
        createBetterAuth({
          secret: env.BETTER_AUTH_SECRET,
          webOrigin: env.WEB_ORIGIN,
          db,
          sendResetPassword: (data) => mailer.send(data),
        }),
    },
    AuthenticationService,
    InvitationService,
    DemoAccountsService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class IamModule implements OnApplicationShutdown {
  constructor(@Inject(AUTH_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
