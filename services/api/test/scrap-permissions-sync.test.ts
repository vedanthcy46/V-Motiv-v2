import { describe, expect, it, vi } from 'vitest';
import { permissionCatalog, roleCatalog } from '../src/admin-catalog.js';
import { syncScrapPermissions } from '../src/scrap/scrap-permissions-sync.js';

type Any = any;

function fakeDb(existingRoles: string[], existingGrants: Array<[string, string]> = []) {
  const permissions = new Map<string, string>();
  const grants = new Set(existingGrants.map(([role, permission]) => `${role}|${permission}`));
  const calls = { deletes: 0, updates: 0 };
  return {
    calls, permissions, grants,
    db: {
      permission: {
        upsert: vi.fn(async ({ where, update, create }: Any) => {
          if (Object.keys(update).length) calls.updates += 1;
          if (!permissions.has(where.key)) permissions.set(where.key, `perm-${create.key}`);
          return { id: permissions.get(where.key) };
        }),
      },
      role: { findUnique: vi.fn(async ({ where }: Any) => (existingRoles.includes(where.key) ? { id: `role-${where.key}` } : null)) },
      rolePermission: {
        createMany: vi.fn(async ({ data, skipDuplicates }: Any) => {
          expect(skipDuplicates).toBe(true);
          let count = 0;
          for (const row of data) { const key = `${row.roleId.replace('role-', '')}|${row.permissionId}`; if (!grants.has(key)) { grants.add(key); count += 1; } }
          return { count };
        }),
        deleteMany: vi.fn(async () => { calls.deletes += 1; }),
      },
    } as Any,
  };
}

const scrapKeys = Object.keys(permissionCatalog).filter(key => key.startsWith('scrap.'));
const grantedRoles = Object.entries(roleCatalog).filter(([, definition]) => definition.permissions.some(key => key.startsWith('scrap.'))).map(([role]) => role);

describe('syncing the scrapping permissions into the database', () => {
  it('creates every scrapping permission and grants them to the existing roles that hold them', async () => {
    const { db, permissions, grants } = fakeDb(grantedRoles);
    const result = await syncScrapPermissions(db);
    expect(result.permissions).toBe(scrapKeys.length);
    expect([...permissions.keys()].sort()).toEqual([...scrapKeys].sort());
    const expected = Object.entries(roleCatalog).flatMap(([role, definition]) => definition.permissions.filter(key => key.startsWith('scrap.')).map(key => `${role}|perm-${key}`));
    expect([...grants].sort()).toEqual(expected.sort());
    expect(result.grants).toBe(expected.length);
    expect(result.rolesMissing).toEqual([]);
  });

  it('is additive and safe to repeat: it never deletes or changes anything, and a second run adds nothing', async () => {
    const { db, calls } = fakeDb(grantedRoles);
    await syncScrapPermissions(db);
    const again = await syncScrapPermissions(db);
    expect(again.grants).toBe(0);
    expect(calls).toEqual({ deletes: 0, updates: 0 });
  });

  it('leaves alone a grant that already exists, and reports a role that has not been created yet', async () => {
    const first = fakeDb(grantedRoles.filter(role => role !== 'PRICING_APPROVER'), [['SALES_EXECUTIVE', 'perm-scrap.lead.qualify']]);
    const result = await syncScrapPermissions(first.db);
    expect(result.rolesMissing).toEqual(['PRICING_APPROVER']);
    const sales = roleCatalog.SALES_EXECUTIVE.permissions.filter(key => key.startsWith('scrap.')).length;
    expect([...first.grants].filter(grant => grant.startsWith('SALES_EXECUTIVE|')).length).toBe(sales);
  });
});
