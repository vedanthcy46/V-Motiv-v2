import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, CheckCircle, HelpCircle, Mail, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react-native';
import { customer } from '../services/customer';
import { useAuth } from '../auth/AuthProvider';
import { color, radius, space } from '../theme';
import type { RootStack } from '../navigation/types';

type Props = NativeStackScreenProps<RootStack, 'PurchaseEnquiry'>;

const QUICK_TOPICS = [
  'Financing & EMI plans',
  'Car exchange / trade-in',
  'Best price & discounts',
  'Warranty & inspection report',
  'Doorstep delivery options',
];

export function PurchaseEnquiryScreen({ route, navigation }: Props) {
  const { listingId, title } = route.params;
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  function handleSelectTopic(topic: string) {
    setErrorMessage('');
    const prompt = `I would like more information regarding ${topic.toLowerCase()} for this ${title}.`;
    if (!message.trim()) {
      setMessage(prompt);
    } else if (!message.includes(topic)) {
      setMessage((prev) => `${prev.trim()}\n• Also inquiring about: ${topic}`);
    }
  }

  async function handleSubmit() {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to submit a purchase enquiry.');
      return;
    }

    const trimmed = message.trim();
    if (!trimmed) {
      setErrorMessage('Please enter your enquiry or select a quick topic below.');
      Alert.alert('Message Required', 'Please provide your question or topic of interest so our team can help you effectively.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${Math.random().toString(36).slice(2, 9)}`;
      await customer.createPurchaseEnquiry({
        listingId,
        message: trimmed,
        idempotencyKey,
      });
      setSubmitted(true);
    } catch (err: any) {
      Alert.alert('Submission Failed', err.message || 'Could not submit your enquiry. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <CheckCircle size={64} color="#22C55E" />
          <Text style={styles.successTitle}>Enquiry Recorded!</Text>
          <Text style={styles.successSubtitle}>
            Your enquiry for {title} is recorded in Activity. Operations will review availability before any sales follow-up is confirmed.
          </Text>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('Tabs', { screen: 'Activity' })}
          >
            <Text style={styles.actionBtnText}>View in Activity</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isMessageValid = message.trim().length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={color.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Purchase Enquiry</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.vehicleCard}>
            <Text style={styles.vehicleLabel}>Selected Vehicle</Text>
            <Text style={styles.vehicleTitle}>{title}</Text>
          </View>

          <View style={styles.assuranceBanner}>
            <ShieldCheck size={20} color={color.yellow} />
            <Text style={styles.assuranceText}>
              This creates an enquiry only. It does not reserve the vehicle, approve finance, or confirm a test drive.
            </Text>
          </View>

          {/* Quick Topics */}
          <View style={styles.topicsSection}>
            <View style={styles.topicsHeader}>
              <Sparkles size={14} color={color.yellow} />
              <Text style={styles.topicsLabel}>Common Questions (Tap to add)</Text>
            </View>
            <View style={styles.chipRow}>
              {QUICK_TOPICS.map((topic) => (
                <TouchableOpacity
                  key={topic}
                  style={styles.chip}
                  activeOpacity={0.7}
                  onPress={() => handleSelectTopic(topic)}
                >
                  <Text style={styles.chipText}>+ {topic}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>
                Your Message or Questions <Text style={styles.requiredStar}>*</Text>
              </Text>
              <Text style={styles.charCount}>{message.length}/500</Text>
            </View>
            <TextInput
              style={[
                styles.textArea,
                Boolean(errorMessage) && styles.textAreaError,
              ]}
              placeholder="Tell us what you would like to know (e.g. financing options, price breakdown, exchange, or inspection details)..."
              placeholderTextColor={color.muted}
              multiline
              maxLength={500}
              numberOfLines={4}
              value={message}
              onChangeText={(text) => {
                setMessage(text);
                if (errorMessage && text.trim()) setErrorMessage('');
              }}
            />
            {Boolean(errorMessage) && (
              <Text style={styles.errorText}>{errorMessage}</Text>
            )}
          </View>

          <View style={styles.contactCard}>
            <Mail size={16} color={color.muted} />
            <Text style={styles.contactText}>
              Replies will be sent to your registered email: {user?.email}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!isMessageValid || loading) && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color={color.navy} />
            ) : (
              <Text
                style={[
                  styles.submitBtnText,
                  !isMessageValid && styles.submitBtnTextDisabled,
                ]}
              >
                Submit Enquiry
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  backBtn: {
    padding: space.xs,
  },
  headerTitle: {
    color: color.white,
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    padding: space.md,
  },
  vehicleCard: {
    backgroundColor: color.navy,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.md,
  },
  vehicleLabel: {
    color: color.muted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vehicleTitle: {
    color: color.white,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  assuranceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: 'rgba(247, 181, 3, 0.08)',
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.2)',
  },
  assuranceText: {
    color: '#D1D5DB',
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  topicsSection: {
    marginBottom: space.md,
  },
  topicsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: space.xs,
  },
  topicsLabel: {
    color: color.yellow,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  chipText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '500',
  },
  formGroup: {
    marginBottom: space.md,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  label: {
    color: color.white,
    fontSize: 13,
    fontWeight: '600',
  },
  requiredStar: {
    color: color.yellow,
    fontWeight: '700',
  },
  charCount: {
    color: color.muted,
    fontSize: 11,
  },
  textArea: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    color: color.white,
    fontSize: 14,
    borderWidth: 1,
    borderColor: color.border,
    textAlignVertical: 'top',
    height: 120,
  },
  textAreaError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.xl,
    borderWidth: 1,
    borderColor: color.border,
  },
  contactText: {
    color: color.muted,
    fontSize: 12,
    flex: 1,
  },
  submitBtn: {
    backgroundColor: color.yellow,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  submitBtnText: {
    color: color.navy,
    fontSize: 15,
    fontWeight: '700',
  },
  submitBtnTextDisabled: {
    color: color.muted,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
  },
  successTitle: {
    color: color.white,
    fontSize: 22,
    fontWeight: '800',
    marginTop: space.lg,
  },
  successSubtitle: {
    color: color.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: space.sm,
    lineHeight: 22,
    marginBottom: space.xl,
  },
  actionBtn: {
    backgroundColor: color.yellow,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  actionBtnText: {
    color: color.navy,
    fontSize: 15,
    fontWeight: '700',
  },
});
