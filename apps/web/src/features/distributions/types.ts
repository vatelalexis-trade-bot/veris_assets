import type { operations } from '@/lib/api/schema';

export type DistributionView =
  operations['DistributionsController_get']['responses'][200]['content']['application/json'];
export type DistributionStatus = DistributionView['status'];
export type ScheduleView =
  operations['DistributionsController_schedule']['responses'][200]['content']['application/json'][number];
export type LineView =
  operations['DistributionsController_lines']['responses'][200]['content']['application/json'][number];
