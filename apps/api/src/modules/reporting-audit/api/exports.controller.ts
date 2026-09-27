import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { ExportKind, ExportStatus } from '@veris/shared';
import { z } from 'zod';
import { Idempotent } from '../../../core/idempotency/idempotent.decorator.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { ExportsService, type ExportRow } from '../application/exports.service.js';
import { exportCreateBody, exportView } from './reporting-dto.js';

const id = new ZodValidationPipe(z.uuid());
type View = z.infer<typeof exportView>;

function toExportView(row: ExportRow): View {
  return {
    id: row.id,
    kind: row.kind as ExportKind,
    issuanceId: (row.params as { issuanceId?: string }).issuanceId ?? null,
    status: row.status as ExportStatus,
    documentId: row.documentId,
    rowCount: row.rowCount,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/**
 * CSV exports (SPEC §18, P15-3): asked for here, generated in the background, downloaded as a
 * document once ready (`POST /documents/{documentId}/download-url`).
 */
@ApiTags('reporting')
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post()
  @Idempotent()
  @RequirePermission('report:export')
  @ApiBody({ schema: toOpenApiSchema(exportCreateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(exportView) })
  async create(
    @Body(new ZodValidationPipe(exportCreateBody)) body: z.infer<typeof exportCreateBody>,
  ): Promise<View> {
    return toExportView(await this.exports.request(body.kind, body.issuanceId ?? null));
  }

  /** The user's own exports, the latest first. */
  @Get()
  @RequirePermission('report:export')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(exportView)) })
  async list(): Promise<View[]> {
    return (await this.exports.list()).map(toExportView);
  }

  @Get(':id')
  @RequirePermission('report:export')
  @ApiOkResponse({ schema: toOpenApiSchema(exportView) })
  async get(@Param('id', id) exportId: string): Promise<View> {
    return toExportView(await this.exports.get(exportId));
  }
}
