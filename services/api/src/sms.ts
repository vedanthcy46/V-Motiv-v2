// SMS delivery for one-time codes. Provider is chosen by environment; with no provider configured nothing is sent and
// callers must fail closed (a code that was never delivered must never be accepted).
export type SmsSender = (to: string, text: string) => Promise<void>;

type Env = Record<string, string | undefined>;

/** Twilio Programmable Messaging over plain fetch (works inside a Cloudflare Worker). */
export function createTwilioSender(options: { accountSid: string; authToken: string; from?: string; messagingServiceSid?: string; fetchImpl?: typeof fetch }): SmsSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  const auth = btoa(`${options.accountSid}:${options.authToken}`);
  return async (to, text) => {
    const form = new URLSearchParams({ To: to, Body: text });
    if (options.messagingServiceSid) form.set('MessagingServiceSid', options.messagingServiceSid);
    else if (options.from) form.set('From', options.from);
    else throw new Error('SMS_SENDER_NOT_CONFIGURED');
    const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${options.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!response.ok) throw new Error(`SMS_PROVIDER_${response.status}`);
  };
}

/**
 * Sandbox: nothing leaves the server; the message (including the code) is written to the server log so a tester with log
 * access can complete the flow. Only enabled by an explicit SMS_SANDBOX_MODE=true and never when a real provider is set.
 */
export function createSandboxSender(log: (message: string) => void = message => console.warn(message)): SmsSender {
  return async (to, text) => {
    log(`[SMS_SANDBOX] to=${to} ${text}`);
  };
}

export function smsSenderFromEnv(env: Env): SmsSender | null {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_FROM?.trim();
  const service = env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (sid && token && (from || service)) return createTwilioSender({ accountSid: sid, authToken: token, from, messagingServiceSid: service });
  if (env.SMS_SANDBOX_MODE === 'true') return createSandboxSender();
  return null;
}

/** Secret used to hash codes at rest. Required in production; a fixed value is only allowed outside production. */
export function otpSecretFromEnv(env: Env): string | null {
  const configured = env.ACCEPTANCE_OTP_SECRET?.trim();
  if (configured && configured.length >= 16) return configured;
  return env.NODE_ENV === 'production' ? null : 'development-only-otp-secret';
}
