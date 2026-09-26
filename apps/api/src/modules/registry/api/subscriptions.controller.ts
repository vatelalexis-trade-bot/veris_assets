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
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { expectedVersion } from '../../../core/http/if-match.js';
import { ApiPageQuery, pageSchema } from '../../../core/http/pagination.js';
import { Idempotent } from '../../../core/idempotency/idempotent.decorator.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { SubscriptionsService } from '../application/subscriptions.service.js';
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '../domain/subscription-machine.js';
import {
  cancelBody,
  listQuery,
  reasonBody,
  submitBody,
  subscriptionCreateBody,
  subscriptionUpdateBody,
  subscriptionView,
  toSubscriptionView,
  transitionView,
} from './dto.js';

const id = new ZodValidationPipe(z.uuid());
type View = z.infer<typeof subscriptionView>;

/** Subscriptions (docs/API.md §2.7, SPEC §9). */
@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  @RequirePermission('subscription:read')
  @ApiPageQuery()
  @ApiQuery({ name: 'issuanceId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'investorId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: [...SUBSCRIPTION_STATUSES] },
  })
  @ApiOkResponse({ schema: toOpenApiSchema(pageSchema(subscriptionView)) })
  async list(@Query(new ZodValidationPipe(listQuery)) query: z.infer<typeof listQuery>) {
    const { page, pageSize, ...filters } = query;
    const found = await this.subscriptions.list(filters, { page, pageSize });
    return { data: found.data.map(toSubscriptionView), meta: found.meta };
  }

  /** A draft, by the investor (portal). */
  @Post()
  @Idempotent()
  @RequirePermission('subscription:create')
  @ApiBody({ schema: toOpenApiSchema(subscriptionCreateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(subscriptionView) })
  async create(
    @Body(new ZodValidationPipe(subscriptionCreateBody))
    body: z.infer<typeof subscriptionCreateBody>,
  ): Promise<View> {
    const { issuanceId, ...input } = body;
    return toSubscriptionView(await this.subscriptions.create(issuanceId, input));
  }

  @Get(':id')
  @RequirePermission('subscription:read')
  @ApiOkResponse({ schema: toOpenApiSchema(subscriptionView) })
  async get(@Param('id', id) subscriptionId: string): Promise<View> {
    return toSubscriptionView(await this.subscriptions.get(subscriptionId));
  }

  @Patch(':id')
  @RequirePermission('subscription:create')
  @ApiBody({ schema: toOpenApiSchema(subscriptionUpdateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(subscriptionView) })
  async update(
    @Param('id', id) subscriptionId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(subscriptionUpdateBody))
    body: z.infer<typeof subscriptionUpdateBody>,
  ): Promise<View> {
    return toSubscriptionView(
      await this.subscriptions.update(subscriptionId, expectedVersion(ifMatch), body),
    );
  }

  @Post(':id/submit')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('subscription:create')
  @ApiBody({ schema: toOpenApiSchema(submitBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(subscriptionView) })
  async submit(
    @Param('id', id) subscriptionId: string,
    @Body(new ZodValidationPipe(submitBody)) body: z.infer<typeof submitBody>,
  ): Promise<View> {
    return toSubscriptionView(await this.subscriptions.submit(subscriptionId, body));
  }

  @Post(':id/start-review')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('subscription:review')
  @ApiOkResponse({ schema: toOpenApiSchema(subscriptionView) })
  async startReview(@Param('id', id) subscriptionId: string): Promise<View> {
    return toSubscriptionView(await this.subscriptions.startReview(subscriptionId));
  }

  @Post(':id/approve')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('subscription:approve')
  @ApiOkResponse({ schema: toOpenApiSchema(subscriptionView) })
  async approve(@Param('id', id) subscriptionId: string): Promise<View> {
    return toSubscriptionView(await this.subscriptions.approve(subscriptionId));
  }

  @Post(':id/reject')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('subscription:approve')
  @ApiBody({ schema: toOpenApiSchema(reasonBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(subscriptionView) })
  async reject(
    @Param('id', id) subscriptionId: string,
    @Body(new ZodValidationPipe(reasonBody)) body: z.infer<typeof reasonBody>,
  ): Promise<View> {
    return toSubscriptionView(await this.subscriptions.reject(subscriptionId, body.reason));
  }

  /** The investor before approval (reason optional); the issuer until the payment (reason required). */
  @Post(':id/cancel')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('subscription:cancel')
  @ApiBody({ schema: toOpenApiSchema(cancelBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(subscriptionView) })
  async cancel(
    @Param('id', id) subscriptionId: string,
    @Body(new ZodValidationPipe(cancelBody)) body: z.infer<typeof cancelBody>,
  ): Promise<View> {
    return toSubscriptionView(await this.subscriptions.cancel(subscriptionId, body.reason ?? null));
  }

  @Get(':id/transitions')
  @RequirePermission('subscription:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(transitionView)) })
  async transitions(
    @Param('id', id) subscriptionId: string,
  ): Promise<z.infer<typeof transitionView>[]> {
    return (await this.subscriptions.transitions(subscriptionId)).map((row) => ({
      fromStatus: row.fromStatus as SubscriptionStatus | null,
      toStatus: row.toStatus as SubscriptionStatus,
      actorName: row.actorName,
      actorUserId: row.actorUserId,
      comment: row.comment,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }
}
