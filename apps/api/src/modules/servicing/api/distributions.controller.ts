import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { currentUser } from '../../../core/context/request-context.js';
import { AppError } from '../../../core/errors/app-error.js';
import { ApiPageQuery, pageSchema } from '../../../core/http/pagination.js';
import { Idempotent } from '../../../core/idempotency/idempotent.decorator.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { DistributionsService } from '../application/distributions.service.js';
import { SchedulesService } from '../application/schedules.service.js';
import { DISTRIBUTION_STATUSES, type DistributionStatus } from '../domain/distribution.js';
import {
  commentBody,
  distributionCreateBody,
  distributionsQuery,
  distributionView,
  lineView,
  recalculationView,
  scheduleView,
  toDistributionView,
  toLineView,
  toRecalculationView,
  toScheduleView,
} from './dto.js';

const id = new ZodValidationPipe(z.uuid());
type View = z.infer<typeof distributionView>;
const transitionView = z.object({
  fromStatus: z.enum(DISTRIBUTION_STATUSES).nullable(),
  toStatus: z.enum(DISTRIBUTION_STATUSES),
  actorName: z.string().nullable(),
  actorUserId: z.uuid().nullable(),
  comment: z.string().nullable(),
  occurredAt: z.iso.datetime(),
});

/** Activation, coupon schedule and distributions (docs/API.md §2.10, SPEC §12). */
@ApiTags('distributions')
@Controller()
export class DistributionsController {
  constructor(
    private readonly schedules: SchedulesService,
    private readonly distributions: DistributionsService,
  ) {}

  /** ALLOCATED → ACTIVE once every subscription is paid; the coupon schedule is generated. */
  @Post('issuances/:id/activate')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('issuance:operate')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(scheduleView)) })
  async activate(@Param('id', id) issuanceId: string): Promise<z.infer<typeof scheduleView>[]> {
    await this.schedules.activate(issuanceId);
    return (await this.schedules.list(issuanceId)).map(toScheduleView);
  }

  @Get('issuances/:id/coupon-schedule')
  @RequirePermission('distribution:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(scheduleView)) })
  async schedule(@Param('id', id) issuanceId: string): Promise<z.infer<typeof scheduleView>[]> {
    return (await this.schedules.list(issuanceId)).map(toScheduleView);
  }

  @Get('distributions')
  @RequirePermission('distribution:read')
  @ApiPageQuery()
  @ApiQuery({ name: 'issuanceId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: [...DISTRIBUTION_STATUSES] },
  })
  @ApiOkResponse({ schema: toOpenApiSchema(pageSchema(distributionView)) })
  async list(
    @Query(new ZodValidationPipe(distributionsQuery)) query: z.infer<typeof distributionsQuery>,
  ) {
    const { page, pageSize, ...filters } = query;
    const found = await this.distributions.list(filters, { page, pageSize });
    return { data: found.data.map(toDistributionView), meta: found.meta };
  }

  /** A draft distribution of a scheduled payment. */
  @Post('distributions')
  @Idempotent()
  @RequirePermission('distribution:prepare')
  @ApiBody({ schema: toOpenApiSchema(distributionCreateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(distributionView) })
  async create(
    @Body(new ZodValidationPipe(distributionCreateBody))
    body: z.infer<typeof distributionCreateBody>,
  ): Promise<View> {
    return toDistributionView(await this.distributions.create(body.couponScheduleId));
  }

  @Get('distributions/:id')
  @RequirePermission('distribution:read')
  @ApiOkResponse({ schema: toOpenApiSchema(distributionView) })
  async get(@Param('id', id) distributionId: string): Promise<View> {
    return toDistributionView(await this.distributions.get(distributionId));
  }

  /** The lines of the current calculation; an investor sees its own only. */
  @Get('distributions/:id/lines')
  @RequirePermission('distribution:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(lineView)) })
  async lines(@Param('id', id) distributionId: string): Promise<z.infer<typeof lineView>[]> {
    return (await this.distributions.lines(distributionId)).map(toLineView);
  }

  @Post('distributions/:id/calculate')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('distribution:prepare')
  @ApiOkResponse({ schema: toOpenApiSchema(distributionView) })
  async calculate(@Param('id', id) distributionId: string): Promise<View> {
    return toDistributionView(await this.distributions.calculate(distributionId));
  }

  @Post('distributions/:id/submit-for-review')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('distribution:prepare')
  @ApiOkResponse({ schema: toOpenApiSchema(distributionView) })
  async submit(@Param('id', id) distributionId: string): Promise<View> {
    return toDistributionView(await this.distributions.submit(distributionId));
  }

  /** Four eyes: another Issuer Administrator than the one who submitted it. */
  @Post('distributions/:id/approve')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('distribution:approve')
  @ApiOkResponse({ schema: toOpenApiSchema(distributionView) })
  async approve(@Param('id', id) distributionId: string): Promise<View> {
    return toDistributionView(await this.distributions.approve(distributionId));
  }

  @Post('distributions/:id/return-to-draft')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('distribution:approve')
  @ApiBody({ schema: toOpenApiSchema(commentBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(distributionView) })
  async returnToDraft(
    @Param('id', id) distributionId: string,
    @Body(new ZodValidationPipe(commentBody)) body: z.infer<typeof commentBody>,
  ): Promise<View> {
    return toDistributionView(await this.distributions.returnToDraft(distributionId, body.comment));
  }

  @Post('distributions/:id/cancel')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('distribution:cancel')
  @ApiBody({ schema: toOpenApiSchema(commentBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(distributionView) })
  async cancel(
    @Param('id', id) distributionId: string,
    @Body(new ZodValidationPipe(commentBody)) body: z.infer<typeof commentBody>,
  ): Promise<View> {
    return toDistributionView(await this.distributions.cancel(distributionId, body.comment));
  }

  /** Calculated again from the snapshot, without writing anything (SPEC §12.3). */
  @Post('distributions/:id/recalculate-check')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('distribution:read')
  @ApiOkResponse({ schema: toOpenApiSchema(recalculationView) })
  async recalculationCheck(
    @Param('id', id) distributionId: string,
  ): Promise<z.infer<typeof recalculationView>> {
    if (currentUser().permissions.get('distribution:read') === 'own')
      throw new AppError('RESOURCE_NOT_FOUND');
    return toRecalculationView(await this.distributions.recalculationCheck(distributionId));
  }

  @Get('distributions/:id/transitions')
  @RequirePermission('distribution:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(transitionView)) })
  async transitions(
    @Param('id', id) distributionId: string,
  ): Promise<z.infer<typeof transitionView>[]> {
    return (await this.distributions.transitions(distributionId)).map((row) => ({
      fromStatus: row.fromStatus as DistributionStatus | null,
      toStatus: row.toStatus as DistributionStatus,
      actorName: row.actorName,
      actorUserId: row.actorUserId,
      comment: row.comment,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  /** The fictitious payment instruction (SPEC §12.5); again after a failed payment. */
  @Post('distributions/:id/payment-instruction')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('distribution:prepare')
  @ApiOkResponse({ schema: toOpenApiSchema(distributionView) })
  async generateInstruction(@Param('id', id) distributionId: string): Promise<View> {
    return toDistributionView(await this.distributions.generateInstruction(distributionId));
  }

  @Post('distributions/:id/payment-instruction/prepare')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('distribution:prepare')
  @ApiOkResponse({ schema: toOpenApiSchema(distributionView) })
  async prepareInstruction(@Param('id', id) distributionId: string): Promise<View> {
    return toDistributionView(await this.distributions.prepareInstruction(distributionId));
  }

  /** Four eyes: never by the one who prepared the instruction. */
  @Post('distributions/:id/payment-instruction/confirm')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('payment:confirm')
  @ApiOkResponse({ schema: toOpenApiSchema(distributionView) })
  async confirmInstruction(@Param('id', id) distributionId: string): Promise<View> {
    return toDistributionView(await this.distributions.confirmInstruction(distributionId));
  }

  /** CSV of the payment instruction, with the demonstration mention. */
  @Get('distributions/:id/payment-instruction/csv')
  @RequirePermission('distribution:prepare')
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string' } })
  async csv(
    @Param('id', id) distributionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const file = await this.distributions.csv(distributionId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return file.content;
  }
}
