import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiPageQuery, pageSchema, paginationQuery } from '../../../core/http/pagination.js';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { AuditLogService, type AuditEventWithActor } from '../application/audit-log.service.js';

const result = z.enum(['SUCCESS', 'DENIED', 'FAILED']);

const listQuery = paginationQuery.extend({
  action: z.string().trim().min(1).max(100).optional(),
  resourceType: z.string().trim().min(1).max(100).optional(),
  resourceId: z.uuid().optional(),
  actorUserId: z.uuid().optional(),
  result: result.optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

const auditEventView = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  actorUserId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  action: z.string(),
  resourceType: z.string().nullable(),
  resourceId: z.uuid().nullable(),
  result,
  reason: z.string().nullable(),
  source: z.enum(['WEB', 'API', 'JOB', 'SYSTEM']),
  correlationId: z.uuid().nullable(),
});

const auditEventDetail = auditEventView.extend({
  /** Values before and after the change; sensitive fields are masked. */
  oldValue: z.record(z.string(), z.unknown()).nullable(),
  newValue: z.record(z.string(), z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
});

function toView(row: AuditEventWithActor): z.infer<typeof auditEventView> {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    actorRole: row.actorRole,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    result: row.result as z.infer<typeof result>,
    reason: row.reason,
    source: row.source as z.infer<typeof auditEventView>['source'],
    correlationId: row.correlationId,
  };
}

const id = new ZodValidationPipe(z.uuid());

/** Audit log of the organisation (docs/API.md §2.13). */
@ApiTags('audit')
@Controller('audit-events')
export class AuditEventsController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @RequirePermission('audit:read')
  @ApiPageQuery()
  @ApiQuery({ name: 'action', required: false, schema: { type: 'string' } })
  @ApiQuery({ name: 'resourceType', required: false, schema: { type: 'string' } })
  @ApiQuery({ name: 'resourceId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'actorUserId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'result', required: false, schema: { type: 'string', enum: result.options } })
  @ApiQuery({ name: 'from', required: false, schema: { type: 'string', format: 'date-time' } })
  @ApiQuery({ name: 'to', required: false, schema: { type: 'string', format: 'date-time' } })
  @ApiOkResponse({ schema: toOpenApiSchema(pageSchema(auditEventView)) })
  async list(@Query(new ZodValidationPipe(listQuery)) query: z.infer<typeof listQuery>) {
    const { page, pageSize, from, to, ...filters } = query;
    const found = await this.auditLog.list(
      {
        ...filters,
        ...(from ? { from: new Date(from) } : {}),
        ...(to ? { to: new Date(to) } : {}),
      },
      { page, pageSize },
    );
    return { data: found.data.map(toView), meta: found.meta };
  }

  // Declared before ':id' so that "actions" is never read as an identifier.
  @Get('actions')
  @RequirePermission('audit:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(z.string())) })
  async actions(): Promise<string[]> {
    return this.auditLog.actions();
  }

  @Get(':id')
  @RequirePermission('audit:read')
  @ApiOkResponse({ schema: toOpenApiSchema(auditEventDetail) })
  async get(@Param('id', id) eventId: string): Promise<z.infer<typeof auditEventDetail>> {
    const row = await this.auditLog.get(eventId);
    return {
      ...toView(row),
      oldValue: (row.oldValue as Record<string, unknown> | null) ?? null,
      newValue: (row.newValue as Record<string, unknown> | null) ?? null,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
    };
  }
}
