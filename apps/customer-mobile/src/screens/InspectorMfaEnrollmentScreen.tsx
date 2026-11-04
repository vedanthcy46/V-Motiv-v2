import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldCheck } from 'lucide-react-native';
import { useAuth } from '../auth/AuthProvider';
import { confirmEnrollment, sendEnrollmentCode } from '../auth/mfa-enrollment-service';
import { mfaEnrollmentErrorMessage, normalizeIndianMobile } from '../auth/mfa-enrollment';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { KeyboardScrollView } from '../components/KeyboardScrollView';
import { safeBottom } from '../layout/safe-layout';
import { radius, space, useAppTheme } from '../theme';

type Step = 'phone' | 'code' | 'done';

/**
 * First-login gate for field inspectors: they must add a phone second factor (like the staff portals)
 * before they can use the inspection app. After enrolment they sign in again so the new session
 * carries the second factor.
 */
export function InspectorMfaEnrollmentScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { signOut } = useAuth();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendCode() {
    const e164 = normalizeIndianMobile(phone);
    if (!e164) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setVerificationId(await sendEnrollmentCode(e164));
      setStep('code');
    } catch (err) {
      setError(mfaEnrollmentErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!verificationId || code.trim().length < 6) {
      setError('Enter the 6-digit code from the SMS.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await confirmEnrollment(verificationId, code);
      setStep('done');
    } catch (err) {
      setError(mfaEnrollmentErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <KeyboardAvoider style={{ flex: 1 }}>
        <KeyboardScrollView
          contentContainerStyle={[styles.content, { paddingBottom: safeBottom(insets.bottom, space.lg) + space.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSecondary }]}>
            <ShieldCheck size={32} color={colors.brandAccent} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
            Set up two-factor verification
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Field inspectors handle customer details and vehicle documents, so V MOTIV requires a second verification step, the same as our staff portals. You only set this up once.
          </Text>

          {step === 'phone' && (
            <>
              <Text style={[styles.label, { color: colors.textPrimary }]}>Mobile number for verification codes</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder="98765 43210"
                placeholderTextColor={colors.textMuted}
                maxLength={16}
                accessibilityLabel="Mobile number"
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
              <Primary title="Send code" busy={busy} onPress={sendCode} />
            </>
          )}

          {step === 'code' && (
            <>
              <Text style={[styles.label, { color: colors.textPrimary }]}>Enter the 6-digit code we sent by SMS</Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                placeholder="123456"
                placeholderTextColor={colors.textMuted}
                maxLength={6}
                accessibilityLabel="Verification code"
                style={[styles.input, styles.codeInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
              <Primary title="Verify and enable" busy={busy} onPress={verify} />
              <TouchableOpacity onPress={() => { setStep('phone'); setCode(''); setError(''); }} style={styles.link} accessibilityRole="button">
                <Text style={{ color: colors.brandAccent, fontWeight: '700' }}>Use a different number</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'done' && (
            <>
              <Text style={[styles.success, { color: '#10B981' }]}>Two-factor verification is now on.</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                Sign in again to continue. You will be asked for an SMS code each time you sign in.
              </Text>
              <Primary title="Sign in again" busy={false} onPress={() => void signOut()} />
            </>
          )}

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          {step !== 'done' && (
            <TouchableOpacity onPress={() => void signOut()} style={styles.link} accessibilityRole="button">
              <Text style={{ color: colors.textMuted }}>Sign out</Text>
            </TouchableOpacity>
          )}
        </KeyboardScrollView>
      </KeyboardAvoider>
    </View>
  );
}

function Primary({ title, busy, onPress }: { title: string; busy: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={[styles.primary, { backgroundColor: colors.brandAccent, opacity: busy ? 0.7 : 1 }]}
    >
      {busy ? <ActivityIndicator color={colors.brandNavy} /> : <Text style={[styles.primaryText, { color: colors.brandNavy }]}>{title}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: space.lg, gap: space.md },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: space.xl },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '700', marginTop: space.md },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 13, fontSize: 16 },
  codeInput: { letterSpacing: 8, textAlign: 'center', fontSize: 22, fontWeight: '700' },
  primary: { borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: space.sm },
  primaryText: { fontSize: 15, fontWeight: '800' },
  link: { alignItems: 'center', paddingVertical: space.sm },
  error: { color: '#EF4444', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  success: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
});
