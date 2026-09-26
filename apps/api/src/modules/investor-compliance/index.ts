// Public API of the investor-compliance module: other modules may import only what is exported here.
export { InvestorComplianceModule } from './investor-compliance.module.js';
export { EligibilityService, type AssessmentRequest } from './application/eligibility.service.js';
export { InvestorsService } from './application/investors.service.js';
export {
  evaluateEligibility,
  type EligibilityResult,
  type EligibilityRuleSet,
} from './domain/eligibility.js';
export { ruleSetSchema } from './api/eligibility.dto.js';
export { investor } from './infrastructure/schema.js';
