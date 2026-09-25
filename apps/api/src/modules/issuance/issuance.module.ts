import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { InvestorComplianceModule } from '../investor-compliance/index.js';
import { IssuancesController } from './api/issuances.controller.js';
import { InvitationsService } from './application/invitations.service.js';
import { IssuanceEvents } from './application/issuance-events.js';
import { IssuancesService } from './application/issuances.service.js';
import { SubscriptionAutoClose } from './application/subscription-auto-close.js';

/** Issuances, terms, wizard, life cycle state machine and investor invitations (phase 10). */
@Module({
  imports: [IamModule, InvestorComplianceModule],
  providers: [IssuancesService, InvitationsService, IssuanceEvents, SubscriptionAutoClose],
  controllers: [IssuancesController],
  exports: [IssuancesService],
})
export class IssuanceModule {}
