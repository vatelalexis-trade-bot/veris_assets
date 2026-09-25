import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module.js';
import { IamModule } from './modules/iam/index.js';
import { InvestorComplianceModule } from './modules/investor-compliance/index.js';
import { IssuanceModule } from './modules/issuance/index.js';
import { RegistryModule } from './modules/registry/index.js';
import { ReportingAuditModule } from './modules/reporting-audit/index.js';
import { ServicingModule } from './modules/servicing/index.js';

/** Root module: the technical core plus the six business modules of SPEC §5. */
@Module({
  imports: [
    CoreModule,
    IamModule,
    InvestorComplianceModule,
    IssuanceModule,
    RegistryModule,
    ServicingModule,
    ReportingAuditModule,
  ],
})
export class AppModule {}
