import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { DATABASE, type Database, withTenantTransaction } from '../../../core/database/database.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { AllowPendingMfa, Public } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { AuthenticationService, type AuthContext } from '../application/authentication.service.js';
import { DemoAccountsService } from '../application/demo-accounts.service.js';
import { tenant } from '../infrastructure/schema.js';
import {
  demoAccountsResult,
  forgotPasswordBody,
  meResult,
  mfaEnrollmentResult,
  passwordBody,
  resetPasswordBody,
  secondFactorBody,
  signInBody,
  signInResult,
  totpCodeBody,
} from './dto.js';
import { CurrentAuth, requestInfo, sendCookies } from './http.js';

/** Authentication routes (docs/API.md §2.2), backed by Better Auth (decision D-031). */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly demoAccounts: DemoAccountsService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Public()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ schema: toOpenApiSchema(signInBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(signInResult) })
  async signIn(
    @Body(new ZodValidationPipe(signInBody)) body: z.infer<typeof signInBody>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<z.infer<typeof signInResult>> {
    const outcome = await this.authentication.signIn(body.email, body.password, requestInfo(req));
    sendCookies(res, outcome.cookies);
    return outcome.result;
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ schema: toOpenApiSchema(secondFactorBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(signInResult) })
  async verifySecondFactor(
    @Body(new ZodValidationPipe(secondFactorBody)) body: z.infer<typeof secondFactorBody>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<z.infer<typeof signInResult>> {
    const outcome = await this.authentication.verifySecondFactor(
      body.code,
      body.method,
      requestInfo(req),
    );
    sendCookies(res, outcome.cookies);
    return outcome.result;
  }

  @AllowPendingMfa()
  @Get('me')
  @ApiOkResponse({ schema: toOpenApiSchema(meResult) })
  async me(@CurrentAuth() auth: AuthContext): Promise<z.infer<typeof meResult>> {
    let tenantInfo: { id: string; legalName: string } | null = null;
    if (auth.tenantId) {
      const [found] = await withTenantTransaction(this.db, auth.tenantId, (tx) =>
        tx.select({ id: tenant.id, legalName: tenant.legalName }).from(tenant),
      );
      tenantInfo = found ?? null;
    }
    return {
      user: {
        id: auth.userId,
        name: auth.name,
        email: auth.email,
        locale: auth.locale === 'fr-FR' ? 'fr-FR' : 'en-GB',
      },
      tenant: tenantInfo,
      roles: auth.roles,
      permissions: Object.fromEntries(auth.permissions),
      portals: auth.portals,
      homePortal: auth.homePortal,
      mfa: { enabled: auth.mfaEnabled, required: auth.mfaRequired },
      sessionExpiresAt: auth.sessionExpiresAt.toISOString(),
    };
  }

  @AllowPendingMfa()
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const outcome = await this.authentication.signOut(auth, requestInfo(req));
    sendCookies(res, outcome.cookies);
  }

  @AllowPendingMfa()
  @Post('mfa/enroll')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ schema: toOpenApiSchema(passwordBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(mfaEnrollmentResult) })
  enrollMfa(
    @Body(new ZodValidationPipe(passwordBody)) body: z.infer<typeof passwordBody>,
    @Req() req: Request,
  ): Promise<z.infer<typeof mfaEnrollmentResult>> {
    return this.authentication.startMfaEnrollment(body.password, requestInfo(req));
  }

  @AllowPendingMfa()
  @Post('mfa/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ schema: toOpenApiSchema(totpCodeBody) })
  async confirmMfa(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(totpCodeBody)) body: z.infer<typeof totpCodeBody>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const outcome = await this.authentication.confirmMfaEnrollment(
      auth,
      body.code,
      requestInfo(req),
    );
    sendCookies(res, outcome.cookies);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ schema: toOpenApiSchema(forgotPasswordBody) })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordBody)) body: z.infer<typeof forgotPasswordBody>,
    @Req() req: Request,
  ): Promise<void> {
    await this.authentication.requestPasswordReset(body.email, requestInfo(req));
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ schema: toOpenApiSchema(resetPasswordBody) })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordBody)) body: z.infer<typeof resetPasswordBody>,
    @Req() req: Request,
  ): Promise<void> {
    await this.authentication.resetPassword(body.token, body.newPassword, requestInfo(req));
  }

  /** Demonstration accounts and current codes (decision D-016); 404 unless DEMO_MODE=true. */
  @Public()
  @Get('demo-accounts')
  @ApiOkResponse({ schema: toOpenApiSchema(demoAccountsResult) })
  demoAccountsList(): Promise<z.infer<typeof demoAccountsResult>> {
    return this.demoAccounts.list();
  }
}
