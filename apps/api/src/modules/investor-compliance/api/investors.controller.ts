import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KYC_STATUSES, PROFILE_STATUSES } from '@virtus/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { etagOf, expectedVersion } from '../../../core/http/if-match.js';
import { ApiPageQuery, pageSchema } from '../../../core/http/pagination.js';
import { Idempotent } from '../../../core/idempotency/idempotent.decorator.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { InvestorsService } from '../application/investors.service.js';
import {
  beneficialOwnerBody,
  beneficialOwnerView,
  commentBody,
  commentView,
  investorCreateBody,
  investorListQuery,
  investorUpdateBody,
  investorView,
  representativeBody,
  representativeView,
  toBeneficialOwnerView,
  toCommentView,
  toInvestorView,
  toRepresentativeView,
} from './dto.js';

const id = new ZodValidationPipe(z.uuid());
type InvestorView = z.infer<typeof investorView>;

/** Investors of the organisation (docs/API.md §2.5), for the issuer's staff. */
@ApiTags('investors')
@Controller('investors')
export class InvestorsController {
  constructor(private readonly investors: InvestorsService) {}

  @Get()
  @RequirePermission('investor:read')
  @ApiPageQuery()
  @ApiQuery({ name: 'q', required: false, schema: { type: 'string', maxLength: 100 } })
  @ApiQuery({
    name: 'kycStatus',
    required: false,
    schema: { type: 'string', enum: [...KYC_STATUSES] },
  })
  @ApiQuery({
    name: 'profileStatus',
    required: false,
    schema: { type: 'string', enum: [...PROFILE_STATUSES] },
  })
  @ApiOkResponse({ schema: toOpenApiSchema(pageSchema(investorView)) })
  async list(
    @Query(new ZodValidationPipe(investorListQuery)) query: z.infer<typeof investorListQuery>,
  ) {
    const { page, pageSize, ...filters } = query;
    const found = await this.investors.list(filters, { page, pageSize });
    return { data: found.data.map(toInvestorView), meta: found.meta };
  }

  @Post()
  @Idempotent()
  @RequirePermission('investor:manage')
  @ApiBody({ schema: toOpenApiSchema(investorCreateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(investorView) })
  async create(
    @Body(new ZodValidationPipe(investorCreateBody)) body: z.infer<typeof investorCreateBody>,
  ): Promise<InvestorView> {
    return toInvestorView(await this.investors.create(body));
  }

  @Get(':id')
  @RequirePermission('investor:read')
  @ApiOkResponse({ schema: toOpenApiSchema(investorView) })
  async get(
    @Param('id', id) investorId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<InvestorView> {
    const found = await this.investors.get(investorId);
    res.setHeader('ETag', etagOf(found.version));
    return toInvestorView(found);
  }

  @Patch(':id')
  @RequirePermission('investor:manage')
  @ApiBody({ schema: toOpenApiSchema(investorUpdateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(investorView) })
  async update(
    @Param('id', id) investorId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(investorUpdateBody)) body: z.infer<typeof investorUpdateBody>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<InvestorView> {
    const updated = await this.investors.update(investorId, expectedVersion(ifMatch), body);
    res.setHeader('ETag', etagOf(updated.version));
    return toInvestorView(updated);
  }

  @Get(':id/representatives')
  @RequirePermission('investor-personal-data:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(representativeView)) })
  async representatives(@Param('id', id) investorId: string) {
    return (await this.investors.representatives(investorId)).map(toRepresentativeView);
  }

  @Post(':id/representatives')
  @RequirePermission('investor:manage')
  @ApiBody({ schema: toOpenApiSchema(representativeBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(representativeView) })
  async addRepresentative(
    @Param('id', id) investorId: string,
    @Body(new ZodValidationPipe(representativeBody)) body: z.infer<typeof representativeBody>,
  ) {
    return toRepresentativeView(await this.investors.addRepresentative(investorId, body));
  }

  @Patch(':id/representatives/:representativeId')
  @RequirePermission('investor:manage')
  @ApiBody({ schema: toOpenApiSchema(representativeBody.partial()) })
  @ApiOkResponse({ schema: toOpenApiSchema(representativeView) })
  async updateRepresentative(
    @Param('id', id) investorId: string,
    @Param('representativeId', id) representativeId: string,
    @Body(new ZodValidationPipe(representativeBody.partial()))
    body: Partial<z.infer<typeof representativeBody>>,
  ) {
    return toRepresentativeView(
      await this.investors.updateRepresentative(investorId, representativeId, body),
    );
  }

  @Get(':id/beneficial-owners')
  @RequirePermission('investor-personal-data:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(beneficialOwnerView)) })
  async beneficialOwners(@Param('id', id) investorId: string) {
    return (await this.investors.beneficialOwners(investorId)).map(toBeneficialOwnerView);
  }

  @Post(':id/beneficial-owners')
  @RequirePermission('investor:manage')
  @ApiBody({ schema: toOpenApiSchema(beneficialOwnerBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(beneficialOwnerView) })
  async addBeneficialOwner(
    @Param('id', id) investorId: string,
    @Body(new ZodValidationPipe(beneficialOwnerBody)) body: z.infer<typeof beneficialOwnerBody>,
  ) {
    return toBeneficialOwnerView(await this.investors.addBeneficialOwner(investorId, body));
  }

  @Patch(':id/beneficial-owners/:ownerId')
  @RequirePermission('investor:manage')
  @ApiBody({ schema: toOpenApiSchema(beneficialOwnerBody.partial()) })
  @ApiOkResponse({ schema: toOpenApiSchema(beneficialOwnerView) })
  async updateBeneficialOwner(
    @Param('id', id) investorId: string,
    @Param('ownerId', id) ownerId: string,
    @Body(new ZodValidationPipe(beneficialOwnerBody.partial()))
    body: Partial<z.infer<typeof beneficialOwnerBody>>,
  ) {
    return toBeneficialOwnerView(
      await this.investors.updateBeneficialOwner(investorId, ownerId, body),
    );
  }

  @Get(':id/comments')
  @RequirePermission('investor:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(commentView)) })
  async comments(@Param('id', id) investorId: string) {
    return (await this.investors.comments(investorId)).map(toCommentView);
  }

  @Post(':id/comments')
  @RequirePermission('compliance-comment:create')
  @ApiBody({ schema: toOpenApiSchema(commentBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(commentView) })
  async addComment(
    @Param('id', id) investorId: string,
    @Body(new ZodValidationPipe(commentBody)) body: z.infer<typeof commentBody>,
  ) {
    return toCommentView(
      await this.investors.addComment(investorId, {
        body: body.body,
        ...(body.kycCaseId
          ? { resourceType: 'kyc_case' as const, resourceId: body.kycCaseId }
          : {}),
      }),
    );
  }
}
