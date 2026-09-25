import type { z } from 'zod';
import type { ManagedUser } from '../application/user-management.service.js';
import type { TenantRow } from '../application/tenant-management.service.js';
import type { tenantView, userView } from './management.dto.js';

// Database rows → JSON answers (dates as ISO 8601 UTC strings).

export function toTenantView(row: TenantRow): z.infer<typeof tenantView> {
  return {
    id: row.id,
    legalName: row.legalName,
    tradeName: row.tradeName,
    countryCode: row.countryCode,
    baseCurrency: row.baseCurrency,
    defaultLocale: row.defaultLocale === 'fr-FR' ? 'fr-FR' : 'en-GB',
    timezone: row.timezone,
    organizationType: row.organizationType as z.infer<typeof tenantView>['organizationType'],
    status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toUserView(user: ManagedUser): z.infer<typeof userView> {
  return {
    ...user,
    locale: user.locale === 'fr-FR' ? 'fr-FR' : 'en-GB',
    status: user.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
