import type { operations } from '@/lib/api/schema';

export type TenantView =
  operations['TenantsController_get']['responses'][200]['content']['application/json'];
