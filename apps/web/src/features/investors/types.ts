import type { operations } from '@/lib/api/schema';

export type InvestorView =
  operations['InvestorsController_get']['responses'][200]['content']['application/json'];
export type KycCaseDetail =
  operations['KycCasesController_get']['responses'][200]['content']['application/json'];
export type KycCaseListItem =
  operations['KycCasesController_list']['responses'][200]['content']['application/json']['data'][number];
