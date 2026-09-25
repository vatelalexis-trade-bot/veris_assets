import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiPageQuery, pageSchema } from '../../../core/http/pagination.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { EligibilityService } from '../application/eligibility.service.js';
import {
  assessmentListQuery,
  assessmentView,
  eligibilityResultView,
  previewBody,
  toAssessmentView,
  toResultView,
} from './eligibility.dto.js';

const id = new ZodValidationPipe(z.uuid());

/** Eligibility decisions (docs/API.md §2.5, SPEC §8.4). */
@ApiTags('eligibility')
@Controller('eligibility-assessments')
export class EligibilityController {
  constructor(private readonly eligibility: EligibilityService) {}

  @Get()
  @RequirePermission('eligibility:read')
  @ApiPageQuery()
  @ApiQuery({ name: 'investorId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'context',
    required: false,
    schema: { type: 'string', enum: ['INVITATION', 'SUBSCRIPTION', 'TRANSFER', 'MANUAL'] },
  })
  @ApiOkResponse({ schema: toOpenApiSchema(pageSchema(assessmentView)) })
  async list(
    @Query(new ZodValidationPipe(assessmentListQuery)) query: z.infer<typeof assessmentListQuery>,
  ) {
    const { page, pageSize, ...filters } = query;
    const found = await this.eligibility.list(filters, { page, pageSize });
    return { data: found.data.map(toAssessmentView), meta: found.meta };
  }

  /** Evaluates the investor against a rule set without recording anything. */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('eligibility:read')
  @ApiBody({ schema: toOpenApiSchema(previewBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(eligibilityResultView) })
  async preview(
    @Body(new ZodValidationPipe(previewBody)) body: z.infer<typeof previewBody>,
  ): Promise<z.infer<typeof eligibilityResultView>> {
    return toResultView(await this.eligibility.preview(body));
  }

  @Get(':id')
  @RequirePermission('eligibility:read')
  @ApiOkResponse({ schema: toOpenApiSchema(assessmentView) })
  async get(@Param('id', id) assessmentId: string): Promise<z.infer<typeof assessmentView>> {
    return toAssessmentView(await this.eligibility.get(assessmentId));
  }
}
