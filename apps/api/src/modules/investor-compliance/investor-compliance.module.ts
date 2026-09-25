import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { EligibilityController } from './api/eligibility.controller.js';
import { InvestorsController } from './api/investors.controller.js';
import { KycCasesController } from './api/kyc-cases.controller.js';
import { MeController } from './api/me.controller.js';
import { EligibilityService } from './application/eligibility.service.js';
import { InvestorEvents } from './application/investor-events.js';
import { InvestorsService } from './application/investors.service.js';
import { KycExpiry } from './application/kyc-expiry.js';
import { KycService } from './application/kyc.service.js';

/** Investors, KYC/KYB, eligibility engine and compliance decisions (phases 8 and 9). */
@Module({
  imports: [IamModule],
  providers: [InvestorsService, KycService, KycExpiry, InvestorEvents, EligibilityService],
  controllers: [InvestorsController, MeController, KycCasesController, EligibilityController],
  exports: [InvestorsService, EligibilityService],
})
export class InvestorComplianceModule {}
