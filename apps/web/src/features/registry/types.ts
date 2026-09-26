import type { operations } from '@/lib/api/schema';

export type AllocationRoundView =
  operations['RegistryController_round']['responses'][200]['content']['application/json'];
export type PositionView =
  operations['RegistryController_position']['responses'][200]['content']['application/json'];
export type LedgerEntryView =
  operations['RegistryController_entry']['responses'][200]['content']['application/json'];
