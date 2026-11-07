import { describe, expect, it } from 'vitest';
import { parseServiceAccount } from '../src/firebase-credential.js';

const pem = '-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----\n';
const key = { type: 'service_account', project_id: 'v-motiv', client_email: 'x@v-motiv.iam.gserviceaccount.com', private_key: pem };
const json = JSON.stringify(key);

describe('Firebase service-account from an environment variable', () => {
  it('accepts plain JSON and base64 JSON', () => {
    expect(parseServiceAccount(json, 'v-motiv')).toMatchObject({ ok: true, format: 'json' });
    expect(parseServiceAccount(Buffer.from(json).toString('base64'), 'v-motiv')).toMatchObject({ ok: true, format: 'base64' });
  });

  it('accepts JSON pasted inside quotes', () => {
    expect(parseServiceAccount(`"${json.replace(/"/g, '\\"')}"`, 'v-motiv').ok).toBe(false); // escaped-quote form is not valid JSON text
    expect(parseServiceAccount(`'${json}'`, 'v-motiv')).toMatchObject({ ok: true });
  });

  it('repairs a private key whose line breaks were turned into real newlines or literal backslash-n', () => {
    const realNewlines = json.replace(/\\n/g, '\n');
    const result = parseServiceAccount(realNewlines, 'v-motiv');
    expect(result).toMatchObject({ ok: true });
    const doubled = JSON.stringify({ ...key, private_key: pem.replace(/\n/g, '\\n') });
    const fixed = parseServiceAccount(doubled, 'v-motiv');
    expect(fixed.ok && fixed.key.private_key).toBe(pem);
  });

  it('says what is wrong instead of failing later at every login', () => {
    expect(parseServiceAccount('', 'v-motiv')).toMatchObject({ ok: false, reason: expect.stringContaining('empty') });
    expect(parseServiceAccount('not json at all', 'v-motiv')).toMatchObject({ ok: false, reason: expect.stringContaining('not JSON') });
    expect(parseServiceAccount('{"project_id":"v-motiv"}', 'v-motiv')).toMatchObject({ ok: false, reason: expect.stringContaining('service-account') });
    expect(parseServiceAccount(JSON.stringify({ ...key, private_key: 'abc' }), 'v-motiv')).toMatchObject({ ok: false, reason: expect.stringContaining('private_key') });
    expect(parseServiceAccount(json, 'some-other-project')).toMatchObject({ ok: false, reason: expect.stringContaining('some-other-project') });
  });
});
