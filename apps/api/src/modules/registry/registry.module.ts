import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { InvestorComplianceModule } from '../investor-compliance/index.js';
import { IssuanceModule } from '../issuance/index.js';
import { RegistryController } from './api/registry.controller.js';
import { SubscriptionsController } from './api/subscriptions.controller.js';
import { TransfersController } from './api/transfers.controller.js';
import { AllocationsService } from './application/allocations.service.js';
import { CorrectionsService } from './application/corrections.service.js';
import { LedgerWriter } from './application/ledger-writer.js';
import { PaymentsService } from './application/payments.service.js';
import { RegistryQueries } from './application/registry-queries.js';
import { RegistryReconciliation } from './application/registry-reconciliation.js';
import { SubscriptionEvents } from './application/subscription-events.js';
import { SubscriptionsService } from './application/subscriptions.service.js';
import { TransfersService } from './application/transfers.service.js';
import { TOKEN_REGISTRY_PROVIDER } from '../../core/providers/token-registry-provider.js';
import { InternalLedgerProvider } from './infrastructure/internal-ledger-provider.js';

/**
 * Subscriptions (phase 11); allocations, fictitious payments, positions, the append-only ledger,
 * its corrections and its daily reconciliation (phase 12); transfers (phase 13).
 */
@Module({
  imports: [IamModule, InvestorComplianceModule, IssuanceModule],
  providers: [
    SubscriptionsService,
    SubscriptionEvents,
    LedgerWriter,
    AllocationsService,
    RegistryQueries,
    PaymentsService,
    CorrectionsService,
    RegistryReconciliation,
    TransfersService,
    // The only token registry of the MVP (SPEC §26).
    { provide: TOKEN_REGISTRY_PROVIDER, useClass: InternalLedgerProvider },
  ],
  controllers: [SubscriptionsController, RegistryController, TransfersController],
  exports: [SubscriptionsService, LedgerWriter, RegistryQueries, TOKEN_REGISTRY_PROVIDER],
})
export class RegistryModule {}
