import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CarFront,
  CheckCircle,
  Clock,
  ExternalLink,
  FileText,
  HelpCircle,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import { formatPaise } from '../format';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import type { RootStack } from '../navigation/types';
import type { PurchaseEnquiry } from '../types';

type Props = NativeStackScreenProps<RootStack, 'PurchaseEnquiryDetails'>;

const TIMELINE_STEPS = [
  { key: 'RECEIVED', label: 'Received', desc: 'Enquiry logged & queued' },
  { key: 'IN_REVIEW', label: 'Under Review', desc: 'Specialist reviewing car & availability' },
  { key: 'CONTACTED', label: 'Consultation', desc: 'Advisor in touch / Quote prepared' },
  { key: 'CLOSED', label: 'Completed', desc: 'Deal concluded or closed' },
];

export function PurchaseEnquiryDetailsScreen({ route, navigation }: Props) {
  const { enquiryId } = route.params;
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [enquiry, setEnquiry] = useState<PurchaseEnquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  function loadEnquiry() {
    setLoading(true);
    customer
      .purchaseEnquiry(enquiryId)
      .then(setEnquiry)
      .catch((err) => {
        Alert.alert('Error', err.message || 'Failed to load enquiry details');
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadEnquiry();
  }, [enquiryId]);

  function handleCallAdvisor(phone?: string | null) {
    const target = phone || '+918000000000';
    Linking.openURL(`tel:${target}`).catch(() => {
      Alert.alert('Unable to Call', `Please dial ${target} directly.`);
    });
  }

  async function handleCancelEnquiry() {
    Alert.alert(
      'Withdraw Enquiry',
      'Are you sure you want to withdraw this purchase enquiry?',
      [
        { text: 'Keep Enquiry', style: 'cancel' },
        {
          text: 'Yes, Withdraw',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await customer.cancelPurchaseEnquiry(enquiryId, 'Cancelled by buyer');
              Alert.alert('Enquiry Withdrawn', 'Your purchase enquiry has been cancelled.');
              loadEnquiry();
            } catch (err: any) {
              Alert.alert('Unable to Withdraw', err.message || 'This enquiry could not be cancelled.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Buyer Enquiry</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandAccent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!enquiry) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Buyer Enquiry</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>Enquiry details not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { listing, quotations } = enquiry;
  const vehicle = listing?.vehicle;
  const latestQuote = quotations && quotations.length > 0 ? quotations[0] : null;
  const thumbnail = listing?.media?.[0]?.url || null;
  const isClosed = enquiry.status === 'CLOSED';
  const canWithdraw = !isClosed;

  // Compute status step index
  const statusOrder: Record<string, number> = {
    RECEIVED: 0,
    IN_REVIEW: 1,
    CONTACTED: 2,
    CLOSED: 3,
  };
  const currentStepIdx = statusOrder[enquiry.status] ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buyer Enquiry</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Vehicle Header Card */}
        <View style={styles.carHeaderCard}>
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.carImage} resizeMode="cover" />
          ) : (
            <View style={styles.carImageFallback}>
              <CarFront size={48} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.carInfo}>
            <View style={styles.badgeRow}>
              <View style={[styles.statusBadge, isClosed ? styles.statusBadgeClosed : styles.statusBadgeActive]}>
                <Text style={styles.statusBadgeText}>
                  {enquiry.status.replace(/_/g, ' ')}
                </Text>
              </View>
              <Text style={styles.refCode}>#{enquiry.id.slice(0, 8).toUpperCase()}</Text>
            </View>

            <Text style={styles.carTitle}>{listing?.title || 'Vehicle Listing'}</Text>

            {vehicle ? (
              <View style={styles.specsRow}>
                <Text style={styles.specItem}>
                  {vehicle.manufacturingYear} · {vehicle.fuelType} · {vehicle.transmission}
                </Text>
                {vehicle.odometerKm ? (
                  <Text style={styles.specItem}> · {(vehicle.odometerKm).toLocaleString('en-IN')} km</Text>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.carPrice}>{formatPaise(listing?.pricePaise || '0')}</Text>

            <TouchableOpacity
              style={styles.viewListingBtn}
              onPress={() => navigation.navigate('Vehicle', { listingId: listing.id })}
            >
              <Text style={styles.viewListingText}>View Vehicle Catalog</Text>
              <ExternalLink size={14} color={colors.brandAccent} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Timeline Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Enquiry Progress Workflow</Text>
          <View style={styles.timelineRow}>
            {TIMELINE_STEPS.map((step, idx) => {
              const isPast = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              return (
                <View key={step.key} style={styles.timelineStep}>
                  <View
                    style={[
                      styles.stepDot,
                      isPast && styles.stepDotDone,
                      isCurrent && styles.stepDotActive,
                    ]}
                  >
                    {isPast ? <CheckCircle size={14} color={color.navy} /> : null}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      (isPast || isCurrent) && styles.stepLabelActive,
                    ]}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Current Step Explanation */}
          <View style={styles.stepExplainer}>
            <Clock size={16} color={colors.brandAccent} />
            <Text style={styles.stepExplainerText}>
              {enquiry.status === 'RECEIVED' &&
                'Your enquiry has been safely received. A dedicated relationship advisor is assigned to verify vehicle availability and ownership dossier.'}
              {enquiry.status === 'IN_REVIEW' &&
                'A vehicle specialist is currently reviewing this vehicle, preparing technical reports and personalized quotation terms.'}
              {enquiry.status === 'CONTACTED' &&
                'Consultation is active. Your advisor is ready to coordinate test drives, quotation acceptance, or delivery reservation.'}
              {enquiry.status === 'CLOSED' &&
                'This enquiry workflow has concluded. Feel free to explore other certified inventory or submit a new request.'}
            </Text>
          </View>
        </View>

        {/* Customer Enquiry Message Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.sectionTitle}>Your Message & Enquiry</Text>
            <Text style={styles.dateText}>
              {new Date(enquiry.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </Text>
          </View>
          {enquiry.message ? (
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>"{enquiry.message}"</Text>
            </View>
          ) : (
            <Text style={styles.noMessageText}>Standard enquiry regarding availability and pricing.</Text>
          )}
        </View>

        {/* Retail Quotation Card (if prepared by sales) */}
        {latestQuote ? (
          <View style={[styles.card, styles.quoteCard]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.quoteTitleRow}>
                <FileText size={18} color={colors.brandAccent} />
                <Text style={styles.quoteTitle}>Retail On-Road Quotation</Text>
              </View>
              <View style={[styles.quoteBadge, { backgroundColor: latestQuote.status === 'SHARED' ? 'rgba(97, 217, 154, 0.15)' : 'rgba(247, 181, 3, 0.15)' }]}>
                <Text style={[styles.quoteBadgeText, { color: latestQuote.status === 'SHARED' ? '#61D99A' : colors.brandAccent }]}>
                  {latestQuote.status}
                </Text>
              </View>
            </View>

            <View style={styles.breakdownTable}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Base Vehicle Price</Text>
                <Text style={styles.breakdownValue}>{formatPaise(latestQuote.basePricePaise)}</Text>
              </View>
              {latestQuote.chargesPaise && latestQuote.chargesPaise !== '0' ? (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Taxes, Insurance & Transfer</Text>
                  <Text style={styles.breakdownValue}>+ {formatPaise(latestQuote.chargesPaise)}</Text>
                </View>
              ) : null}
              {latestQuote.discountPaise && latestQuote.discountPaise !== '0' ? (
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: '#61D99A' }]}>Approved Discount</Text>
                  <Text style={[styles.breakdownValue, { color: '#61D99A' }]}>- {formatPaise(latestQuote.discountPaise)}</Text>
                </View>
              ) : null}
              <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                <Text style={styles.breakdownTotalLabel}>Final On-Road Offer</Text>
                <Text style={styles.breakdownTotalValue}>{formatPaise(latestQuote.finalAmountPaise)}</Text>
              </View>
            </View>

            {latestQuote.validUntil ? (
              <Text style={styles.validityText}>
                Quote valid until {new Date(latestQuote.validUntil).toLocaleDateString('en-IN')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Assigned Vehicle Advisor Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Assigned Vehicle Specialist</Text>
          <View style={styles.advisorRow}>
            <View style={styles.advisorAvatar}>
              <User size={24} color={colors.brandAccent} />
            </View>
            <View style={styles.advisorInfo}>
              <Text style={styles.advisorName}>
                {latestQuote?.authorName || 'V MOTIV Concierge Advisor'}
              </Text>
              <Text style={styles.advisorTitle}>Relationship & Sales Desk</Text>
            </View>
            <TouchableOpacity
              style={styles.callAdvisorBtn}
              onPress={() => handleCallAdvisor(latestQuote?.authorPhone)}
            >
              <Phone size={18} color="#061A38" />
              <Text style={styles.callAdvisorText}>Call</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.sectionTitle}>Next Steps & Services</Text>

          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={() =>
              navigation.navigate('TestDrive', {
                listingId: listing.id,
                title: listing.title,
              })
            }
          >
            <Calendar size={18} color="#061A38" />
            <Text style={styles.primaryActionText}>Schedule Showroom Test Drive</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryActionButton}
            onPress={() => navigation.navigate('Support')}
          >
            <HelpCircle size={18} color={colors.textPrimary} />
            <Text style={styles.secondaryActionText}>Ask Support Desk / Financing Help</Text>
          </TouchableOpacity>

          {canWithdraw && (
            <TouchableOpacity
              style={styles.withdrawButton}
              onPress={handleCancelEnquiry}
              disabled={actionLoading}
            >
              <XCircle size={16} color="#FF7C86" />
              <Text style={styles.withdrawText}>
                {actionLoading ? 'Cancelling...' : 'Withdraw Enquiry'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    backBtn: {
      padding: space.xs,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textPrimary,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.xl,
    },
    errorText: {
      fontSize: 15,
      color: c.textMuted,
      textAlign: 'center',
    },
    content: {
      padding: space.md,
      gap: space.md,
    },
    carHeaderCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    carImage: {
      width: '100%',
      height: 180,
    },
    carImageFallback: {
      width: '100%',
      height: 140,
      backgroundColor: isDark ? '#061A38' : '#E2E8F0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    carInfo: {
      padding: space.md,
      gap: space.xs,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space.xs,
    },
    statusBadge: {
      paddingHorizontal: space.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
    },
    statusBadgeActive: {
      backgroundColor: 'rgba(247, 181, 3, 0.15)',
    },
    statusBadgeClosed: {
      backgroundColor: 'rgba(174, 187, 208, 0.15)',
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.brandAccent,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    refCode: {
      fontSize: 12,
      fontFamily: 'monospace',
      color: c.textMuted,
    },
    carTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: c.textPrimary,
    },
    specsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    specItem: {
      fontSize: 13,
      color: c.textMuted,
    },
    carPrice: {
      fontSize: 22,
      fontWeight: '800',
      color: c.brandAccent,
      marginVertical: 4,
    },
    viewListingBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      marginTop: space.xs,
      paddingVertical: 4,
    },
    viewListingText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.brandAccent,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.md,
      gap: space.sm,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: space.xs,
    },
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingVertical: space.sm,
    },
    timelineStep: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
    },
    stepDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: isDark ? '#10294F' : '#E2E8F0',
      borderWidth: 2,
      borderColor: isDark ? '#29466D' : '#CBD5E1',
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepDotActive: {
      backgroundColor: c.brandAccent,
      borderColor: c.brandAccent,
    },
    stepDotDone: {
      backgroundColor: '#61D99A',
      borderColor: '#61D99A',
    },
    stepLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: c.textMuted,
      textAlign: 'center',
    },
    stepLabelActive: {
      color: c.textPrimary,
      fontWeight: '700',
    },
    stepExplainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      backgroundColor: isDark ? '#061A38' : '#F1F5F9',
      padding: space.sm,
      borderRadius: radius.md,
      marginTop: space.xs,
    },
    stepExplainerText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 18,
      color: c.textSecondary,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dateText: {
      fontSize: 12,
      color: c.textMuted,
    },
    messageBox: {
      backgroundColor: isDark ? '#04132B' : '#F8FAFC',
      borderLeftWidth: 3,
      borderLeftColor: c.brandAccent,
      padding: space.sm,
      borderRadius: radius.sm,
    },
    messageText: {
      fontSize: 13,
      fontStyle: 'italic',
      color: c.textPrimary,
      lineHeight: 20,
    },
    noMessageText: {
      fontSize: 13,
      color: c.textMuted,
    },
    quoteCard: {
      borderColor: 'rgba(247, 181, 3, 0.4)',
      backgroundColor: isDark ? '#071830' : '#FFFDF5',
    },
    quoteTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    quoteTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
    },
    quoteBadge: {
      paddingHorizontal: space.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
    },
    quoteBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    breakdownTable: {
      gap: 6,
      marginVertical: space.xs,
    },
    breakdownRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    breakdownLabel: {
      fontSize: 13,
      color: c.textSecondary,
    },
    breakdownValue: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textPrimary,
    },
    breakdownTotal: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: space.xs,
      marginTop: space.xs,
    },
    breakdownTotalLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: c.textPrimary,
    },
    breakdownTotalValue: {
      fontSize: 18,
      fontWeight: '800',
      color: c.brandAccent,
    },
    validityText: {
      fontSize: 11,
      color: c.textMuted,
      fontStyle: 'italic',
    },
    advisorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    advisorAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? '#061A38' : '#EEF2F6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    advisorInfo: {
      flex: 1,
    },
    advisorName: {
      fontSize: 14,
      fontWeight: '700',
      color: c.textPrimary,
    },
    advisorTitle: {
      fontSize: 12,
      color: c.textMuted,
    },
    callAdvisorBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.brandAccent,
      paddingHorizontal: space.md,
      paddingVertical: 8,
      borderRadius: radius.md,
    },
    callAdvisorText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#061A38',
    },
    actionsCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.md,
      gap: space.sm,
    },
    primaryActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      backgroundColor: c.brandAccent,
      paddingVertical: 12,
      borderRadius: radius.md,
    },
    primaryActionText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#061A38',
    },
    secondaryActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      backgroundColor: isDark ? '#0A244C' : '#F1F5F9',
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      borderRadius: radius.md,
    },
    secondaryActionText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textPrimary,
    },
    withdrawButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      marginTop: space.xs,
    },
    withdrawText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#FF7C86',
    },
  });
}
