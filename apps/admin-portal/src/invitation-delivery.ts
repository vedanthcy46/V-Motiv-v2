import type { PendingInvitation } from './types.js';

// Plain words for what happened to an email, and what an administrator can do about it. The codes come from the API (email-errors.ts).

const REASONS: Record<string, string> = {
  SENDER_NOT_VERIFIED: 'The sending address or domain is not verified with the email provider. No invitation can be delivered until this is fixed.',
  RECIPIENT_SUPPRESSED: 'The email provider has blocked this address after an earlier bounce or complaint. Remove it from the provider’s suppression list, or accept manually.',
  RECIPIENT_REJECTED: 'The email provider refused this address. Check that it is spelled correctly and the mailbox exists.',
  RESEND_BOUNCED: 'The mailbox bounced the email. Check that the address is correct and can receive mail.',
  RESEND_SUPPRESSED: 'The email provider has blocked this address after an earlier bounce or complaint.',
  RESEND_COMPLAINED: 'The recipient marked an email from V MOTIV as spam.',
  RESEND_FAILED: 'The email provider could not deliver the email.',
  PROVIDER_KEY_REJECTED: 'The email provider rejected the API key. Ask the technical team to check it.',
  PROVIDER_QUOTA_EXCEEDED: 'The email sending limit for today or this month has been reached.',
  PROVIDER_RATE_LIMITED: 'Too many emails at once. It will be tried again automatically.',
  PROVIDER_IDEMPOTENCY_CONFLICT: 'The provider already has a different email under the same send key. Use “Send again”.',
  PROVIDER_UNAVAILABLE: 'The email provider had a temporary problem. It will be tried again automatically.',
  RETRY_WINDOW_EXHAUSTED: 'Automatic retries stopped. Use “Send again”.',
  EMAIL_SEND_FAILED: 'The email could not be sent. The server log has the provider’s reason.',
  SUPERSEDED: 'Replaced by a newer email.',
};

export const emailErrorText = (code: string) => REASONS[code] ?? `The email could not be delivered (${code}).`;

export type DeliveryView = { label: string; status: string; detail: string; problem: boolean };

export function deliveryView(delivery: PendingInvitation['delivery']): DeliveryView {
  if (!delivery) return { label: 'No email found', status: 'FAILED', detail: 'No email was queued for this invitation. Use “Send again”.', problem: true };
  const reason = delivery.errorCode ? emailErrorText(delivery.errorCode) : '';
  if (delivery.state === 'ACCEPTED') {
    // The provider took it; that is not proof it reached the inbox.
    return { label: 'Sent', status: 'ACCEPTED', detail: 'Handed to the email provider. Ask the person to check spam if it has not arrived.', problem: false };
  }
  if (delivery.state === 'FAILED' || delivery.state === 'REVIEW_REQUIRED') return { label: 'Not delivered', status: 'FAILED', detail: reason || 'The email was not delivered.', problem: true };
  if (reason) return { label: 'Retrying', status: 'PENDING', detail: `${reason} Attempt ${delivery.attempts} of 6.`, problem: true };
  return { label: 'Waiting to send', status: 'PENDING', detail: 'Queued. It is normally sent within a minute.', problem: false };
}
