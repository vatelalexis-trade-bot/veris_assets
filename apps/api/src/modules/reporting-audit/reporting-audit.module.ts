import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { AuditEventsController } from './api/audit-events.controller.js';
import { AuditLogService } from './application/audit-log.service.js';

/**
 * Dashboards, indicators, exports and audit log consultation. The audit log arrives in phase 7;
 * the rest in later phases (docs/BACKLOG.md).
 */
@Module({
  imports: [IamModule],
  providers: [AuditLogService],
  controllers: [AuditEventsController],
})
export class ReportingAuditModule {}
