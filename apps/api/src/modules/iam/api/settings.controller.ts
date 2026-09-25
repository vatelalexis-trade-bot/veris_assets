import { Body, Controller, Get, Headers, Patch, Res } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { z } from 'zod';
import { etagOf, expectedVersion } from '../../../core/http/if-match.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { TenantSettingsService } from '../application/tenant-settings.service.js';
import { settingsUpdateBody, tenantView } from './management.dto.js';
import { toTenantView } from './views.js';

/** Settings of the organisation of the signed-in user (docs/API.md §2.4). */
@ApiTags('users')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: TenantSettingsService) {}

  @Get()
  @RequirePermission('tenant-settings:manage')
  @ApiOkResponse({ schema: toOpenApiSchema(tenantView) })
  async get(@Res({ passthrough: true }) res: Response): Promise<z.infer<typeof tenantView>> {
    const found = await this.settings.get();
    res.setHeader('ETag', etagOf(found.version));
    return toTenantView(found);
  }

  @Patch()
  @RequirePermission('tenant-settings:manage')
  @ApiBody({ schema: toOpenApiSchema(settingsUpdateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(tenantView) })
  async update(
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(settingsUpdateBody)) body: z.infer<typeof settingsUpdateBody>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<z.infer<typeof tenantView>> {
    const updated = await this.settings.update(expectedVersion(ifMatch), body);
    res.setHeader('ETag', etagOf(updated.version));
    return toTenantView(updated);
  }
}
