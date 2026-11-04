// Realtime signals for the staff portals through Firebase Realtime Database (REST, so it works inside a Cloudflare
// Worker). Whenever rows of a watched table change, the API writes a timestamp to /pulse/<domain>. Portals listen to
// that path over Firebase's own connection (not Cloudflare), then ask /pulse once and reload only if the token changed.
// The signal carries NO data, only "something changed at <time>". If it is not configured, everything is a no-op and
// the portals simply keep using their slow backup polling.
import { SignJWT, importPKCS8 } from 'jose';
import { STAFF_DOMAINS } from './pulse.js';

const WRITE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);

const MODEL_TO_DOMAINS: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const [domain, probes] of Object.entries(STAFF_DOMAINS)) {
    for (const probe of probes) {
      const list = map.get(probe.model) ?? [];
      if (!list.includes(domain)) list.push(domain);
      map.set(probe.model, list);
    }
  }
  return map;
})();

/** Staff domains affected by a write to a Prisma model (Prisma reports models in PascalCase). */
export function domainsForModel(model: string | undefined): string[] {
  if (!model) return [];
  return MODEL_TO_DOMAINS.get(model.charAt(0).toLowerCase() + model.slice(1)) ?? [];
}

export function isWriteOperation(operation: string): boolean {
  return WRITE_OPERATIONS.has(operation);
}

export interface RtdbSignalerOptions {
  databaseUrl: string;
  serviceAccount: { client_email: string; private_key: string };
  fetchImpl?: typeof fetch;
  /** Wrap background work so a Worker keeps running after the response has been sent. */
  waitUntil?: () => ((promise: Promise<unknown>) => void) | undefined;
  /** Wait this long before writing so the database transaction that caused the change has committed. */
  delayMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RtdbSignaler {
  signal(domains: string[]): void;
}

export function createRtdbSignaler(options: RtdbSignalerOptions): RtdbSignaler {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const delayMs = options.delayMs ?? 1500;
  const databaseUrl = options.databaseUrl.replace(/\/$/, '');
  let cached: { token: string; expiresAt: number } | null = null;
  let inflightToken: Promise<string> | null = null;
  const pending = new Set<string>();

  function accessToken(): Promise<string> {
    if (cached && cached.expiresAt > now() + 60_000) return Promise.resolve(cached.token);
    inflightToken ??= fetchToken().finally(() => { inflightToken = null; });
    return inflightToken;
  }

  async function fetchToken(): Promise<string> {
    const key = await importPKCS8(options.serviceAccount.private_key, 'RS256');
    const iat = Math.floor(now() / 1000);
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(options.serviceAccount.client_email)
      .setSubject(options.serviceAccount.client_email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(key);
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!response.ok) throw new Error(`RTDB_TOKEN_${response.status}`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    cached = { token: body.access_token, expiresAt: now() + body.expires_in * 1000 };
    return cached.token;
  }

  async function write(domain: string): Promise<void> {
    try {
      const token = await accessToken();
      const response = await fetchImpl(`${databaseUrl}/pulse/${domain}.json`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(now()),
      });
      if (!response.ok) console.warn('[RTDB_SIGNAL_FAILED]', domain, response.status);
    } catch (error) {
      cached = null; // force a fresh token next time
      console.warn('[RTDB_SIGNAL_ERROR]', domain, (error as Error)?.message);
    }
  }

  return {
    signal(domains: string[]) {
      for (const domain of domains) {
        // Coalesce bursts: one write per domain per delay window.
        if (pending.has(domain)) continue;
        pending.add(domain);
        const job = sleep(delayMs).then(() => write(domain)).finally(() => pending.delete(domain));
        options.waitUntil?.()?.(job);
      }
    },
  };
}

/** Returns a signaler when RTDB is configured (FIREBASE_DATABASE_URL + service account), otherwise null. */
export function signalerFromEnv(env: NodeJS.ProcessEnv, waitUntil?: RtdbSignalerOptions['waitUntil']): RtdbSignaler | null {
  const databaseUrl = env.FIREBASE_DATABASE_URL?.trim();
  const rawAccount = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!databaseUrl || !rawAccount) return null;
  try {
    const parsed = JSON.parse(rawAccount) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) return null;
    return createRtdbSignaler({ databaseUrl, serviceAccount: { client_email: parsed.client_email, private_key: parsed.private_key }, waitUntil });
  } catch {
    return null;
  }
}
