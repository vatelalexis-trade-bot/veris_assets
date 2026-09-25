import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { Public } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { InvitationService } from '../application/invitation.service.js';
import { invitationPreview, passwordBody, signInResult } from './dto.js';
import { requestInfo, sendCookies } from './http.js';

const tokenParam = new ZodValidationPipe(z.string().min(20).max(128));

@ApiTags('auth')
@Controller('auth/invitations')
export class InvitationAcceptanceController {
  constructor(private readonly invitations: InvitationService) {}

  @Public()
  @Get(':token')
  @ApiOkResponse({ schema: toOpenApiSchema(invitationPreview) })
  async preview(
    @Param('token', tokenParam) token: string,
  ): Promise<z.infer<typeof invitationPreview>> {
    const found = await this.invitations.preview(token);
    return { ...found, expiresAt: found.expiresAt.toISOString() };
  }

  @Public()
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ schema: toOpenApiSchema(passwordBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(signInResult) })
  async accept(
    @Param('token', tokenParam) token: string,
    @Body(new ZodValidationPipe(passwordBody)) body: z.infer<typeof passwordBody>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<z.infer<typeof signInResult>> {
    const outcome = await this.invitations.accept(token, body.password, requestInfo(req));
    sendCookies(res, outcome.cookies);
    return outcome.result;
  }
}
