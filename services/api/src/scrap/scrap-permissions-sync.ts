import type { PrismaClient } from '@prisma/client';
import { permissionCatalog, roleCatalog } from '../admin-catalog.js';

/**
 * Puts the scrapping permission keys, and their grants to the existing roles, into the database.
 *
 * The general catalogue sync (`ensureAdminCatalog`) deletes and recreates every role's permissions and runs from the seed and bootstrap
 * scripts, so using it just to add scrapping would reset any change an administrator made to a role. This does only additions: it creates
 * the missing `scrap.*` permissions and adds the grants a role does not already have. It never removes or changes anything, so it is safe
 * to run on a live database, and safe to run again.
 */
export async function syncScrapPermissions(db: Pick<PrismaClient, 'permission' | 'role' | 'rolePermission'>): Promise<{ permissions: number; grants: number; rolesMissing: string[] }> {
  const keys = (Object.keys(permissionCatalog) as Array<keyof typeof permissionCatalog>).filter(key => key.startsWith('scrap.'));
  const ids = new Map<string, string>();
  for (const key of keys) {
    const row = await db.permission.upsert({ where: { key }, update: {}, create: { key, description: permissionCatalog[key] }, select: { id: true } });
    ids.set(key, row.id);
  }

  let grants = 0;
  const rolesMissing: string[] = [];
  for (const [roleKey, definition] of Object.entries(roleCatalog)) {
    const scrapKeys = definition.permissions.filter(key => key.startsWith('scrap.'));
    if (scrapKeys.length === 0) continue;
    const role = await db.role.findUnique({ where: { key: roleKey as never }, select: { id: true } });
    if (!role) { rolesMissing.push(roleKey); continue; } // that role has not been created in this database yet: nothing to grant to
    const created = await db.rolePermission.createMany({ data: scrapKeys.map(key => ({ roleId: role.id, permissionId: ids.get(key)! })), skipDuplicates: true });
    grants += created.count;
  }
  return { permissions: keys.length, grants, rolesMissing };
}
