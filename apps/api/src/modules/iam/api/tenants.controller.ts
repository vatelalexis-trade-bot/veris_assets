import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { z } from 'zod';
import { etagOf, expectedVersion } from '../../../core/http/if-match.js';
import { pageSchema } from '../../../core/http/pagination.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { TenantManagementService } from '../application/tenant-management.service.js';
import {
  idParam,
  invitationCreated,
  listQuery,
  person,
  tenantCreateBody,
  tenantUpdateBody,
  tenantView,
} from './management.dto.js';
import { toTenantView } from './views.js';

const id = new ZodValidationPipe(idParam);
type TenantView = z.infer<typeof tenantView>;

/** Organisations, for the Platform Administrator (docs/API.md §2.3). */
@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantManagementService) {}

  @Get()
  @RequirePermission('tenant:read')
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
  })
  @ApiQuery({ name: 'q', required: false, schema: { type: 'string', maxLength: 100 } })
  @ApiOkResponse({ schema: toOpenApiSchema(pageSchema(tenantView)) })
  async list(@Query(new ZodValidationPipe(listQuery)) query: z.infer<typeof listQuery>) {
    const page = await this.tenants.list({ page: query.page, pageSize: query.pageSize }, query.q);
    return { data: page.data.map(toTenantView), meta: page.meta };
  }

  @Get(':id')
  @RequirePermission('tenant:read')
  @ApiOkResponse({ schema: toOpenApiSchema(tenantView) })
  async get(
    @Param('id', id) tenantId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TenantView> {
    const found = await this.tenants.get(tenantId);
    res.setHeader('ETag', etagOf(found.version));
    return toTenantView(found);
  }

  @Post()
  @RequirePermission('tenant:manage')
  @ApiBody({ schema: toOpenApiSchema(tenantCreateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(tenantView) })
  async create(
    @Body(new ZodValidationPipe(tenantCreateBody)) body: z.infer<typeof tenantCreateBody>,
  ): Promise<TenantView> {
    const { firstAdministrator, ...input } = body;
    return toTenantView(await this.tenants.create(input, firstAdministrator));
  }

  @Patch(':id')
  @RequirePermission('tenant:manage')
  @ApiBody({ schema: toOpenApiSchema(tenantUpdateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(tenantView) })
  async update(
    @Param('id', id) tenantId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(tenantUpdateBody)) body: z.infer<typeof tenantUpdateBody>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TenantView> {
    const updated = await this.tenants.update(tenantId, expectedVersion(ifMatch), body);
    res.setHeader('ETag', etagOf(updated.version));
    return toTenantView(updated);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('tenant:manage')
  @ApiOkResponse({ schema: toOpenApiSchema(tenantView) })
  async activate(@Param('id', id) tenantId: string): Promise<TenantView> {
    return toTenantView(await this.tenants.setStatus(tenantId, 'ACTIVE'));
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('tenant:manage')
  @ApiOkResponse({ schema: toOpenApiSchema(tenantView) })
  async deactivate(@Param('id', id) tenantId: string): Promise<TenantView> {
    return toTenantView(await this.tenants.setStatus(tenantId, 'INACTIVE'));
  }

  /** Another Issuer Administrator for an existing tenant. */
  @Post(':id/administrators')
  @RequirePermission('tenant:manage')
  @ApiBody({ schema: toOpenApiSchema(person) })
  @ApiOkResponse({ schema: toOpenApiSchema(invitationCreated) })
  async inviteAdministrator(
    @Param('id', id) tenantId: string,
    @Body(new ZodValidationPipe(person)) body: z.infer<typeof person>,
  ): Promise<z.infer<typeof invitationCreated>> {
    const created = await this.tenants.inviteAdministrator(tenantId, body);
    return { id: created.id, expiresAt: created.expiresAt.toISOString() };
  }
}
