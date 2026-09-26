import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { toLedgerEntryView } from '../../registry/index.js';
import { ReportingService } from '../application/reporting.service.js';
import {
  investorOverviewView,
  investorPositionView,
  issuerDashboardView,
  platformMetricsView,
  taskView,
} from './reporting-dto.js';

const id = new ZodValidationPipe(z.uuid());

/** Dashboards, "To do" queue and indicators (SPEC §13.1, §13.5, §14.1, §14.3, §18). */
@ApiTags('reporting')
@Controller()
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('dashboard')
  @RequirePermission('report:read')
  @ApiOkResponse({ schema: toOpenApiSchema(issuerDashboardView) })
  async dashboard(): Promise<z.infer<typeof issuerDashboardView>> {
    const found = await this.reporting.issuerDashboard();
    return {
      ...found,
      upcomingPayments: found.upcomingPayments.map((row) => ({
        ...row,
        type: row.type as 'COUPON' | 'PRINCIPAL',
      })),
      recentActivity: found.recentActivity.map((row) => ({
        id: row.id,
        action: row.action,
        actorName: row.actorName,
        resourceType: row.resourceType,
        occurredAt: row.occurredAt.toISOString(),
        result: row.result,
      })),
    };
  }

  /** What waits for the user's decision, the most urgent first. */
  @Get('tasks')
  @RequirePermission('task:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(taskView)) })
  async tasks(): Promise<z.infer<typeof taskView>[]> {
    return (await this.reporting.tasks()).map((row) => ({
      kind: row.kind,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      reference: row.reference,
      waitingSince: row.waitingSince?.toISOString() ?? null,
      dueDate: row.dueDate,
    }));
  }

  @Get('platform/metrics')
  @RequirePermission('platform-metrics:read')
  @ApiOkResponse({ schema: toOpenApiSchema(platformMetricsView) })
  metrics(): Promise<z.infer<typeof platformMetricsView>> {
    return this.reporting.platformMetrics();
  }

  /** The investor's dashboard: its own positions and requests. */
  @Get('me/portfolio')
  @RequirePermission('registry:read')
  @ApiOkResponse({ schema: toOpenApiSchema(investorOverviewView) })
  async portfolio(): Promise<z.infer<typeof investorOverviewView>> {
    const found = await this.reporting.investorOverview();
    return {
      ...found,
      pendingRequests: found.pendingRequests.map((row) => ({
        kind: row.kind as 'SUBSCRIPTION' | 'TRANSFER',
        resourceId: row.resourceId,
        reference: row.reference,
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  @Get('me/portfolio/:id')
  @RequirePermission('registry:read')
  @ApiOkResponse({ schema: toOpenApiSchema(investorPositionView) })
  async position(
    @Param('id', id) positionId: string,
  ): Promise<z.infer<typeof investorPositionView>> {
    const found = await this.reporting.investorPosition(positionId);
    return {
      ...found,
      movements: found.movements.map(toLedgerEntryView),
      distributions: found.distributions.map((row) => ({
        ...row,
        type: row.type as 'COUPON' | 'PRINCIPAL',
      })),
    };
  }
}
