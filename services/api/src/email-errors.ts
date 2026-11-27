// Why an email could not be sent, as a short stable code that is safe to store and show to an administrator. The provider's own message can
// contain addresses and request details, so it goes to the server log only; the database keeps the code.

export type EmailErrorCode =
  | 'SENDER_NOT_VERIFIED'
  | 'RECIPIENT_SUPPRESSED'
  | 'RECIPIENT_REJECTED'
  | 'PROVIDER_KEY_REJECTED'
  | 'PROVIDER_QUOTA_EXCEEDED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_IDEMPOTENCY_CONFLICT'
  | 'PROVIDER_UNAVAILABLE'
  | 'EMAIL_SEND_FAILED';

export class EmailSendError extends Error {
  constructor(readonly code: EmailErrorCode, message: string) {
    super(message);
    this.name = 'EmailSendError';
  }
}

/** `name` is Resend's error key (for example "validation_error"); `message` is its human text. */
export function classifyEmailError(error: { name?: string | null; message?: string | null } | null | undefined): EmailErrorCode {
  const name = (error?.name ?? '').toLowerCase();
  const message = (error?.message ?? '').toLowerCase();

  if (name === 'rate_limit_exceeded') return 'PROVIDER_RATE_LIMITED';
  if (name === 'daily_quota_exceeded' || name === 'monthly_quota_exceeded') return 'PROVIDER_QUOTA_EXCEEDED';
  if (name === 'missing_api_key' || name === 'invalid_api_key' || name === 'restricted_api_key') return 'PROVIDER_KEY_REJECTED';
  if (name === 'invalid_idempotent_request' || name === 'concurrent_idempotent_requests' || name === 'invalid_idempotency_key') return 'PROVIDER_IDEMPOTENCY_CONFLICT';
  if (name === 'application_error' || name === 'internal_server_error') return 'PROVIDER_UNAVAILABLE';
  if (message.includes('suppress')) return 'RECIPIENT_SUPPRESSED';
  // "You can only send testing emails to your own email address", "The example.com domain is not verified"
  if (name === 'invalid_from_address' || message.includes('testing emails') || message.includes('not verified') || message.includes('verify a domain') || message.includes('`from`')) return 'SENDER_NOT_VERIFIED';
  if (message.includes('`to`') || message.includes('recipient') || message.includes('invalid email')) return 'RECIPIENT_REJECTED';
  return 'EMAIL_SEND_FAILED';
}
