import type { operations } from '@/lib/api/schema';

export type IssuanceView =
  operations['IssuancesController_get']['responses'][200]['content']['application/json'];
export type TermsView = IssuanceView['terms'];
export type RulesView = IssuanceView['eligibilityRules'];
export type IssuanceCheck =
  operations['IssuancesController_validate']['responses'][200]['content']['application/json']['failures'][number];
