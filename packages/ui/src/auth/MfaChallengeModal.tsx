import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PhoneAuthProvider, PhoneMultiFactorGenerator, RecaptchaVerifier, type Auth, type MultiFactorResolver, type PhoneMultiFactorInfo } from 'firebase/auth';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Alert } from '../components/States';

/** 2-step verification during sign-in: texts a 6-digit code to the staff member's registered phone. Shared by every staff portal. */
export function MfaChallengeModal({ auth, resolver, onClose, onSuccess }: { auth: Auth; resolver: MultiFactorResolver; onClose: () => void; onSuccess: () => void }) {
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const phoneHint = resolver.hints.find(hint => hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID) as PhoneMultiFactorInfo | undefined;

  const sendOtp = async () => {
    if (!phoneHint) { setError('No registered phone number found for 2-step verification.'); return; }
    setSending(true);
    setError('');
    try {
      if (verifier.current) { try { verifier.current.clear(); } catch { /* already cleared */ } verifier.current = null; }
      verifier.current = new RecaptchaVerifier(auth, 'vm-recaptcha', { size: 'invisible' });
      setVerificationId(await new PhoneAuthProvider(auth).verifyPhoneNumber({ multiFactorHint: phoneHint, session: resolver.session }, verifier.current));
    } catch (err) {
      setError((err as { message?: string })?.message || 'Failed to send SMS code. Please try again.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    void sendOtp();
    return () => { try { verifier.current?.clear(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!verificationId || code.trim().length !== 6) return;
    setVerifying(true);
    setError('');
    try {
      await resolver.resolveSignIn(PhoneMultiFactorGenerator.assertion(PhoneAuthProvider.credential(verificationId, code.trim())));
      onSuccess();
    } catch (err) {
      setError((err as { message?: string })?.message || 'Invalid or expired 6-digit verification code.');
      setVerifying(false);
    }
  };

  const phoneDisplay = phoneHint?.phoneNumber || 'your registered mobile number';
  return (
    <Modal
      title="Two-step verification"
      description={sending ? `Sending a 6-digit code to ${phoneDisplay}…` : `Enter the 6-digit code sent by SMS to ${phoneDisplay}.`}
      size="sm"
      onClose={onClose}
      busy={verifying}
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={verifying}>Cancel</Button>
          <Button type="submit" loading={verifying} disabled={sending || code.trim().length !== 6}>Verify and continue</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <label className="grid gap-1.5 text-sm font-medium">
          Verification code
          <input
            className="input input-lg w-full text-center font-mono text-2xl font-semibold tracking-[0.5em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="······"
            autoFocus
            required
            value={code}
            onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
          />
        </label>
        {phoneHint ? (
          <Button variant="link" size="sm" disabled={sending || verifying} onClick={sendOtp}>{sending ? 'Sending a new code…' : "Didn't get the SMS? Resend code"}</Button>
        ) : null}
        <div id="vm-recaptcha" />
      </div>
    </Modal>
  );
}
