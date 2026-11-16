import { describe, expect, it, vi } from 'vitest';
import { ENSURE_COLUMNS_SQL, REPAIR_PREMATURELY_PAID_SQL, REPAIR_STALE_BALANCE_SQL, ensureSchemaAdditions, repairPrematurelyPaidServiceRequests } from '../src/service-repair.js';
import { readFileSync } from 'node:fs';

const normalise = (sql: string) => sql.split('\n').filter(line => !line.trim().startsWith('--')).join(' ').replace(/\s+/g, ' ').trim();

describe('startup schema additions', () => {
  it('runs the same additive statement as the migration, so the migration changes nothing afterwards', () => {
    const migration = ['20261109020000_notification_dismissed_at', '20261116000000_opening_stock']
      .map(name => normalise(readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8')))
      .join(' ');
    for (const sql of ENSURE_COLUMNS_SQL) {
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS|DROP NOT NULL/); // every statement is additive and safe to repeat
      expect(migration).toContain(normalise(sql));
    }
  });

  it('runs every statement, and never throws if the database refuses', async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    const run = vi.fn().mockResolvedValue(0);
    expect(await ensureSchemaAdditions({ $executeRawUnsafe: run }, log)).toBe(true);
    expect(run).toHaveBeenCalledTimes(ENSURE_COLUMNS_SQL.length);
    expect(await ensureSchemaAdditions({ $executeRawUnsafe: async () => { throw new Error('denied'); } }, log)).toBe(false);
    expect(log.error).toHaveBeenCalledOnce();
  });
});

describe('startup repair of prematurely PAID service requests', () => {
  it('only matches PAID / PAYMENT_PENDING requests that have no invoice, and restores the status from the history log', () => {
    expect(REPAIR_PREMATURELY_PAID_SQL).toContain(`sr.status IN ('PAID', 'PAYMENT_PENDING')`);
    expect(REPAIR_PREMATURELY_PAID_SQL).toContain('Counter Payment Recorded & Verified');
    expect(REPAIR_PREMATURELY_PAID_SQL).toContain('NOT EXISTS (SELECT 1 FROM "ServiceInvoice"');
    expect(REPAIR_PREMATURELY_PAID_SQL).toContain('"ServiceHistoryEvent"');
  });

  it('recomputes the balance from what was collected, so a payment made afterwards is not forgotten', () => {
    expect(REPAIR_PREMATURELY_PAID_SQL).toContain('GREATEST(0, plan.total - sr."verifiedPaidPaise")');
    expect(REPAIR_STALE_BALANCE_SQL).toContain('GREATEST(0, plan.total - sr."verifiedPaidPaise")');
    // only ever lowers a balance, and never touches a billed job
    expect(REPAIR_STALE_BALANCE_SQL).toContain('sr."outstandingBalancePaise" > GREATEST(0, plan.total - sr."verifiedPaidPaise")');
    expect(REPAIR_STALE_BALANCE_SQL).toContain('NOT EXISTS (SELECT 1 FROM "ServiceInvoice"');
  });

  it('runs the same SQL as the shipped migration', () => {
    const migration = normalise(readFileSync(new URL('../prisma/migrations/20261109010000_repair_prematurely_paid_service_requests_v2/migration.sql', import.meta.url), 'utf8'));
    expect(migration).toContain(normalise(REPAIR_PREMATURELY_PAID_SQL));
    expect(migration).toContain(normalise(REPAIR_STALE_BALANCE_SQL));
  });

  it('runs both statements, reports what changed, and never throws if the database refuses', async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    const run = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    expect(await repairPrematurelyPaidServiceRequests({ $executeRawUnsafe: run }, log)).toBe(3);
    expect(run).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledTimes(2);
    expect(await repairPrematurelyPaidServiceRequests({ $executeRawUnsafe: async () => { throw new Error('boom'); } }, log)).toBe(0);
    expect(log.error).toHaveBeenCalledOnce();
  });
});
