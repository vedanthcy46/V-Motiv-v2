// Verified in-person acceptance of a purchase offer for walk-in sellers.
//
// A walk-in seller has no app account (their lead hangs off a placeholder user that can never sign in), so they cannot
// accept in the app, and staff may never accept FOR a seller. Instead the seller proves it is them by a one-time code
// sent to the phone number on the lead and types (or reads out) that code while standing at the counter. The challenge
// row is the durable evidence: verified phone, time, offer version and the staff member who was present.
import crypto from 'node:crypto';

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_SENDS_PER_HOUR = 3;

const PLACEHOLDER_EMAIL_SUFFIX = '@vmotiv.internal';
const PLACEHOLDER_UID_PREFIX = 'manual-';
/** Accounts staff create at the counter (see walk-in-customer.ts) stay walk-in sellers until the seller signs in to the app. */
const UNCLAIMED_UID_PREFIX = 'walkin_';

/** Walk-in leads are created for a placeholder user (see createManualSellerLead). App sellers must accept in the app. */
export function isWalkInSeller(user: { email?: string | null; firebaseUid?: string | null }): boolean {
  return Boolean(user.email?.toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX)) || Boolean(user.firebaseUid?.startsWith(PLACEHOLDER_UID_PREFIX)) || Boolean(user.firebaseUid?.startsWith(UNCLAIMED_UID_PREFIX));
}

export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashCode(code: string, challengeId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

export function codeMatches(code: string, challengeId: string, secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashCode(code, challengeId, secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** "+919876543210" -> "+91••••••3210" (enough for the seller to recognise their number, not enough to leak it). */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length <= 6) return '••••';
  return `${digits.slice(0, 3)}${'•'.repeat(Math.max(digits.length - 7, 2))}${digits.slice(-4)}`;
}

export type ChallengeState = { expiresAt: Date; attempts: number; consumedAt: Date | null };

export function challengeStatus(challenge: ChallengeState, now: Date): 'OK' | 'USED' | 'EXPIRED' | 'LOCKED' {
  if (challenge.consumedAt) return 'USED';
  if (challenge.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (challenge.attempts >= MAX_ATTEMPTS) return 'LOCKED';
  return 'OK';
}

export function smsText(code: string, vehicle: string, amountRupees: string): string {
  return `V MOTIV: ${code} is your code to accept our offer of Rs ${amountRupees} for your ${vehicle}. Share it only with the V MOTIV staff in front of you. Valid for 10 minutes.`;
}
