import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { InvestorComplianceModule } from '../investor-compliance/index.js';
import { IssuanceModule } from '../issuance/index.js';
import { SubscriptionsController } from './api/subscriptions.controller.js';
import { SubscriptionEvents } from './application/subscription-events.js';
import { SubscriptionsService } from './application/subscriptions.service.js';

/**
 * Subscriptions (phase 11); allocations, positions, the append-only ledger and transfers arrive in
 * phases 12 and 13 (docs/BACKLOG.md).
 */
@Module({
  imports: [IamModule, InvestorComplianceModule, IssuanceModule],
  providers: [SubscriptionsService, SubscriptionEvents],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
})
export class RegistryModule {}
