// Thin wrapper over @react-native-firebase/auth for phone second-factor enrolment.
// Needs a native build with Firebase Auth; every call is defensive so a missing module never crashes the app.

type AnyAuth = any;

function authModule(): AnyAuth | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-firebase/auth');
  } catch {
    return null;
  }
}

function authInstance(mod: AnyAuth): AnyAuth | null {
  try {
    if (typeof mod.getAuth === 'function') return mod.getAuth();
    if (typeof mod.default === 'function') return mod.default();
  } catch {
    /* fall through */
  }
  return null;
}

function multiFactorUser(mod: AnyAuth, auth: AnyAuth): AnyAuth {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error('NOT_SIGNED_IN'), { code: 'auth/requires-recent-login' });
  return typeof mod.multiFactor === 'function' ? mod.multiFactor(user) : user.multiFactor;
}

/** Number of second factors on the signed-in Firebase user, or null when it cannot be read. */
export async function readEnrolledFactorCount(): Promise<number | null> {
  const mod = authModule();
  const auth = mod ? authInstance(mod) : null;
  const user = auth?.currentUser;
  if (!mod || !user) return null;
  try {
    // A fresh read: the enrolment list is cached on the user object.
    await user.reload?.();
    const mf = typeof mod.multiFactor === 'function' ? mod.multiFactor(auth.currentUser) : auth.currentUser.multiFactor;
    const factors = mf?.enrolledFactors;
    return Array.isArray(factors) ? factors.length : null;
  } catch {
    return null;
  }
}

/** Sends the SMS code for enrolling `phoneE164` as a second factor. Returns the verification id. */
export async function sendEnrollmentCode(phoneE164: string): Promise<string> {
  const mod = authModule();
  const auth = mod ? authInstance(mod) : null;
  if (!mod || !auth) throw new Error('AUTH_MODULE_UNAVAILABLE');
  const session = await multiFactorUser(mod, auth).getSession();
  const options = { phoneNumber: phoneE164, session };
  return typeof auth.verifyPhoneNumberForMultiFactor === 'function'
    ? auth.verifyPhoneNumberForMultiFactor(options)
    : mod.verifyPhoneNumberForMultiFactor(auth, options);
}

/** Confirms the SMS code and finishes enrolment. */
export async function confirmEnrollment(verificationId: string, code: string): Promise<void> {
  const mod = authModule();
  const auth = mod ? authInstance(mod) : null;
  if (!mod || !auth) throw new Error('AUTH_MODULE_UNAVAILABLE');
  const credential = mod.PhoneAuthProvider.credential(verificationId, code.trim());
  const assertion = mod.PhoneMultiFactorGenerator.assertion(credential);
  await multiFactorUser(mod, auth).enroll(assertion, 'Inspector phone');
}
