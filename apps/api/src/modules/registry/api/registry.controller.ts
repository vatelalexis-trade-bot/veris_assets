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
import { AllocationsService } from '../application/allocations.service.js';
import { RegistryQueries } from '../application/registry-queries.js';
import { ALLOCATION_ROUND_STATUSES, type AllocationRoundStatus } from '../domain/allocation.js';
import { LEDGER_ENTRY_TYPES } from '../domain/ledger.js';
import { transitionView } from './dto.js';
import {
  allocationRoundUpdateBody,
  allocationRoundView,
  commentBody,
  ledgerEntryView,
  ledgerQuery,
  positionsQuery,
  positionView,
  toAllocationRoundView,
  toLedgerEntryView,
  toPositionView,
} from './registry-dto.js';

const id = new ZodValidationPipe(z.uuid());
type RoundView = z.infer<typeof allocationRoundView>;

const roundTransitionView = transitionView.extend({
  fromStatus: z.enum(ALLOCATION_ROUND_STATUSES).nullable(),
  toStatus: z.enum(ALLOCATION_ROUND_STATUSES),
});

/** Allocation rounds, positions and the ledger (docs/API.md §2.8, SPEC §10). */
@ApiTags('registry')
@Controller()
export class RegistryController {
  constructor(
    private readonly allocations: AllocationsService,
    private readonly registry: RegistryQueries,
  ) {}

  @Get('issuances/:id/allocation-rounds')
  @RequirePermission('registry:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(allocationRoundView)) })
  async rounds(@Param('id', id) issuanceId: string): Promise<RoundView[]> {
    return (await this.allocations.list(issuanceId)).map(toAllocationRoundView);
  }

  /** A draft round, one line per approved subscription prefilled with the requested units. */
  @Post('issuances/:id/allocation-rounds')
  @Idempotent()
  @RequirePermission('allocation:prepare')
  @ApiOkResponse({ schema: toOpenApiSchema(allocationRoundView) })
  async createRound(@Param('id', id) issuanceId: string): Promise<RoundView> {
    return toAllocationRoundView(await this.allocations.create(issuanceId));
  }

  @Get('allocations/:id')
  @RequirePermission('registry:read')
  @ApiOkResponse({ schema: toOpenApiSchema(allocationRoundView) })
  async round(@Param('id', id) roundId: string): Promise<RoundView> {
    return toAllocationRoundView(await this.allocations.get(roundId));
  }

  @Patch('allocations/:id')
  @RequirePermission('allocation:prepare')
  @ApiBody({ schema: toOpenApiSchema(allocationRoundUpdateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(allocationRoundView) })
  async updateRound(
    @Param('id', id) roundId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(allocationRoundUpdateBody))
    body: z.infer<typeof allocationRoundUpdateBody>,
  ): Promise<RoundView> {
    return toAllocationRoundView(
      await this.allocations.update(roundId, expectedVersion(ifMatch), body),
    );
  }

  @Post('allocations/:id/propose')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('allocation:prepare')
  @ApiOkResponse({ schema: toOpenApiSchema(allocationRoundView) })
  async propose(@Param('id', id) roundId: string): Promise<RoundView> {
    return toAllocationRoundView(await this.allocations.propose(roundId));
  }

  /** Four eyes: by an Issuer Administrator other than the preparer (SPEC §4.8). */
  @Post('allocations/:id/validate')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('allocation:validate')
  @ApiOkResponse({ schema: toOpenApiSchema(allocationRoundView) })
  async validate(@Param('id', id) roundId: string): Promise<RoundView> {
    return toAllocationRoundView(await this.allocations.validate(roundId));
  }

  /** Rejected by the validator, or a draft abandoned by its preparer; comment required. */
  @Post('allocations/:id/reject')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('allocation:prepare')
  @ApiBody({ schema: toOpenApiSchema(commentBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(allocationRoundView) })
  async reject(
    @Param('id', id) roundId: string,
    @Body(new ZodValidationPipe(commentBody)) body: z.infer<typeof commentBody>,
  ): Promise<RoundView> {
    return toAllocationRoundView(await this.allocations.reject(roundId, body.comment));
  }

  @Get('allocations/:id/transitions')
  @RequirePermission('registry:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(roundTransitionView)) })
  async transitions(
    @Param('id', id) roundId: string,
  ): Promise<z.infer<typeof roundTransitionView>[]> {
    return (await this.allocations.transitions(roundId)).map((row) => ({
      fromStatus: row.fromStatus as AllocationRoundStatus | null,
      toStatus: row.toStatus as AllocationRoundStatus,
      actorName: row.actorName,
      actorUserId: row.actorUserId,
      comment: row.comment,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  @Get('positions')
  @RequirePermission('registry:read')
  @ApiPageQuery()
  @ApiQuery({ name: 'issuanceId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'investorId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: toOpenApiSchema(pageSchema(positionView)) })
  async positions(
    @Query(new ZodValidationPipe(positionsQuery)) query: z.infer<typeof positionsQuery>,
  ) {
    const { page, pageSize, ...filters } = query;
    const found = await this.registry.positions(filters, { page, pageSize });
    return { data: found.data.map(toPositionView), meta: found.meta };
  }

  @Get('positions/:id')
  @RequirePermission('registry:read')
  @ApiOkResponse({ schema: toOpenApiSchema(positionView) })
  async position(@Param('id', id) positionId: string): Promise<z.infer<typeof positionView>> {
    return toPositionView(await this.registry.position(positionId));
  }

  @Get('ledger')
  @RequirePermission('registry:read')
  @ApiPageQuery()
  @ApiQuery({ name: 'issuanceId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'type',
    required: false,
    schema: { type: 'string', enum: [...LEDGER_ENTRY_TYPES] },
  })
  @ApiOkResponse({ schema: toOpenApiSchema(pageSchema(ledgerEntryView)) })
  async ledger(@Query(new ZodValidationPipe(ledgerQuery)) query: z.infer<typeof ledgerQuery>) {
    const { page, pageSize, ...filters } = query;
    const found = await this.registry.entries(filters, { page, pageSize });
    return { data: found.data.map(toLedgerEntryView), meta: found.meta };
  }

  @Get('ledger/:id')
  @RequirePermission('registry:read')
  @ApiOkResponse({ schema: toOpenApiSchema(ledgerEntryView) })
  async entry(@Param('id', id) entryId: string): Promise<z.infer<typeof ledgerEntryView>> {
    return toLedgerEntryView(await this.registry.entry(entryId));
  }
}
