import type { EmailOutbox, PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import type { Config } from './config.js';
import { renderEmailHtml } from './email-templates.js';

export type EmailSender = (event: EmailOutbox) => Promise<string>;

export type ResendSenderOptions = {
  apiKey: string;
  from: string;
  webOrigin?: string;
};

export function createResendSender(options: ResendSenderOptions): EmailSender {
  if (!options.apiKey || !options.from) {
    throw new Error('Email delivery is disabled or not configured.');
  }
  const resend = new Resend(options.apiKey);

  return async event => {
    const html = renderEmailHtml({
      templateVersion: event.templateVersion,
      subject: event.subject,
      text: event.text,
      recipient: event.recipient,
      webOrigin: options.webOrigin || 'https://vmotiv.in',
    });

    const result = await resend.emails.send({
      from: event.sender || options.from,
      to: event.recipient,
      subject: event.subject,
      text: event.text,
      html,
    }, { idempotencyKey: event.eventKey });

    if (result.error || !result.data?.id) {
      const msg = result.error?.message || 'EMAIL_PROVIDER_REJECTED';
      console.error('[EMAIL RESEND REJECTED]', result.error);
      throw new Error(msg);
    }
    return result.data.id;
  };
}

export function resendSender(config: Config): EmailSender {
  if (config.EMAIL_DELIVERY_ENABLED !== 'true' || !config.RESEND_API_KEY || !config.EMAIL_FROM) {
    throw new Error('Email delivery is disabled or not configured.');
  }
  return createResendSender({
    apiKey: config.RESEND_API_KEY,
    from: config.EMAIL_FROM,
    webOrigin: config.WEB_ORIGIN,
  });
}

export async function drainOutbox(db: PrismaClient, send: EmailSender, sender: string, maxBatch = 5): Promise<number> {
  let count = 0;
  try {
    while (count < maxBatch) {
      const processed = await processEmail(db, send, sender);
      if (!processed) break;
      count++;
    }
  } catch (err: any) {
    console.error('[EMAIL DRAIN ERROR]', err?.message || err);
  }
  return count;
}
export function retryAllowed(event: Pick<EmailOutbox, 'attempts' | 'firstAttemptAt'>, now: Date) {
  return event.attempts < 6 && (!event.firstAttemptAt || now.getTime() - event.firstAttemptAt.getTime() < 23 * 60 * 60 * 1000);
}
export async function processEmail(db: PrismaClient, send: EmailSender, sender: string, eventId?: string) {
  const now = new Date();
  const event = await db.$transaction(async tx => {
    const rows = await tx.$queryRaw<EmailOutbox[]>`
      SELECT * FROM "EmailOutbox"
      WHERE (("state" = 'PENDING' AND "availableAt" <= NOW())
         OR ("state" = 'PROCESSING' AND "leaseUntil" < NOW()))
        AND (${eventId ?? null}::uuid IS NULL OR "id" = ${eventId ?? null}::uuid)
      ORDER BY "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    if (!retryAllowed(row, now)) {
      await tx.emailOutbox.update({ where: { id: row.id }, data: { state: 'REVIEW_REQUIRED', lastErrorCode: 'RETRY_WINDOW_EXHAUSTED' } });
      return null;
    }
    return tx.emailOutbox.update({ where: { id: row.id }, data: {
      state: 'PROCESSING', sender: row.sender || sender, firstAttemptAt: row.firstAttemptAt || now,
      attempts: { increment: 1 }, leaseUntil: new Date(now.getTime() + 120_000),
    } });
  });
  if (!event) return false;
  try {
    const providerMessageId = await send(event);
    await db.emailOutbox.updateMany({ where: { id: event.id, state: 'PROCESSING', attempts: event.attempts }, data: {
      state: 'ACCEPTED', providerMessageId, leaseUntil: null, lastErrorCode: null,
    } });
  } catch {
    // Provider exception text can contain request metadata. Persist only a stable,
    // non-sensitive operator code; detailed diagnostics belong in protected logs.
    const errCode = 'EMAIL_SEND_FAILED';
    await db.emailOutbox.updateMany({ where: { id: event.id, state: 'PROCESSING', attempts: event.attempts }, data: {
      state: event.attempts >= 6 ? 'FAILED' : 'PENDING', leaseUntil: null,
      availableAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** event.attempts) * 1000),
      lastErrorCode: errCode,
    } });
  }
  return true;
}

