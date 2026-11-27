// An administrator can accept an invitation for someone whose email never arrived (see acceptInvitationManually in admin-store.ts). If that
// person has never signed in, their employee record waits on an account marked with INVITED_UID_PREFIX. The first time they sign in with
// Google using exactly the invited address (verified by Google), that account becomes theirs. Nothing else is ever linked by email: only an
// account that an administrator created this way, and only to a verified Google identity.
import type { PrismaClient } from '@prisma/client';
import type { VerifyToken } from './auth.js';

export const INVITED_UID_PREFIX = 'invited_';

type Db = Pick<PrismaClient, 'user' | 'auditEvent'>;

/** Returns true when nothing is left to claim for this sign-in ever again (it already has an account of its own). */
export async function claimInvitedEmployee(db: Db, identity: { uid: string; email: string }): Promise<boolean> {
  const own = await db.user.findUnique({ where: { firebaseUid: identity.uid }, select: { id: true } });
  if (own) return true;
  const waiting = await db.user.findFirst({
    where: { firebaseUid: { startsWith: INVITED_UID_PREFIX }, email: { equals: identity.email, mode: 'insensitive' }, status: 'ACTIVE', employee: { isNot: null } },
    select: { id: true },
  });
  if (!waiting) return false;
  // updateMany with the prefix condition: if two requests arrive together, only the first one claims.
  const claimed = await db.user.updateMany({ where: { id: waiting.id, firebaseUid: { startsWith: INVITED_UID_PREFIX } }, data: { firebaseUid: identity.uid } });
  if (claimed.count) await db.auditEvent.create({ data: { actorId: waiting.id, action: 'EMPLOYEE_ACCOUNT_CLAIMED', entityType: 'Employee', entityId: waiting.id } });
  return true;
}

export function withInvitedEmployeeClaim(verify: VerifyToken, db: Db | undefined): VerifyToken {
  if (!db) return verify;
  // Only sign-ins that already have their own account are remembered; anyone else is checked again, because an administrator may accept
  // their invitation at any moment.
  const settled = new Set<string>();
  return async (token, checkRevoked) => {
    const decoded = await verify(token, checkRevoked);
    const { uid, email } = decoded ?? {};
    if (uid && email && decoded.email_verified && decoded.firebase?.sign_in_provider === 'google.com' && !settled.has(uid)) {
      try {
        if (await claimInvitedEmployee(db, { uid, email })) {
          if (settled.size > 5000) settled.clear();
          settled.add(uid);
        }
      } catch (error) {
        console.warn('[INVITED_EMPLOYEE_CLAIM_FAILED]', (error as Error)?.message);
      }
    }
    return decoded;
  };
}
