import { describe, expect, it, vi } from 'vitest';
import { PrismaAdminStore } from '../src/admin-store.js';

type Any = any;
const B1 = '11111111-1111-4111-8111-111111111111';
const B2 = '22222222-2222-4222-8222-222222222222';
const B3 = '33333333-3333-4333-8333-333333333333';
const ROLE_OPS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROLE_PRIV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROLE_INS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const admin: Any = { userId: 'admin-1', roles: ['ADMIN'], permissions: ['employee.update', 'role.assign'], branches: [{ id: B1 }, { id: B2 }] };
const superAdmin: Any = { ...admin, roles: ['SUPER_ADMIN'], branches: [] };

function setup(target: Any, roles: Record<string, Any> = {}, branchesFound?: string[]) {
  const tx: Any = {
    employee: { findUnique: vi.fn().mockResolvedValue(target), update: vi.fn().mockResolvedValue({ userId: 'emp-1', designation: null }) },
    role: {
      findUnique: vi.fn().mockImplementation(async ({ where }: Any) => roles[where.id] ?? null),
      findMany: vi.fn().mockImplementation(async ({ where }: Any) => where.id.in.map((id: string) => roles[id]).filter(Boolean)),
    },
    branch: { findMany: vi.fn().mockImplementation(async ({ where }: Any) => (branchesFound ?? where.id.in).map((id: string) => ({ id }))) },
    employeeRoleAssignment: { deleteMany: vi.fn(), createMany: vi.fn() },
    employeeBranchAssignment: { deleteMany: vi.fn(), createMany: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  const db: Any = { $transaction: vi.fn(async (fn: Any) => fn(tx)) };
  return { store: new PrismaAdminStore(db), tx };
}
const target = (over: Any = {}) => ({
  userId: 'emp-1',
  designation: 'Inspector',
  role: 'INSPECTOR',
  roleAssignments: [{ role: { key: 'INSPECTOR', privileged: false } }],
  branchAssignments: [{ branchId: B1 }],
  ...over,
});
const reason = 'Moved to the Mysuru team';

describe('updateEmployeeAccess', () => {
  it('needs employee.update, and role.assign to change the role', async () => {
    const { store } = setup(target());
    await expect(store.updateEmployeeAccess({ ...admin, permissions: [] }, 'emp-1', { reason, designation: 'x' })).rejects.toThrow(/PERMISSION_DENIED/);
    await expect(store.updateEmployeeAccess({ ...admin, permissions: ['employee.update'] }, 'emp-1', { reason, roleIds: [ROLE_OPS] })).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it('nobody can change their own access', async () => {
    const { store } = setup(target());
    await expect(store.updateEmployeeAccess(admin, 'admin-1', { reason, designation: 'x' })).rejects.toThrow(/SELF_ACCESS_CHANGE_DENIED/);
  });

  it('keeps edits inside the editor\'s branch scope', async () => {
    const outside = setup(target({ branchAssignments: [{ branchId: B3 }] }));
    await expect(outside.store.updateEmployeeAccess(admin, 'emp-1', { reason, designation: 'x' })).rejects.toThrow(/BRANCH_SCOPE_DENIED/);
    const grant = setup(target());
    await expect(grant.store.updateEmployeeAccess(admin, 'emp-1', { reason, branchIds: [B1, B3] })).rejects.toThrow(/BRANCH_SCOPE_DENIED/);
    const ok = setup(target());
    await expect(ok.store.updateEmployeeAccess(superAdmin, 'emp-1', { reason, branchIds: [B1, B3] })).resolves.toMatchObject({ branchIds: [B1, B3] });
  });

  it('never grants, or edits, privileged roles here (they go through approval)', async () => {
    const grant = setup(target(), { [ROLE_PRIV]: { id: ROLE_PRIV, key: 'ADMIN', active: true, privileged: true } });
    await expect(grant.store.updateEmployeeAccess(admin, 'emp-1', { reason, roleIds: [ROLE_PRIV] })).rejects.toThrow(/PRIVILEGED_ROLE_APPROVAL_REQUIRED/);
    const edit = setup(target({ roleAssignments: [{ role: { key: 'ADMIN', privileged: true } }] }));
    await expect(edit.store.updateEmployeeAccess(admin, 'emp-1', { reason, designation: 'x' })).rejects.toThrow(/PRIVILEGED_ROLE_CHANGE_REQUIRES_APPROVAL/);
  });

  it('replaces the role and branches, and audits before/after with the reason', async () => {
    const { store, tx } = setup(target(), { [ROLE_OPS]: { id: ROLE_OPS, key: 'OPERATIONS', active: true, privileged: false }, [ROLE_INS]: { id: ROLE_INS, key: 'INSPECTOR', active: true, privileged: false } });
    const out: Any = await store.updateEmployeeAccess(admin, 'emp-1', { reason, roleIds: [ROLE_OPS, ROLE_INS], branchIds: [B2], designation: 'Ops lead' });
    expect(tx.employeeRoleAssignment.deleteMany).toHaveBeenCalledWith({ where: { employeeId: 'emp-1' } });
    expect(tx.employeeRoleAssignment.createMany.mock.calls[0][0].data).toEqual([
      { employeeId: 'emp-1', roleId: ROLE_OPS, assignedById: 'admin-1' },
      { employeeId: 'emp-1', roleId: ROLE_INS, assignedById: 'admin-1' },
    ]);
    expect(tx.employeeBranchAssignment.deleteMany).toHaveBeenCalledWith({ where: { employeeId: 'emp-1', branchId: { notIn: [B2] } } });
    expect(tx.employeeBranchAssignment.createMany.mock.calls[0][0].data).toEqual([{ employeeId: 'emp-1', branchId: B2 }]);
    expect(tx.employee.update.mock.calls[0][0].data).toMatchObject({ role: 'INSPECTOR', designation: 'Ops lead' }); // current primary role is still held, so it is kept
    const audit = tx.auditEvent.create.mock.calls[0][0].data;
    expect(audit.action).toBe('EMPLOYEE_ACCESS_UPDATED');
    expect(audit.details.before).toMatchObject({ roles: ['INSPECTOR'], branchIds: [B1] });
    expect(audit.details.reason).toBe(reason);
    expect(out.roles).toEqual(['OPERATIONS', 'INSPECTOR']);
  });

  it('requires at least one role and rejects unknown roles', async () => {
    const a = setup(target());
    await expect(a.store.updateEmployeeAccess(admin, 'emp-1', { reason, roleIds: [] })).rejects.toThrow(/AT_LEAST_ONE_ROLE_REQUIRED/);
    await expect(a.store.updateEmployeeAccess(admin, 'emp-1', { reason, roleIds: [ROLE_OPS] })).rejects.toThrow(/ROLE_NOT_AVAILABLE/);
  });

  it('rejects an empty branch list and unavailable branches', async () => {
    const a = setup(target());
    await expect(a.store.updateEmployeeAccess(admin, 'emp-1', { reason, branchIds: [] })).rejects.toThrow(/AT_LEAST_ONE_BRANCH_REQUIRED/);
    const b = setup(target(), {}, []);
    await expect(b.store.updateEmployeeAccess(admin, 'emp-1', { reason, branchIds: [B1] })).rejects.toThrow(/BRANCH_NOT_AVAILABLE/);
  });
});
