import React, { useState } from 'react';
import Constants from 'expo-constants';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react-native';
import { useAuth } from '../auth/AuthProvider';
import { BrandLogo } from '../components/BrandLogo';
import { PrimaryButton, Screen, common, useKeyboard } from '../components/ui';
import { color, radius, space } from '../theme';

export function AuthScreen() {
  const expoGo = Constants.appOwnership === 'expo' || (Constants.executionEnvironment as string) === 'storeClient';
  const { configured, busy, error, signIn, mfaChallenge, confirmMfaCode, sendMfaCode, cancelMfa } = useAuth();
  const [otp, setOtp] = useState('');
  const [focused, setFocused] = useState(false);
  const { isKeyboardVisible } = useKeyboard();

  const isPhone = mfaChallenge?.selectedHint?.factorId === 'phone';
  const phoneLabel = mfaChallenge?.selectedHint?.phoneNumber || mfaChallenge?.selectedHint?.displayName || 'your registered phone';

  return (
    <Screen keyboardAvoiding={true} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.contentWrap}>
          {/* Brand Hero Lockup - dynamically compacts when keyboard is open or in MFA mode */}
          <View style={[styles.brandHero, (isKeyboardVisible || Boolean(mfaChallenge)) && styles.brandHeroCompact]}>
            <BrandLogo
              variant={isKeyboardVisible ? 'emblem' : 'fullLockup'}
              size={isKeyboardVisible ? 30 : mfaChallenge ? 38 : 52}
              showTagline={!isKeyboardVisible && !mfaChallenge}
              taglineText="YOUR NEXT CHAPTER"
            />
            {!isKeyboardVisible && !mfaChallenge ? (
              <View style={styles.badgeWrap}>
                <Sparkles size={13} color={color.yellow} />
                <Text style={styles.badgeText}>INDIA'S INVENTORY-LED USED CAR PLATFORM</Text>
              </View>
            ) : null}
          </View>

          {/* MFA Two-Factor Challenge Card */}
          {mfaChallenge ? (
            <View style={[common.card, styles.authCard, isKeyboardVisible && styles.authCardCompact]}>
              {!isKeyboardVisible ? (
                <View style={styles.mfaIconWrap}>
                  <ShieldCheck size={36} color={color.yellow} />
                </View>
              ) : null}

              <View style={styles.titleWrap}>
                <Text style={[styles.cardHeading, isKeyboardVisible && styles.cardHeadingCompact]}>
                  Two-Factor Verification
                </Text>
                <Text
                  style={[styles.cardSubtext, isKeyboardVisible && styles.cardSubtextCompact]}
                  numberOfLines={isKeyboardVisible ? 2 : undefined}
                >
                  {isPhone
                    ? mfaChallenge.codeSent
                      ? `SMS code sent to ${phoneLabel}. Enter 6 digits to verify.`
                      : `Two-factor authentication is required. Request SMS code to ${phoneLabel}.`
                    : 'Enter the 6-digit code from your authenticator app.'}
                </Text>
              </View>

              {/* Notices & Errors */}
              {error ? (
                <View style={styles.errorBox}>
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {/* OTP Input (when code is sent or for TOTP) */}
              {mfaChallenge.codeSent || !isPhone ? (
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>6-DIGIT VERIFICATION CODE</Text>
                  <TextInput
                    style={[styles.otpInput, focused && styles.otpInputFocused]}
                    placeholder="••••••"
                    placeholderTextColor={color.muted}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otp}
                    onChangeText={text => {
                      const digits = text.replace(/\D/g, '');
                      setOtp(digits);
                      if (digits.length === 6) {
                        Keyboard.dismiss();
                      }
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      if (otp.trim().length >= 6) {
                        void confirmMfaCode(otp);
                      }
                    }}
                    cursorColor={color.yellow}
                    selectionColor="rgba(247, 181, 3, 0.3)"
                    autoFocus
                    editable={!busy}
                  />
                </View>
              ) : null}

              {/* Verification Actions */}
              {!mfaChallenge.codeSent && isPhone ? (
                <PrimaryButton
                  title="Send SMS Verification Code"
                  onPress={() => void sendMfaCode()}
                  busy={busy}
                />
              ) : (
                <PrimaryButton
                  title="Verify & Sign In"
                  onPress={() => void confirmMfaCode(otp)}
                  busy={busy}
                  disabled={otp.trim().length < 6}
                />
              )}

              {isPhone && mfaChallenge.codeSent ? (
                <Pressable
                  onPress={() => void sendMfaCode()}
                  disabled={busy}
                  style={({ pressed }) => [styles.linkPressable, pressed && styles.pressed]}
                >
                  <Text style={styles.resendText}>Didn't receive code? Resend SMS</Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={cancelMfa}
                disabled={busy}
                style={({ pressed }) => [styles.linkPressable, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>Cancel & return to sign in</Text>
              </Pressable>
            </View>
          ) : (
            /* Main Pitch Card */
            <View style={[common.card, styles.authCard]}>
              <View style={styles.titleWrap}>
                <Text style={styles.cardHeading}>Sign in to your account</Text>
                <Text style={styles.cardSubtext}>
                  Save your favourite cars, book doorstep test drives, sell your used car, and track inspection offers in real-time.
                </Text>
              </View>

              {/* 3 Checkpoints */}
              <View style={styles.pointsList}>
                <View style={styles.pointRow}>
                  <CheckCircle2 size={16} color={color.yellow} />
                  <Text style={styles.pointText}>100% verified 180-point vehicle reports</Text>
                </View>
                <View style={styles.pointRow}>
                  <CheckCircle2 size={16} color={color.yellow} />
                  <Text style={styles.pointText}>Direct evaluation offers with zero middlemen</Text>
                </View>
                <View style={styles.pointRow}>
                  <CheckCircle2 size={16} color={color.yellow} />
                  <Text style={styles.pointText}>Secure customer privacy & data protection</Text>
                </View>
              </View>

              {/* Notices & Errors */}
              {!configured ? (
                <View style={styles.noticeBox}>
                  <Text style={styles.notice}>
                    Google Sign-In is initializing. Reopen the app or reload in your development build.
                  </Text>
                </View>
              ) : null}

              {error ? (
                <View style={styles.errorBox}>
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {/* Google Sign-In Action */}
              <PrimaryButton
                title={expoGo ? 'Open V MOTIV for Google sign-in' : 'Continue with Google'}
                onPress={() => void signIn()}
                busy={busy}
                disabled={!configured}
              />

              <Text style={styles.legal}>
                By continuing, you agree to the V MOTIV Terms of Service and acknowledge the Privacy Notice. We never post or share without your consent.
              </Text>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contentWrap: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: space.md,
  },
  brandHero: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xl,
    gap: space.md,
  },
  brandHeroCompact: {
    paddingVertical: space.xs,
    gap: space.xs,
  },
  badgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(247, 181, 3, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.3)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: space.xs,
  },
  badgeText: {
    color: color.yellow,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  authCard: {
    gap: space.lg,
    padding: space.xl,
  },
  authCardCompact: {
    gap: space.md,
    padding: space.lg,
  },
  mfaIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.3)',
  },
  titleWrap: {
    gap: 6,
  },
  cardHeading: {
    color: color.white,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  cardHeadingCompact: {
    fontSize: 19,
    textAlign: 'center',
  },
  cardSubtext: {
    color: color.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  cardSubtextCompact: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  inputWrap: {
    gap: 6,
  },
  inputLabel: {
    color: color.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  otpInput: {
    backgroundColor: color.input,
    borderWidth: 1.5,
    borderColor: 'rgba(247, 181, 3, 0.4)',
    borderRadius: radius.md,
    color: color.white,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: space.md,
  },
  otpInputFocused: {
    borderColor: color.yellow,
    backgroundColor: 'rgba(10, 36, 71, 0.95)',
    shadowColor: color.yellow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  linkPressable: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  resendText: {
    color: color.yellow,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  cancelText: {
    color: color.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  pointsList: {
    gap: 10,
    backgroundColor: color.input,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pointText: {
    color: color.text,
    fontSize: 13,
    fontWeight: '600',
  },
  noticeBox: {
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    padding: space.md,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: color.yellow,
  },
  notice: {
    color: color.yellow,
    fontSize: 12.5,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    padding: space.md,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: color.danger,
  },
  error: {
    color: color.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  legal: {
    color: color.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
