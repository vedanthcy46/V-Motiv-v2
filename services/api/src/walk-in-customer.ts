// Customers who are served at the counter (service desk or rental hub) before they have the app.
//
// Staff enter a phone number and, ideally, the customer's Gmail. We then make sure the customer has exactly one account:
//   - nobody matches            → a pre-registered account is created with that phone and Gmail, so the booking and its
//                                  history are waiting for them;
//   - an account already exists → it is used; no second account is created (and a phone and Gmail that belong to two
//                                  different accounts are refused, so history is never mixed up);
// and when a Gmail was given for an account that has not been used yet, the customer is emailed a link to the app and told
// to sign in with that Gmail. On first Google sign-in with that (verified) address the account is claimed (see identity-store).
import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from './errors.js';

type Db = Prisma.TransactionClient | PrismaClient;

/** Accounts made for counter customers carry this prefix until the customer signs in and claims them. */
export const UNCLAIMED_UID_PREFIX = 'walkin_';
const PLACEHOLDER_DOMAINS = ['@service.vmotiv.in', '@rental.vmotiv.in', '@vmotiv.internal'];

export const isPlaceholderEmail = (email: string) => PLACEHOLDER_DOMAINS.some(domain => email.toLowerCase().endsWith(domain));
export const isUnclaimedAccount = (user: { firebaseUid: string }) => user.firebaseUid.startsWith(UNCLAIMED_UID_PREFIX);

export function playStoreUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.PLAY_STORE_URL?.trim() || 'https://play.google.com/store/apps/details?id=in.vmotiv.customer';
}

export interface WalkInCustomerResult {
  user: { id: string; email: string; phone: string | null; displayName: string | null; firebaseUid: string };
  /** A new account was created for this customer. */
  accountCreated: boolean;
  /** The customer already had an account, so none was created. */
  existingAccount: boolean;
  /** An email with the app link and sign-in instructions was queued (or had already been sent). */
  inviteEmailed: boolean;
}

export function inviteEmail(input: { name: string | null; email: string; context: string }) {
  const url = playStoreUrl();
  return {
    subject: 'Your V MOTIV account is ready — download the app',
    text: `Hello ${input.name || 'there'},\n\nThank you for visiting V MOTIV. We have set up your account so you can follow ${input.context} and see your full service and rental history in the app.\n\n1. Download the V MOTIV app from the Google Play Store:\n${url}\n\n2. Sign in with Google using this Gmail address: ${input.email}\n\nUse exactly this address, so that everything we have recorded for you is there when you open the app.\n\nNeed help? Reply to this email or visit any V MOTIV hub.\n\nTeam V MOTIV`,
  };
}

export async function resolveWalkInCustomer(
  db: Db,
  input: { name: string; phone: string; email?: string | null; placeholderDomain: 'service.vmotiv.in' | 'rental.vmotiv.in'; context: string },
): Promise<WalkInCustomerResult> {
  const phone = input.phone.trim();
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'INVALID_CUSTOMER_EMAIL', 'Enter a valid email address for the customer.');

  const [byEmail, byPhone] = await Promise.all([
    email ? db.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, orderBy: { createdAt: 'asc' } }) : null,
    phone ? db.user.findFirst({ where: { phone }, orderBy: { createdAt: 'asc' } }) : null,
  ]);
  if (byEmail && byPhone && byEmail.id !== byPhone.id) {
    throw new HttpError(409, 'CUSTOMER_IDENTITY_CONFLICT', 'This phone number and this email already belong to two different customer accounts. Check the details with the customer.');
  }

  let user = byEmail ?? byPhone;
  let accountCreated = false;
  if (user) {
    // An unused counter account that only had a placeholder email gets the customer's real one, so they can claim it.
    if (email && isUnclaimedAccount(user) && isPlaceholderEmail(user.email)) {
      user = await db.user.update({ where: { id: user.id }, data: { email } });
    }
  } else {
    user = await db.user.create({
      data: {
        firebaseUid: `${UNCLAIMED_UID_PREFIX}${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        email: email ?? `walkin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@${input.placeholderDomain}`,
        phone: phone || null,
        displayName: input.name.trim(),
      },
    });
    accountCreated = true;
  }

  // Invite only accounts that have never been used, and only when we hold a real address. Once per account.
  let inviteEmailed = false;
  if (email && isUnclaimedAccount(user) && !isPlaceholderEmail(user.email)) {
    const message = inviteEmail({ name: user.displayName, email: user.email, context: input.context });
    await db.emailOutbox.upsert({
      where: { eventKey: `app-invite/${user.id}` },
      update: {},
      create: { userId: user.id, eventKey: `app-invite/${user.id}`, recipient: user.email, templateVersion: 'app-invite-v1', subject: message.subject, text: message.text },
    });
    inviteEmailed = true;
  }
  return { user, accountCreated, existingAccount: !accountCreated, inviteEmailed };
}
