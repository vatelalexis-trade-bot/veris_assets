import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Idempotent } from '../../../core/idempotency/idempotent.decorator.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import type { AuthContext } from '../application/authentication.service.js';
import { BreakGlass } from '../application/break-glass.js';
import { CurrentAuth } from './http.js';
import { breakGlassView, idParam } from './management.dto.js';

const id = new ZodValidationPipe(idParam);
const startBody = z.strictObject({ reason: z.string().trim().min(10).max(500) });

/**
 * Emergency access of a Platform Administrator to one organisation (SPEC §4.1, P16-6, D-103):
 * read-only, one hour, traced in the organisation's audit log.
 */
@ApiTags('tenants')
@Controller()
export class BreakGlassController {
  constructor(private readonly breakGlass: BreakGlass) {}

  @Post('tenants/:id/break-glass')
  @Idempotent()
  @RequirePermission('break-glass:request')
  @ApiBody({ schema: toOpenApiSchema(startBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(breakGlassView) })
  async start(
    @CurrentAuth() auth: AuthContext,
    @Param('id', id) tenantId: string,
    @Body(new ZodValidationPipe(startBody)) body: z.infer<typeof startBody>,
  ): Promise<z.infer<typeof breakGlassView>> {
    return this.breakGlass.start(auth.userId, tenantId, body.reason);
  }

  /** Ends the access before it expires; nothing happens when none is open. */
  @Delete('break-glass')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('break-glass:request')
  async end(@CurrentAuth() auth: AuthContext): Promise<void> {
    await this.breakGlass.end(auth.userId);
  }
}
