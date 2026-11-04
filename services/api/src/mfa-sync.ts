import type { PrismaClient } from '@prisma/client';
import type { VerifyToken } from './auth.js';

const synced = new Set<string>();

/**
 * An employee's mfaStatus used to flip to COMPLIANT only when they opened the Admin portal, so inspectors,
 * sales, operations and finance staff who had added a second factor still showed "REQUIRED". Any verified
 * token that carries a second factor now marks that employee COMPLIANT (once per process per user).
 */
export function withMfaStatusSync(verify: VerifyToken, db: Pick<PrismaClient, 'employee'> | undefined): VerifyToken {
  if (!db) return verify;
  return async (token, checkRevoked) => {
    const decoded = await verify(token, checkRevoked);
    const uid = decoded?.uid;
    if (uid && decoded.firebase?.sign_in_second_factor && !synced.has(uid)) {
      try {
        await db.employee.updateMany({ where: { user: { firebaseUid: uid }, mfaStatus: { not: 'COMPLIANT' } }, data: { mfaStatus: 'COMPLIANT' } });
        if (synced.size > 5000) synced.clear();
        synced.add(uid);
      } catch (error) {
        console.warn('[MFA_STATUS_SYNC_FAILED]', (error as Error)?.message);
      }
    }
    return decoded;
  };
}
