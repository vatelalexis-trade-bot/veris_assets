import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { InvestorComplianceModule } from '../investor-compliance/index.js';
import { IssuanceModule } from '../issuance/index.js';
import { RegistryController } from './api/registry.controller.js';
import { SubscriptionsController } from './api/subscriptions.controller.js';
import { AllocationsService } from './application/allocations.service.js';
import { LedgerWriter } from './application/ledger-writer.js';
import { RegistryQueries } from './application/registry-queries.js';
import { SubscriptionEvents } from './application/subscription-events.js';
import { SubscriptionsService } from './application/subscriptions.service.js';

/**
 * Subscriptions (phase 11); allocations, positions and the append-only ledger (phase 12);
 * transfers arrive in phase 13 (docs/BACKLOG.md).
 */
@Module({
  imports: [IamModule, InvestorComplianceModule, IssuanceModule],
  providers: [
    SubscriptionsService,
    SubscriptionEvents,
    LedgerWriter,
    AllocationsService,
    RegistryQueries,
  ],
  controllers: [SubscriptionsController, RegistryController],
  exports: [SubscriptionsService, LedgerWriter, RegistryQueries],
})
export class RegistryModule {}
