import { Injectable, type OnModuleInit } from '@nestjs/common';
import { OutboxRelay } from '../../../core/outbox/outbox-relay.js';
import { EXPORT_EVENTS } from './exports.service.js';

/** The requester of an export is told when it is ready. */
@Injectable()
export class ExportEvents implements OnModuleInit {
  constructor(private readonly relay: OutboxRelay) {}

  onModuleInit(): void {
    this.relay.on(EXPORT_EVENTS.ready, (_tx, event) => {
      const { requestedBy } = event.payload as { requestedBy: string };
      return Promise.resolve([
        {
          userId: requestedBy,
          type: 'EXPORT_READY',
          resourceType: 'export',
          resourceId: event.aggregateId,
        },
      ]);
    });
  }
}
