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
import { TransfersService } from '../application/transfers.service.js';
import { TRANSFER_STATUSES, type TransferStatus } from '../domain/transfer.js';
import { cancelBody, reasonBody, transitionView } from './dto.js';
import {
  toTransferView,
  transferCreateBody,
  transfersQuery,
  transferUpdateBody,
  transferView,
} from './transfers-dto.js';

const id = new ZodValidationPipe(z.uuid());
type View = z.infer<typeof transferView>;
const transferTransitionView = transitionView.extend({
  fromStatus: z.enum(TRANSFER_STATUSES).nullable(),
  toStatus: z.enum(TRANSFER_STATUSES),
});

/** Transfers between investors (docs/API.md §2.9, SPEC §11). */
@ApiTags('transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @RequirePermission('transfer:read')
  @ApiPageQuery()
  @ApiQuery({ name: 'issuanceId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: [...TRANSFER_STATUSES] },
  })
  @ApiOkResponse({ schema: toOpenApiSchema(pageSchema(transferView)) })
  async list(@Query(new ZodValidationPipe(transfersQuery)) query: z.infer<typeof transfersQuery>) {
    const { page, pageSize, ...filters } = query;
    const found = await this.transfers.list(filters, { page, pageSize });
    return { data: found.data.map(toTransferView), meta: found.meta };
  }

  /** A draft by the holder, with the recipient's code (D-010). */
  @Post()
  @Idempotent()
  @RequirePermission('transfer:request')
  @ApiBody({ schema: toOpenApiSchema(transferCreateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(transferView) })
  async create(
    @Body(new ZodValidationPipe(transferCreateBody)) body: z.infer<typeof transferCreateBody>,
  ): Promise<View> {
    const { issuanceId, ...input } = body;
    return toTransferView(await this.transfers.create(issuanceId, input));
  }

  @Get(':id')
  @RequirePermission('transfer:read')
  @ApiOkResponse({ schema: toOpenApiSchema(transferView) })
  async get(@Param('id', id) transferId: string): Promise<View> {
    return toTransferView(await this.transfers.get(transferId));
  }

  @Patch(':id')
  @RequirePermission('transfer:request')
  @ApiBody({ schema: toOpenApiSchema(transferUpdateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(transferView) })
  async update(
    @Param('id', id) transferId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(transferUpdateBody)) body: z.infer<typeof transferUpdateBody>,
  ): Promise<View> {
    return toTransferView(await this.transfers.update(transferId, expectedVersion(ifMatch), body));
  }

  /** Checks of SPEC §11.3, units blocked, then compliance review. */
  @Post(':id/submit')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('transfer:request')
  @ApiOkResponse({ schema: toOpenApiSchema(transferView) })
  async submit(@Param('id', id) transferId: string): Promise<View> {
    return toTransferView(await this.transfers.submit(transferId));
  }

  /** UNBLOCK + TRANSFER, executed at once. */
  @Post(':id/approve')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('transfer:approve')
  @ApiOkResponse({ schema: toOpenApiSchema(transferView) })
  async approve(@Param('id', id) transferId: string): Promise<View> {
    return toTransferView(await this.transfers.approve(transferId));
  }

  @Post(':id/reject')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('transfer:approve')
  @ApiBody({ schema: toOpenApiSchema(reasonBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(transferView) })
  async reject(
    @Param('id', id) transferId: string,
    @Body(new ZodValidationPipe(reasonBody)) body: z.infer<typeof reasonBody>,
  ): Promise<View> {
    return toTransferView(await this.transfers.reject(transferId, body.reason));
  }

  @Post(':id/cancel')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('transfer:cancel')
  @ApiBody({ schema: toOpenApiSchema(cancelBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(transferView) })
  async cancel(
    @Param('id', id) transferId: string,
    @Body(new ZodValidationPipe(cancelBody)) body: z.infer<typeof cancelBody>,
  ): Promise<View> {
    return toTransferView(await this.transfers.cancel(transferId, body.reason ?? null));
  }

  @Get(':id/transitions')
  @RequirePermission('transfer:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(transferTransitionView)) })
  async transitions(
    @Param('id', id) transferId: string,
  ): Promise<z.infer<typeof transferTransitionView>[]> {
    return (await this.transfers.transitions(transferId)).map((row) => ({
      fromStatus: row.fromStatus as TransferStatus | null,
      toStatus: row.toStatus as TransferStatus,
      actorName: row.actorName,
      actorUserId: row.actorUserId,
      comment: row.comment,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }
}
