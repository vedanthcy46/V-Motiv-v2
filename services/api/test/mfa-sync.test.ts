import { describe, expect, it, vi } from 'vitest';
import { withMfaStatusSync } from '../src/mfa-sync.js';

type Any = any;
const token = (uid: string, second: boolean) => ({ uid, firebase: second ? { sign_in_second_factor: 'phone' } : {} }) as Any;

describe('withMfaStatusSync', () => {
  it('marks an employee COMPLIANT once their session carries a second factor, without touching others', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const verify = withMfaStatusSync(async t => token(t, t.startsWith('mfa')), { employee: { updateMany } } as Any);
    await verify('no-mfa-user', false);
    expect(updateMany).not.toHaveBeenCalled();
    await verify('mfa-user-1', false);
    expect(updateMany).toHaveBeenCalledWith({ where: { user: { firebaseUid: 'mfa-user-1' }, mfaStatus: { not: 'COMPLIANT' } }, data: { mfaStatus: 'COMPLIANT' } });
    await verify('mfa-user-1', false); // deduped
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('never fails authentication when the status update fails', async () => {
    const updateMany = vi.fn().mockRejectedValue(new Error('db down'));
    const verify = withMfaStatusSync(async () => token('mfa-user-2', true), { employee: { updateMany } } as Any);
    await expect(verify('t', true)).resolves.toMatchObject({ uid: 'mfa-user-2' });
  });
});
