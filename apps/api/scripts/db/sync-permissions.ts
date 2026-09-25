// Keeps iam.permission and iam.role_permission equal to the matrix of @virtus/shared (SPEC §4.7:
// roles are sets of permissions stored in the database). Runs after every migration.
import { PERMISSIONS, ROLE_PERMISSIONS, type Permission, type RoleCode } from '@virtus/shared';
import { eq, notInArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { permission, role, rolePermission } from '../../src/modules/iam/infrastructure/schema.js';

export async function syncPermissions(db: NodePgDatabase): Promise<void> {
  await db.transaction(async (tx) => {
    const codes = Object.keys(PERMISSIONS) as Permission[];
    for (const code of codes) {
      await tx
        .insert(permission)
        .values({ code, description: PERMISSIONS[code] })
        .onConflictDoUpdate({ target: permission.code, set: { description: PERMISSIONS[code] } });
    }
    const roles = await tx.select({ id: role.id, code: role.code }).from(role);
    for (const { id, code } of roles) {
      const granted = ROLE_PERMISSIONS[code as RoleCode] ?? {};
      await tx.delete(rolePermission).where(eq(rolePermission.roleId, id));
      const rows = Object.entries(granted).map(([permissionCode, scope]) => ({
        roleId: id,
        permissionCode,
        scope,
      }));
      if (rows.length > 0) await tx.insert(rolePermission).values(rows);
    }
    await tx.delete(permission).where(notInArray(permission.code, codes));
  });
}
