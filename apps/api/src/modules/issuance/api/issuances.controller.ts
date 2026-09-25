import {
  Body,
  Controller,
  Delete,
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
import { ASSET_CATEGORIES, ISSUANCE_STATUSES, type IssuanceStatus } from '@virtus/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { etagOf, expectedVersion } from '../../../core/http/if-match.js';
import { ApiPageQuery, pageSchema } from '../../../core/http/pagination.js';
import { Idempotent } from '../../../core/idempotency/idempotent.decorator.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { InvitationsService } from '../application/invitations.service.js';
import { IssuancesService, type IssuanceDetail } from '../application/issuances.service.js';
import {
  attachBody,
  checksView,
  commentBody,
  invitationView,
  inviteBody,
  issuanceCreateBody,
  issuanceDocumentView,
  issuanceUpdateBody,
  issuanceView,
  listQuery,
  rulesBody,
  termsBody,
  toIssuanceView,
  transitionView,
} from './dto.js';

const id = new ZodValidationPipe(z.uuid());
type IssuanceView = z.infer<typeof issuanceView>;

/** The ETag of an issuance changes with any of its parts (general, terms, rules). */
function etagOfIssuance(detail: IssuanceDetail): string {
  return etagOf(
    detail.issuance.version * 1_000_000 + detail.terms.version * 1_000 + detail.rules.version,
  );
}

/** Issuances (docs/API.md §2.6, SPEC §6, §7). */
@ApiTags('issuances')
@Controller('issuances')
export class IssuancesController {
  constructor(
    private readonly issuances: IssuancesService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get()
  @RequirePermission('issuance:read')
  @ApiPageQuery()
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: [...ISSUANCE_STATUSES] },
  })
  @ApiQuery({
    name: 'assetCategory',
    required: false,
    schema: { type: 'string', enum: [...ASSET_CATEGORIES] },
  })
  @ApiQuery({ name: 'currency', required: false, schema: { type: 'string' } })
  @ApiQuery({ name: 'q', required: false, schema: { type: 'string', maxLength: 100 } })
  @ApiOkResponse({ schema: toOpenApiSchema(pageSchema(issuanceView)) })
  async list(@Query(new ZodValidationPipe(listQuery)) query: z.infer<typeof listQuery>) {
    const { page, pageSize, ...filters } = query;
    const found = await this.issuances.list(filters, { page, pageSize });
    return { data: found.data.map(toIssuanceView), meta: found.meta };
  }

  @Post()
  @Idempotent()
  @RequirePermission('issuance:edit')
  @ApiBody({ schema: toOpenApiSchema(issuanceCreateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(issuanceView) })
  async create(
    @Body(new ZodValidationPipe(issuanceCreateBody)) body: z.infer<typeof issuanceCreateBody>,
  ): Promise<IssuanceView> {
    return toIssuanceView(await this.issuances.create(body));
  }

  @Get(':id')
  @RequirePermission('issuance:read')
  @ApiOkResponse({ schema: toOpenApiSchema(issuanceView) })
  async get(
    @Param('id', id) issuanceId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IssuanceView> {
    const found = await this.issuances.get(issuanceId);
    res.setHeader('ETag', etagOfIssuance(found));
    return toIssuanceView(found);
  }

  /** Step 1 of the wizard (auto-saved). If-Match: the issuance's `version`. */
  @Patch(':id')
  @RequirePermission('issuance:edit')
  @ApiBody({ schema: toOpenApiSchema(issuanceUpdateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(issuanceView) })
  async update(
    @Param('id', id) issuanceId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(issuanceUpdateBody)) body: z.infer<typeof issuanceUpdateBody>,
  ): Promise<IssuanceView> {
    return toIssuanceView(
      await this.issuances.updateGeneral(issuanceId, expectedVersion(ifMatch), body),
    );
  }

  /** Steps 2 and 4. If-Match: `terms.version`. */
  @Patch(':id/terms')
  @RequirePermission('issuance:edit')
  @ApiBody({ schema: toOpenApiSchema(termsBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(issuanceView) })
  async updateTerms(
    @Param('id', id) issuanceId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(termsBody)) body: z.infer<typeof termsBody>,
  ): Promise<IssuanceView> {
    return toIssuanceView(
      await this.issuances.updateTerms(issuanceId, expectedVersion(ifMatch), body),
    );
  }

  /** Step 3. If-Match: `eligibilityRules.version`. */
  @Patch(':id/eligibility-rules')
  @RequirePermission('issuance:edit')
  @ApiBody({ schema: toOpenApiSchema(rulesBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(issuanceView) })
  async updateRules(
    @Param('id', id) issuanceId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(rulesBody)) body: z.infer<typeof rulesBody>,
  ): Promise<IssuanceView> {
    return toIssuanceView(
      await this.issuances.updateRules(issuanceId, expectedVersion(ifMatch), body),
    );
  }

  /** Checks of SPEC §6.3 without submitting. */
  @Post(':id/validate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('issuance:edit')
  @ApiOkResponse({ schema: toOpenApiSchema(checksView) })
  async validate(@Param('id', id) issuanceId: string): Promise<z.infer<typeof checksView>> {
    const failures = await this.issuances.validate(issuanceId);
    return {
      consistent: failures.length === 0,
      failures: failures.map((failure) => ({ code: failure.code, field: failure.field ?? null })),
    };
  }

  @Post(':id/submit')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('issuance:submit')
  @ApiOkResponse({ schema: toOpenApiSchema(issuanceView) })
  async submit(@Param('id', id) issuanceId: string): Promise<IssuanceView> {
    return toIssuanceView(await this.issuances.submit(issuanceId));
  }

  @Post(':id/approve')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('issuance:approve')
  @ApiOkResponse({ schema: toOpenApiSchema(issuanceView) })
  async approve(@Param('id', id) issuanceId: string): Promise<IssuanceView> {
    return toIssuanceView(await this.issuances.approve(issuanceId));
  }

  @Post(':id/return-to-draft')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('issuance:approve')
  @ApiBody({ schema: toOpenApiSchema(commentBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(issuanceView) })
  async returnToDraft(
    @Param('id', id) issuanceId: string,
    @Body(new ZodValidationPipe(commentBody)) body: z.infer<typeof commentBody>,
  ): Promise<IssuanceView> {
    return toIssuanceView(await this.issuances.returnToDraft(issuanceId, body.comment));
  }

  @Post(':id/open-subscription')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('issuance:operate')
  @ApiOkResponse({ schema: toOpenApiSchema(issuanceView) })
  async openSubscription(@Param('id', id) issuanceId: string): Promise<IssuanceView> {
    return toIssuanceView(await this.issuances.openSubscription(issuanceId));
  }

  @Post(':id/close-subscription')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('issuance:operate')
  @ApiOkResponse({ schema: toOpenApiSchema(issuanceView) })
  async closeSubscription(@Param('id', id) issuanceId: string): Promise<IssuanceView> {
    return toIssuanceView(await this.issuances.closeSubscription(issuanceId));
  }

  @Post(':id/cancel')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('issuance:cancel')
  @ApiBody({ schema: toOpenApiSchema(commentBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(issuanceView) })
  async cancel(
    @Param('id', id) issuanceId: string,
    @Body(new ZodValidationPipe(commentBody)) body: z.infer<typeof commentBody>,
  ): Promise<IssuanceView> {
    return toIssuanceView(await this.issuances.cancel(issuanceId, body.comment));
  }

  @Get(':id/transitions')
  @RequirePermission('issuance:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(transitionView)) })
  async transitions(
    @Param('id', id) issuanceId: string,
  ): Promise<z.infer<typeof transitionView>[]> {
    return (await this.issuances.transitions(issuanceId)).map((row) => ({
      fromStatus: row.fromStatus as IssuanceStatus | null,
      toStatus: row.toStatus as IssuanceStatus,
      actorUserId: row.actorUserId,
      actorName: row.actorName,
      actorRole: row.actorRole,
      comment: row.comment,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  @Get(':id/documents')
  @RequirePermission('issuance:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(issuanceDocumentView)) })
  async documents(@Param('id', id) issuanceId: string) {
    return (await this.issuances.listDocuments(issuanceId)) as z.infer<
      typeof issuanceDocumentView
    >[];
  }

  /** Step 5: attaches a document uploaded for this issuance. */
  @Post(':id/documents')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('issuance:edit')
  @ApiBody({ schema: toOpenApiSchema(attachBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(issuanceDocumentView)) })
  async attach(
    @Param('id', id) issuanceId: string,
    @Body(new ZodValidationPipe(attachBody)) body: z.infer<typeof attachBody>,
  ) {
    return (await this.issuances.attachDocument(issuanceId, body)) as z.infer<
      typeof issuanceDocumentView
    >[];
  }

  @Get(':id/invitations')
  @RequirePermission('invitation:manage')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(invitationView)) })
  async invitationsOf(
    @Param('id', id) issuanceId: string,
  ): Promise<z.infer<typeof invitationView>[]> {
    return (await this.invitations.list(issuanceId)).map((row) => ({
      ...row,
      status: row.status as 'INVITED' | 'REVOKED',
      invitedAt: row.invitedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
    }));
  }

  /** Invites an investor after an eligibility check (refused with the failed rules otherwise). */
  @Post(':id/invitations')
  @Idempotent()
  @RequirePermission('invitation:manage')
  @ApiBody({ schema: toOpenApiSchema(inviteBody) })
  @ApiOkResponse({
    schema: toOpenApiSchema(z.object({ id: z.uuid(), status: z.enum(['INVITED']) })),
  })
  async invite(
    @Param('id', id) issuanceId: string,
    @Body(new ZodValidationPipe(inviteBody)) body: z.infer<typeof inviteBody>,
  ) {
    const invitation = await this.invitations.invite(issuanceId, body.investorId);
    return { id: invitation.id, status: 'INVITED' as const };
  }

  @Delete(':id/invitations/:invitationId')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('invitation:manage')
  @ApiOkResponse({
    schema: toOpenApiSchema(z.object({ id: z.uuid(), status: z.enum(['REVOKED']) })),
  })
  async revoke(
    @Param('id', id) issuanceId: string,
    @Param('invitationId', id) invitationId: string,
  ) {
    const revoked = await this.invitations.revoke(issuanceId, invitationId);
    return { id: revoked.id, status: 'REVOKED' as const };
  }
}
