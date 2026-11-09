import { describe, expect, it, vi } from 'vitest';
import { REPAIR_PREMATURELY_PAID_SQL, repairPrematurelyPaidServiceRequests } from '../src/service-repair.js';
import { readFileSync } from 'node:fs';

describe('startup repair of prematurely PAID service requests', () => {
  it('only matches PAID requests that have no invoice, and restores the status from the history log', () => {
    expect(REPAIR_PREMATURELY_PAID_SQL).toContain(`sr.status = 'PAID'`);
    expect(REPAIR_PREMATURELY_PAID_SQL).toContain('NOT EXISTS (SELECT 1 FROM "ServiceInvoice"');
    expect(REPAIR_PREMATURELY_PAID_SQL).toContain('"ServiceHistoryEvent"');
  });

  it('runs the same SQL as the shipped migration', () => {
    const migration = readFileSync(new URL('../prisma/migrations/20261109000000_repair_prematurely_paid_service_requests/migration.sql', import.meta.url), 'utf8');
    const normalise = (sql: string) => sql.split('\n').filter(line => !line.trim().startsWith('--')).join(' ').replace(/;\s*$/, '').replace(/\s+/g, ' ').trim();
    expect(normalise(REPAIR_PREMATURELY_PAID_SQL)).toBe(normalise(migration));
  });

  it('reports how many were repaired, and never throws if the database refuses', async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    expect(await repairPrematurelyPaidServiceRequests({ $executeRawUnsafe: async () => 3 }, log)).toBe(3);
    expect(log.info).toHaveBeenCalledOnce();
    expect(await repairPrematurelyPaidServiceRequests({ $executeRawUnsafe: async () => { throw new Error('boom'); } }, log)).toBe(0);
    expect(log.error).toHaveBeenCalledOnce();
  });
});
