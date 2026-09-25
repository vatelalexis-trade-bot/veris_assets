// Public API of the iam module: other modules may import only what is exported here.
export { IamModule } from './iam.module.js';
export { UserDirectory } from './application/user-directory.js';
export { tenant } from './infrastructure/schema.js';
export { TenantDirectory } from './application/tenant-directory.js';
export type { RoleCode } from './domain/roles.js';
