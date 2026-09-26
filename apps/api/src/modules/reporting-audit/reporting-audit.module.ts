import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { RegistryModule } from '../registry/index.js';
import { AuditEventsController } from './api/audit-events.controller.js';
import { ReportingController } from './api/reporting.controller.js';
import { AuditLogService } from './application/audit-log.service.js';
import { ReportingService } from './application/reporting.service.js';

/**
 * Audit log consultation, dashboards, the "To do" queue and indicators (phase 15); exports arrive
 * in phase 15b (docs/BACKLOG.md).
 */
@Module({
  imports: [IamModule, RegistryModule],
  providers: [AuditLogService, ReportingService],
  controllers: [AuditEventsController, ReportingController],
})
export class ReportingAuditModule {}
