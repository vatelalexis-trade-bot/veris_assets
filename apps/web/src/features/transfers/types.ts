import type { operations } from '@/lib/api/schema';

export type TransferView =
  operations['TransfersController_get']['responses'][200]['content']['application/json'];
export type TransferStatus = TransferView['status'];
