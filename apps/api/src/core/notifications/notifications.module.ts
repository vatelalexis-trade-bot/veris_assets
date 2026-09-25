import { Global, Module } from '@nestjs/common';
import { Outbox } from '../outbox/outbox.js';
import { OutboxRelay } from '../outbox/outbox-relay.js';
import { Workflow } from '../workflow/workflow.js';
import { NotificationEmails } from './notification-emails.js';
import { NotificationService } from './notification.service.js';
import { NotificationsController } from './notifications.controller.js';

/**
 * Business events and their consequences (docs/ARCHITECTURE.md §4.9): outbox, relay, in-app
 * notifications and their emails, plus the recording of status transitions.
 */
@Global()
@Module({
  providers: [Outbox, OutboxRelay, NotificationService, NotificationEmails, Workflow],
  controllers: [NotificationsController],
  exports: [Outbox, OutboxRelay, NotificationService, NotificationEmails, Workflow],
})
export class NotificationsModule {}
