import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { z } from 'zod';
import { etagOf, expectedVersion } from '../../../core/http/if-match.js';
import { Idempotent } from '../../../core/idempotency/idempotent.decorator.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { InvestorsService } from '../application/investors.service.js';
import { investorView, ownProfileBody, toInvestorView } from './dto.js';

type InvestorView = z.infer<typeof investorView>;

/** Profile of the signed-in investor, in its portal (docs/API.md §2.5, SPEC §4.5). */
@ApiTags('investors')
@Controller('me/investor')
export class MeController {
  constructor(private readonly investors: InvestorsService) {}

  @Get()
  @RequirePermission('profile:manage')
  @ApiOkResponse({ schema: toOpenApiSchema(investorView) })
  async get(@Res({ passthrough: true }) res: Response): Promise<InvestorView> {
    const found = await this.investors.me();
    res.setHeader('ETag', etagOf(found.version));
    return toInvestorView(found);
  }

  @Patch()
  @RequirePermission('profile:manage')
  @ApiBody({ schema: toOpenApiSchema(ownProfileBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(investorView) })
  async update(
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(ownProfileBody)) body: z.infer<typeof ownProfileBody>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<InvestorView> {
    const updated = await this.investors.updateOwnProfile(expectedVersion(ifMatch), body);
    res.setHeader('ETag', etagOf(updated.version));
    return toInvestorView(updated);
  }

  @Post('recipient-code/regenerate')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('profile:manage')
  @ApiOkResponse({ schema: toOpenApiSchema(investorView) })
  async regenerate(): Promise<InvestorView> {
    return toInvestorView(await this.investors.regenerateRecipientCode());
  }
}
