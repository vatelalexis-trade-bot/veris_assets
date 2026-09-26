import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { RegistryModule } from '../registry/index.js';
import { AuditEventsController } from './api/audit-events.controller.js';
import { ExportsController } from './api/exports.controller.js';
import { ReportingController } from './api/reporting.controller.js';
import { AuditLogService } from './application/audit-log.service.js';
import { ExportEvents } from './application/export-events.js';
import { ExportsService } from './application/exports.service.js';
import { ReportingService } from './application/reporting.service.js';

/**
 * Audit log consultation, dashboards, the "To do" queue, indicators and CSV exports (phase 15,
 * docs/BACKLOG.md).
 */
@Module({
  imports: [IamModule, RegistryModule],
  providers: [AuditLogService, ReportingService, ExportsService, ExportEvents],
  controllers: [AuditEventsController, ReportingController, ExportsController],
})
export class ReportingAuditModule {}
