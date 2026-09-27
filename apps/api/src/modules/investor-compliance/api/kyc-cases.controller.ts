import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KYC_CASE_STATUSES } from '@veris/shared';
import { z } from 'zod';
import { ApiPageQuery, pageSchema } from '../../../core/http/pagination.js';
import { Idempotent } from '../../../core/idempotency/idempotent.decorator.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { KycService } from '../application/kyc.service.js';
import {
  kycApproveBody,
  kycAttachBody,
  kycCaseDetail,
  kycCaseListItem,
  kycCommentBody,
  kycListQuery,
  kycOpenBody,
  toKycCaseDetail,
  toKycCaseView,
} from './dto.js';

const id = new ZodValidationPipe(z.uuid());
type Detail = z.infer<typeof kycCaseDetail>;

/** KYC/KYB cases (docs/API.md §2.5, SPEC §8.2). */
@ApiTags('kyc')
@Controller('kyc-cases')
export class KycCasesController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  @RequirePermission('kyc:read')
  @ApiPageQuery()
  @ApiQuery({ name: 'investorId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: [...KYC_CASE_STATUSES] },
  })
  @ApiOkResponse({ schema: toOpenApiSchema(pageSchema(kycCaseListItem)) })
  async list(@Query(new ZodValidationPipe(kycListQuery)) query: z.infer<typeof kycListQuery>) {
    const { page, pageSize, ...filters } = query;
    const found = await this.kyc.list(filters, { page, pageSize });
    return {
      data: found.data.map((row) => ({ ...toKycCaseView(row), investorName: row.investorName })),
      meta: found.meta,
    };
  }

  @Post()
  @Idempotent()
  @RequirePermission('kyc:prepare')
  @ApiBody({ schema: toOpenApiSchema(kycOpenBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(kycCaseDetail) })
  async open(
    @Body(new ZodValidationPipe(kycOpenBody)) body: z.infer<typeof kycOpenBody>,
  ): Promise<Detail> {
    return toKycCaseDetail(await this.kyc.open(body.investorId));
  }

  @Get(':id')
  @RequirePermission('kyc:read')
  @ApiOkResponse({ schema: toOpenApiSchema(kycCaseDetail) })
  async get(@Param('id', id) caseId: string): Promise<Detail> {
    return toKycCaseDetail(await this.kyc.get(caseId));
  }

  @Post(':id/documents')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('kyc:prepare')
  @ApiBody({ schema: toOpenApiSchema(kycAttachBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(kycCaseDetail) })
  async attach(
    @Param('id', id) caseId: string,
    @Body(new ZodValidationPipe(kycAttachBody)) body: z.infer<typeof kycAttachBody>,
  ): Promise<Detail> {
    return toKycCaseDetail(await this.kyc.attachDocument(caseId, body));
  }

  @Post(':id/submit-for-review')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('kyc:prepare')
  @ApiOkResponse({ schema: toOpenApiSchema(kycCaseDetail) })
  async submit(@Param('id', id) caseId: string): Promise<Detail> {
    return toKycCaseDetail(await this.kyc.submit(caseId));
  }

  @Post(':id/approve')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('kyc:decide')
  @ApiBody({ schema: toOpenApiSchema(kycApproveBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(kycCaseDetail) })
  async approve(
    @Param('id', id) caseId: string,
    @Body(new ZodValidationPipe(kycApproveBody)) body: z.infer<typeof kycApproveBody>,
  ): Promise<Detail> {
    return toKycCaseDetail(await this.kyc.approve(caseId, body.comment));
  }

  @Post(':id/reject')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('kyc:decide')
  @ApiBody({ schema: toOpenApiSchema(kycCommentBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(kycCaseDetail) })
  async reject(
    @Param('id', id) caseId: string,
    @Body(new ZodValidationPipe(kycCommentBody)) body: z.infer<typeof kycCommentBody>,
  ): Promise<Detail> {
    return toKycCaseDetail(await this.kyc.reject(caseId, body.comment));
  }

  @Post(':id/send-back')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('kyc:decide')
  @ApiBody({ schema: toOpenApiSchema(kycCommentBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(kycCaseDetail) })
  async sendBack(
    @Param('id', id) caseId: string,
    @Body(new ZodValidationPipe(kycCommentBody)) body: z.infer<typeof kycCommentBody>,
  ): Promise<Detail> {
    return toKycCaseDetail(await this.kyc.sendBack(caseId, body.comment));
  }
}
