import type { operations } from '@/lib/api/schema';

export type SubscriptionView =
  operations['SubscriptionsController_get']['responses'][200]['content']['application/json'];
export type SubscriptionStatus = SubscriptionView['status'];
