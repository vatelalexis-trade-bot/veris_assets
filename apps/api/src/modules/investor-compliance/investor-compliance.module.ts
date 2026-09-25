import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { InvestorsController } from './api/investors.controller.js';
import { KycCasesController } from './api/kyc-cases.controller.js';
import { MeController } from './api/me.controller.js';
import { InvestorEvents } from './application/investor-events.js';
import { InvestorsService } from './application/investors.service.js';
import { KycExpiry } from './application/kyc-expiry.js';
import { KycService } from './application/kyc.service.js';

/**
 * Investors, KYC/KYB and compliance decisions (phase 8). The eligibility engine arrives in
 * phase 9 (docs/BACKLOG.md).
 */
@Module({
  imports: [IamModule],
  providers: [InvestorsService, KycService, KycExpiry, InvestorEvents],
  controllers: [InvestorsController, MeController, KycCasesController],
  exports: [InvestorsService],
})
export class InvestorComplianceModule {}
