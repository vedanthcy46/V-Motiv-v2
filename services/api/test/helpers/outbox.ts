import type { PrismaClient } from '@prisma/client';
import { runOutboxOnce } from '../../src/employee-notifications/processor.js';

/**
 * Process every due event and wait for any that another test file's worker has claimed. The test database is shared by files that run
 * in parallel, so a plain single pass can return while another worker is still halfway through "our" event.
 */
export async function settleOutbox(db: PrismaClient, timeoutMs = 5000): Promise<void> {
  const stop = Date.now() + timeoutMs;
  while (Date.now() < stop) {
    await runOutboxOnce(db);
    const busy = await db.domainOutboxEvent.count({ where: { status: { in: ['PENDING', 'PROCESSING'] }, OR: [{ nextAttemptAt: { lte: new Date() } }, { status: 'PROCESSING' }] } });
    if (busy === 0) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
}
