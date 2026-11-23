import React, { useMemo, useState } from 'react';
import Constants from 'expo-constants';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { CheckCircle2, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthProvider';
import { BrandLogo } from '../components/BrandLogo';
import { PrimaryButton, Screen, common, useKeyboard } from '../components/ui';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import { INSPECTION_POINT } from '../constants/inspection';

export interface AuthScreenProps {
  includeTopInset?: boolean;
  showHeader?: boolean;
}

export function AuthScreen({
  includeTopInset = true,
  showHeader = true,
}: AuthScreenProps = {}) {
  const navigation = useNavigation<any>();
  const expoGo = Constants.appOwnership === 'expo' || (Constants.executionEnvironment as string) === 'storeClient';
  const { configured, busy, error, signIn, clearSessionData, mfaChallenge, confirmMfaCode, sendMfaCode, cancelMfa } = useAuth();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [otp, setOtp] = useState('');
  const [focused, setFocused] = useState(false);
  const { isKeyboardVisible } = useKeyboard();

  const isPhone = mfaChallenge?.selectedHint?.factorId === 'phone';
  const phoneLabel = mfaChallenge?.selectedHint?.phoneNumber || mfaChallenge?.selectedHint?.displayName || 'your registered phone';

  return (
    <Screen
      keyboardAvoiding={true}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      includeTopInset={includeTopInset}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.contentWrap}>
          {/* Brand Hero Lockup - dynamically compacts when keyboard is open or in MFA mode */}
          {showHeader ? (
            <View style={[styles.brandHero, (isKeyboardVisible || Boolean(mfaChallenge)) && styles.brandHeroCompact]}>
              <BrandLogo
                variant={isKeyboardVisible ? 'emblem' : 'fullLockup'}
                size={isKeyboardVisible ? 30 : mfaChallenge ? 38 : 52}
                showTagline={!isKeyboardVisible && !mfaChallenge}
                taglineText="YOUR NEXT CHAPTER"
              />
              {!isKeyboardVisible && !mfaChallenge ? (
                <View style={styles.badgeWrap}>
                  <Sparkles size={13} color={colors.brandAccent} />
                  <Text style={styles.badgeText}>INDIA'S INVENTORY-LED USED CAR PLATFORM</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.sectionHero}>
              <Text style={styles.sectionHeroTitle}>Welcome to V MOTIV</Text>
              <Text style={styles.sectionHeroSubtitle}>
                Sign in with Google to view test drive bookings, evaluations and account settings.
              </Text>
            </View>
          )}

          {/* MFA Two-Factor Challenge Card */}
          {mfaChallenge ? (
            <View style={[common.card, styles.authCard, isKeyboardVisible && styles.authCardCompact]}>
              {!isKeyboardVisible ? (
                <View style={styles.mfaIconWrap}>
                  <ShieldCheck size={36} color={colors.brandAccent} />
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
                    placeholderTextColor={colors.textMuted}
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
                    cursorColor={colors.brandAccent}
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
                  <CheckCircle2 size={16} color={colors.brandAccent} />
                  <Text style={styles.pointText}>100% verified {INSPECTION_POINT} vehicle reports</Text>
                </View>
                <View style={styles.pointRow}>
                  <CheckCircle2 size={16} color={colors.brandAccent} />
                  <Text style={styles.pointText}>Direct evaluation offers with zero middlemen</Text>
                </View>
                <View style={styles.pointRow}>
                  <CheckCircle2 size={16} color={colors.brandAccent} />
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

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Scan a V MOTIV Connect vehicle QR code without signing in"
                style={styles.connectGuestButton}
                activeOpacity={0.72}
                onPress={() => navigation.navigate('ConnectGuest')}
              >
                <Text style={styles.connectGuestText}>Scan a V MOTIV Connect QR without signing in</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.switchSessionBtn}
                activeOpacity={0.7}
                onPress={() => {
                  Alert.alert(
                    'Reset Cached Account Session?',
                    'This clears local device cache and resets the Google account picker so you can sign in with a different account.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Reset & Switch Account',
                        style: 'destructive',
                        onPress: async () => {
                          await clearSessionData();
                        },
                      },
                    ]
                  );
                }}
                disabled={busy}
              >
                <RotateCcw size={13} color={colors.textMuted} />
                <Text style={styles.switchSessionText}>Switch account or clear session cache</Text>
              </TouchableOpacity>

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

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
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
    sectionHero: {
      paddingVertical: space.md,
      gap: 4,
    },
    sectionHeroTitle: {
      color: colors.textPrimary,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    sectionHeroSubtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    badgeWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.1)' : 'rgba(247, 181, 3, 0.15)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(247, 181, 3, 0.3)' : 'rgba(247, 181, 3, 0.4)',
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginTop: space.xs,
    },
    badgeText: {
      color: isDark ? colors.brandAccent : '#92400E',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    authCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
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
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.12)' : 'rgba(247, 181, 3, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(247, 181, 3, 0.3)' : 'rgba(247, 181, 3, 0.4)',
    },
    titleWrap: {
      gap: 6,
    },
    cardHeading: {
      color: colors.textPrimary,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    cardHeadingCompact: {
      fontSize: 19,
      textAlign: 'center',
    },
    cardSubtext: {
      color: colors.textSecondary,
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
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
    },
    otpInput: {
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(247, 181, 3, 0.4)' : colors.brandNavy,
      borderRadius: radius.md,
      color: colors.textPrimary,
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: 10,
      textAlign: 'center',
      paddingVertical: 14,
      paddingHorizontal: space.md,
    },
    otpInputFocused: {
      borderColor: colors.brandAccent,
      backgroundColor: isDark ? 'rgba(10, 36, 71, 0.95)' : '#FFFFFF',
    },
    linkPressable: {
      paddingVertical: 4,
      alignItems: 'center',
    },
    pressed: {
      opacity: 0.7,
    },
    resendText: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
    },
    cancelText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
    },
    pointsList: {
      gap: 10,
      backgroundColor: colors.surfaceSecondary,
      padding: space.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pointRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    pointText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    noticeBox: {
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.12)' : '#FFFBEB',
      padding: space.md,
      borderRadius: radius.sm,
      borderLeftWidth: 3,
      borderLeftColor: colors.brandAccent,
    },
    notice: {
      color: isDark ? colors.brandAccent : '#92400E',
      fontSize: 12.5,
      lineHeight: 18,
    },
    errorBox: {
      backgroundColor: colors.errorBackground,
      padding: space.md,
      borderRadius: radius.sm,
      borderLeftWidth: 3,
      borderLeftColor: colors.error,
    },
    error: {
      color: colors.error,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
    },
    switchSessionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: space.xs,
      paddingHorizontal: space.sm,
      alignSelf: 'center',
    },
    connectGuestButton: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.brandAccent,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.lg,
    },
    connectGuestText: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
      fontSize: 13,
      fontWeight: '800',
      textAlign: 'center',
    },
    switchSessionText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    legal: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
    },
  });
