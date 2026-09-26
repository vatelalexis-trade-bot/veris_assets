import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { IssuanceModule } from '../issuance/index.js';
import { RegistryModule } from '../registry/index.js';
import { DistributionsController } from './api/distributions.controller.js';
import { CouponNotices } from './application/coupon-notices.js';
import { DistributionEvents } from './application/distribution-events-handler.js';
import { DistributionsService } from './application/distributions.service.js';
import { SchedulesService } from './application/schedules.service.js';

/** Activation, coupon schedules, distributions and fictitious payment instructions (SPEC §12). */
@Module({
  imports: [IamModule, IssuanceModule, RegistryModule],
  providers: [SchedulesService, DistributionsService, DistributionEvents, CouponNotices],
  controllers: [DistributionsController],
})
export class ServicingModule {}
