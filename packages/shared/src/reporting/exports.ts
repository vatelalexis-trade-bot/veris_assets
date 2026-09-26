// CSV exports (SPEC §18, docs/BACKLOG.md P15-3): what can be exported, and the permission each
// kind needs on top of `report:export`.
import type { Permission } from '../permissions/permissions.js';

export const EXPORT_KINDS = ['REGISTRY', 'SUBSCRIPTIONS', 'DISTRIBUTIONS', 'AUDIT'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_PERMISSIONS: Record<ExportKind, Permission> = {
  REGISTRY: 'registry:read',
  SUBSCRIPTIONS: 'subscription:read',
  DISTRIBUTIONS: 'distribution:read',
  AUDIT: 'audit:read',
};

export const EXPORT_STATUSES = ['QUEUED', 'RUNNING', 'DONE', 'FAILED'] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];
