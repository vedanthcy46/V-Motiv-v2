// Reads the Firebase service-account key from an environment variable (hosted services have no key file).
// Pasting a multi-line JSON key into a dashboard goes wrong in predictable ways, so this accepts the usual shapes and says
// precisely what is wrong; a bad key otherwise only shows up later as "app/invalid-credential" on every login.

export interface ServiceAccountKey {
  type?: string;
  project_id: string;
  private_key: string;
  client_email: string;
  [field: string]: unknown;
}

export type CredentialResult =
  | { ok: true; key: ServiceAccountKey; format: 'json' | 'base64' }
  | { ok: false; reason: string };

function unwrap(text: string): string {
  let value = text.trim();
  // Surrounding quotes added when pasting ("{...}" or '{...}').
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

export function parseServiceAccount(raw: string | undefined, expectedProjectId?: string): CredentialResult {
  if (!raw || !raw.trim()) return { ok: false, reason: 'FIREBASE_SERVICE_ACCOUNT_JSON is empty.' };
  let text = unwrap(raw);
  let format: 'json' | 'base64' = 'json';
  if (!text.startsWith('{')) {
    try {
      text = Buffer.from(text, 'base64').toString('utf8').trim();
      format = 'base64';
    } catch {
      return { ok: false, reason: 'It is neither JSON nor base64.' };
    }
    if (!text.startsWith('{')) return { ok: false, reason: 'It is not JSON (and does not decode from base64 to JSON). Paste the whole contents of the service-account .json file.' };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Some dashboards turn the \n inside the private key into real line breaks, which breaks the JSON string.
    try {
      parsed = JSON.parse(text.replace(/\r?\n/g, '\\n'));
    } catch (error: any) {
      return { ok: false, reason: `The JSON is damaged (${error?.message}). Paste the complete file, or its base64.` };
    }
  }
  if (typeof parsed.private_key !== 'string' || typeof parsed.client_email !== 'string' || typeof parsed.project_id !== 'string') {
    return { ok: false, reason: 'It is missing project_id, client_email or private_key - this is not a service-account key.' };
  }
  // A key pasted as text often carries a literal backslash-n instead of a line break.
  const privateKey = parsed.private_key.includes('\\n') ? parsed.private_key.replace(/\\n/g, '\n') : parsed.private_key;
  if (!privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
    return { ok: false, reason: 'The private_key is incomplete (BEGIN / END PRIVATE KEY lines are missing).' };
  }
  if (expectedProjectId && parsed.project_id !== expectedProjectId) {
    return { ok: false, reason: `The key belongs to Firebase project "${parsed.project_id}" but FIREBASE_PROJECT_ID is "${expectedProjectId}". Use a key from the same project the apps sign in with.` };
  }
  return { ok: true, key: { ...parsed, private_key: privateKey }, format };
}
