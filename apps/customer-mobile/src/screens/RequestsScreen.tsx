import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  Bell,
  Calendar,
  CarFront,
  CheckCircle,
  ChevronRight,
  Clock,
  IndianRupee,
  MapPin,
  QrCode,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import { fetchCustomerServiceRequests, type ServiceRequestSummary } from '../services/service-api';
import { fetchCustomerRentals, type RentalBookingDetails } from '../services/rental-api';
import { fetchConnectAlerts, markConnectAlertRead, type ConnectNotificationItem } from '../services/connect-api';
import { useAuth } from '../auth/AuthProvider';
import { BrandLogo } from '../components/BrandLogo';
import { AuthScreen } from './AuthScreen';
import { useAppTheme, radius, space } from '../theme';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useTabScreenBottomPadding } from '../layout/safe-layout';
import { formatPaise, friendlyError } from '../format';
import type { ActivityItem, PurchaseEnquiry, SellingRequest, SupportCase, TestDrive } from '../types';

type FeedEntry =
  | { type: 'activity'; key: string; ts: number; item: ActivityItem }
  | { type: 'service'; key: string; ts: number; item: ServiceRequestSummary }
  | { type: 'rental'; key: string; ts: number; item: RentalBookingDetails }
  | { type: 'connect'; key: string; ts: number; item: ConnectNotificationItem };

function timeOf(value?: string | null): number {
  const t = value ? new Date(value).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

type FilterTab = 'ALL' | 'CONNECT' | 'SERVICE' | 'RENTAL' | 'SELLING' | 'TEST_DRIVES' | 'PURCHASES' | 'SUPPORT';

export function RequestsScreen() {
  const tabBottomPadding = useTabScreenBottomPadding();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { state } = useAuth();
  const { theme, isDark } = useAppTheme();
  const c = theme.colors;

  const [filter, setFilter] = useState<FilterTab>('ALL');
  const [drives, setDrives] = useState<TestDrive[]>([]);
  const [selling, setSelling] = useState<SellingRequest[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEnquiry[]>([]);
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestSummary[]>([]);
  const [rentals, setRentals] = useState<RentalBookingDetails[]>([]);
  const [connectAlerts, setConnectAlerts] = useState<ConnectNotificationItem[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPages, setActivityPages] = useState(1);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // The All tab merges EVERY activity source so nothing is hidden behind a type filter.
  const feed = useMemo<FeedEntry[]>(() => {
    const entries: FeedEntry[] = [
      ...activityItems.map((item): FeedEntry => ({ type: 'activity', key: 'a:' + item.id, ts: timeOf(item.updatedAt), item })),
      ...serviceRequests.map((item): FeedEntry => ({ type: 'service', key: 's:' + item.id, ts: timeOf(item.createdAt), item })),
      ...rentals.map((item): FeedEntry => ({ type: 'rental', key: 'r:' + item.id, ts: timeOf(item.updatedAt || item.createdAt), item })),
      ...connectAlerts.map((item): FeedEntry => ({ type: 'connect', key: 'c:' + item.id, ts: timeOf(item.createdAt), item })),
    ];
    return entries.sort((x, y) => y.ts - x.ts);
  }, [activityItems, serviceRequests, rentals, connectAlerts]);

  // silent = background refresh: no spinner, keeps what is on screen, throws on failure so the refresher can back off.
  const loadData = useCallback(async (silent = false) => {
    if (state !== 'signed-in') return;
    try {
      if (!silent) setError('');
      const [d, s, p, cs, activity, sr, ca, rnt] = await Promise.all([
        customer.testDrives(),
        customer.sellingRequests(),
        customer.purchaseEnquiries(),
        customer.supportCases(),
        customer.activity(),
        fetchCustomerServiceRequests().catch(() => []),
        fetchConnectAlerts().catch(() => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 })),
        fetchCustomerRentals().catch(() => []),
      ]);
      setDrives(d);
      setSelling(s);
      setPurchases(p);
      setCases(cs);
      setServiceRequests(sr);
      setConnectAlerts(ca.items || []);
      setRentals(rnt);
      setActivityItems(activity.items);
      setActivityTotal(activity.total);
      setActivityPage(activity.page);
      setActivityPages(activity.totalPages);
    } catch (e) {
      if (silent) throw e;
      setError(friendlyError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [state]);

  // Status changes (confirmations, estimates, payments) appear on their own while the Activity tab is open.
  useAutoRefresh(() => loadData(true), { enabled: state === 'signed-in' && !loading, intervalMs: 45_000, pulse: { domains: ['me'], fetchTokens: customer.pulse } });

  async function loadOlderActivity() {
    if (loadingOlder || activityPage >= activityPages) return;
    setLoadingOlder(true);
    try {
      const next = await customer.activity(activityPage + 1);
      setActivityItems((current) => [...current, ...next.items]);
      setActivityPage(next.page);
      setActivityPages(next.totalPages);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoadingOlder(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  async function handleCancelTestDrive(id: string) {
    Alert.alert(
      'Cancel Test Drive',
      'Are you sure you want to cancel this test drive request?',
      [
        { text: 'Keep Reservation', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await customer.cancelTestDrive(id, 'Cancelled by customer');
              loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel test drive');
            }
          },
        },
      ]
    );
  }

  if (state !== 'signed-in') {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + space.sm, backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <BrandLogo variant="horizontal" size={26} bodyColor={isDark ? '#FFFFFF' : c.brandNavy} />
          <View style={styles.tabBadge}>
            <Text style={[styles.tabBadgeText, { color: c.brandAccent }]}>ACTIVITY</Text>
          </View>
        </View>
        <AuthScreen includeTopInset={false} showHeader={false} />
      </View>
    );
  }

  async function handleMarkConnectAlertRead(alertId: string) {
    try {
      await markConnectAlertRead(alertId);
      setConnectAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, isRead: true } : a))
      );
    } catch (e: any) {
      console.warn('Mark read failed:', e?.message || e);
    }
  }

  const totalCount = activityTotal + connectAlerts.length + serviceRequests.length + rentals.length;

  function openActivity(item: ActivityItem) {
    if (item.kind === 'SELLING') {
      navigation.navigate('SellingRequestDetails', { leadId: item.id.replace('selling/', '') });
    } else if (item.kind === 'PURCHASE') {
      navigation.navigate('PurchaseEnquiryDetails', { enquiryId: item.id.replace('purchase/', '') });
    } else if (item.kind === 'TEST_DRIVE') {
      navigation.navigate('TestDriveDetails', { driveId: item.id.replace('drive/', '') });
    } else if (item.kind === 'SUPPORT') {
      navigation.navigate('Support');
    }
  }

  function renderActivityItem({ item }: { item: ActivityItem }) {
    const canOpen = item.kind === 'SELLING' || item.kind === 'PURCHASE' || item.kind === 'TEST_DRIVE' || Boolean(item.listingId) || item.kind === 'SUPPORT';
    return (
      <TouchableOpacity
        disabled={!canOpen}
        onPress={() => openActivity(item)}
        style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
        accessibilityRole={canOpen ? 'button' : undefined}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{item.title}</Text>
            <Text style={[styles.cardSubtitle, { color: c.textMuted }]}>
              {activityLabel(item.kind)} · {item.reference.slice(0, 8).toUpperCase()}
            </Text>
            {item.kind === 'SELLING' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {item.registrationNumber ? (
                  <View style={{ backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderWidth: 1, borderColor: isDark ? '#334155' : '#CBD5E1', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: c.textPrimary, letterSpacing: 0.5 }}>{item.registrationNumber}</Text>
                  </View>
                ) : null}
                {[item.fuelType, item.transmission, item.color ? `Color: ${item.color}` : ''].filter(Boolean).length > 0 && (
                  <Text style={{ fontSize: 11, color: c.textMuted }}>
                    {[item.fuelType, item.transmission, item.color ? `Color: ${item.color}` : ''].filter(Boolean).join(' · ')}
                  </Text>
                )}
                {(item.registrationYear || item.registrationCity) && (
                  <Text style={{ fontSize: 11, color: c.textMuted }}>
                    {[item.registrationYear ? `Reg: ${item.registrationYear}` : '', item.registrationCity].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
            )}
          </View>
          <StatusBadge status={item.status} themeColors={c} />
        </View>
        <Text style={[styles.metaText, { color: c.textMuted }]}>
          Updated {new Date(item.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
        </Text>
      </TouchableOpacity>
    );
  }

  function renderServiceCard(item: ServiceRequestSummary) {
                      const verifiedPaid = Math.round(Number(item.verifiedPaidPaise || 0) / 100);
                      const outstanding = Math.round(Number(item.outstandingBalancePaise || 0) / 100);
                      const pStatus = item.servicePaymentStatus || (outstanding === 0 && verifiedPaid > 0 ? 'PAID_IN_FULL' : (verifiedPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID'));

                      let pBadgeColor = '#EF4444';
                      let pBadgeBg = isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2';
                      let pBadgeText = 'UNPAID';
                      if (pStatus === 'PAID_IN_FULL' || (outstanding === 0 && verifiedPaid > 0)) {
                        pBadgeColor = '#10B981';
                        pBadgeBg = isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5';
                        pBadgeText = 'PAID IN FULL';
                      } else if (pStatus === 'PARTIALLY_PAID' || verifiedPaid > 0) {
                        pBadgeColor = '#F59E0B';
                        pBadgeBg = isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7';
                        pBadgeText = 'PARTIAL';
                      }
                      const cancelled = item.status === 'CANCELLED';
                      if (cancelled) {
                        pBadgeColor = verifiedPaid > 0 ? '#F59E0B' : '#6B7280';
                        pBadgeBg = verifiedPaid > 0 ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7') : (isDark ? 'rgba(107, 114, 128, 0.25)' : '#E5E7EB');
                        pBadgeText = verifiedPaid > 0 ? 'REFUND DUE' : 'CANCELLED';
                      }

                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
                          activeOpacity={0.8}
                          onPress={() =>
                            navigation.navigate('ServiceRequestDetails', { requestId: item.id })
                          }
                        >
                          <View style={styles.cardHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
                                {item.vehicle.make} {item.vehicle.model} ({item.vehicle.year})
                              </Text>
                              <Text style={[styles.cardSubtitle, { color: c.brandAccent }]}>
                                {item.categoryKey.replace(/_/g, ' ')} · {item.requestNumber}
                              </Text>
                            </View>
                            <StatusBadge status={item.status} themeColors={c} />
                          </View>

                          <View style={styles.driveDetails}>
                            <View style={styles.driveRow}>
                              <Calendar size={14} color={c.brandAccent} />
                              <Text style={[styles.driveText, { color: c.textSecondary }]}>
                                {item.scheduledDate} · {item.scheduledTimeSlot}
                              </Text>
                            </View>
                            <View style={styles.driveRow}>
                              <MapPin size={14} color={c.brandAccent} />
                              <Text style={[styles.driveText, { color: c.textSecondary }]}>
                                {item.hub.name}
                              </Text>
                            </View>
                          </View>

                          {/* Payment status pill */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 10, marginTop: 8, borderRadius: 6, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F9FAFB', borderWidth: 1, borderColor: c.border }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: pBadgeBg }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: pBadgeColor }}>{pBadgeText}</Text>
                              </View>
                              <Text style={{ fontSize: 11, color: c.textSecondary }}>
                                Paid: <Text style={{ fontWeight: '700', color: '#10B981' }}>₹{verifiedPaid.toLocaleString('en-IN')}</Text>
                              </Text>
                            </View>
                            <Text style={{ fontSize: 11, color: !cancelled && outstanding > 0 ? '#EF4444' : '#10B981', fontWeight: '700' }}>
                              {cancelled ? (verifiedPaid > 0 ? 'Refund pending' : 'No charges') : outstanding > 0 ? `Due: ₹${outstanding.toLocaleString('en-IN')}` : 'Settled'}
                            </Text>
                          </View>

                          <View style={[styles.metaRow, { alignItems: 'center', paddingTop: space.xs }]}>
                            <Text style={[styles.metaText, { color: c.textMuted }]}>
                              Booked {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={{ color: c.brandAccent, fontSize: 12, fontWeight: '700' }}>Track Live</Text>
                              <ChevronRight size={14} color={c.brandAccent} />
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
  }

  function renderRentalCard(item: RentalBookingDetails) {
                      const verifiedPaid = Number(item.verifiedPaidPaise || 0);
                      const outstanding = Number(item.outstandingBalancePaise || 0);
                      const isOverdue = !!item.balanceDueAt && new Date(item.balanceDueAt).getTime() < Date.now() && outstanding > 0;

                      let paymentStatusText = 'NOT PAID';
                      let paymentStatusBg = isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2';
                      let paymentStatusColor = '#EF4444';

                      if (item.rentalPaymentStatus === 'PAID_IN_FULL' || outstanding === 0) {
                        paymentStatusText = 'PAID IN FULL';
                        paymentStatusBg = isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5';
                        paymentStatusColor = '#10B981';
                      } else if (isOverdue) {
                        paymentStatusText = 'PAYMENT OVERDUE';
                        paymentStatusBg = isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2';
                        paymentStatusColor = '#EF4444';
                      } else if (item.rentalPaymentStatus === 'PARTIALLY_PAID' || verifiedPaid > 0) {
                        paymentStatusText = 'PARTIALLY PAID';
                        paymentStatusBg = isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7';
                        paymentStatusColor = '#F59E0B';
                      }

                      const planName = item.paymentPlanSnapshot?.planName ||
                        (item.paymentPlanSnapshot?.advancePercentage ? `${item.paymentPlanSnapshot.advancePercentage}% Advance` : null);

                      const isPickupReady = (item.status === 'CONFIRMED' || item.status === 'VEHICLE_COLLECTED' || item.status === 'RETURN_INSPECTED' || item.status === 'SETTLED') &&
                        outstanding === 0 &&
                        item.kycStatus === 'VERIFIED';

                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
                          activeOpacity={0.8}
                          onPress={() =>
                            navigation.navigate('RentalBookingDetails', { bookingId: item.id })
                          }
                        >
                          <View style={styles.cardHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
                                {item.vehicle?.make} {item.vehicle?.model} ({item.vehicle?.year || 'Rental'})
                              </Text>
                              <Text style={[styles.cardSubtitle, { color: c.brandAccent }]}>
                                Booking #{item.bookingNumber} · {formatPaise(item.totalPayablePaise)}
                              </Text>
                            </View>
                            <StatusBadge status={item.status} themeColors={c} />
                          </View>

                          {/* Payment Plan & Gate Badges */}
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 8 }}>
                            {planName && (
                              <View style={{ backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#3B82F6' }}>
                                  {planName.toUpperCase()}
                                </Text>
                              </View>
                            )}
                            <View style={{ backgroundColor: paymentStatusBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: paymentStatusColor }}>
                                {paymentStatusText}
                              </Text>
                            </View>
                            {item.status === 'CONFIRMED' && (
                              <View style={{ backgroundColor: isPickupReady ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5') : (isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2'), paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: isPickupReady ? '#10B981' : '#EF4444' }}>
                                  {isPickupReady ? '✓ PICKUP READY' : '⊘ PICKUP BLOCKED'}
                                </Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.driveDetails}>
                            <View style={styles.driveRow}>
                              <Calendar size={14} color={c.brandAccent} />
                              <Text style={[styles.driveText, { color: c.textSecondary }]}>
                                {new Date(item.startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} → {new Date(item.endTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                              </Text>
                            </View>
                            {item.pickupHub?.name ? (
                              <View style={styles.driveRow}>
                                <MapPin size={14} color={c.brandAccent} />
                                <Text style={[styles.driveText, { color: c.textSecondary }]}>
                                  {item.pickupHub.name} ({item.pickupHub.city})
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          {/* Financial Summary & Due Date */}
                          <View style={{ backgroundColor: c.surfaceSecondary || (isDark ? '#1F2937' : '#F3F4F6'), borderRadius: 8, padding: 8, marginVertical: 6, gap: 4 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ fontSize: 11, color: c.textSecondary }}>Rental Paid: <Text style={{ fontWeight: '700', color: c.textPrimary }}>₹{Math.round(verifiedPaid / 100).toLocaleString('en-IN')}</Text></Text>
                              <Text style={{ fontSize: 11, color: c.textSecondary }}>Balance: <Text style={{ fontWeight: '800', color: outstanding > 0 ? '#EF4444' : '#10B981' }}>₹{Math.round(outstanding / 100).toLocaleString('en-IN')}</Text></Text>
                            </View>
                            {outstanding > 0 && item.balanceDueAt && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                <Clock size={11} color={isOverdue ? '#EF4444' : c.textMuted} />
                                <Text style={{ fontSize: 10, color: isOverdue ? '#EF4444' : c.textMuted, fontWeight: isOverdue ? '700' : '500' }}>
                                  Balance Due: {new Date(item.balanceDueAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} {isOverdue ? '(OVERDUE)' : ''}
                                </Text>
                              </View>
                            )}
                          </View>

                          <View style={[styles.metaRow, { alignItems: 'center', paddingTop: space.xs }]}>
                            <Text style={[styles.metaText, { color: c.textMuted }]}>
                              KYC: {item.kycStatus || 'PENDING'}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={{ color: c.brandAccent, fontSize: 12, fontWeight: '700' }}>Manage Trip</Text>
                              <ChevronRight size={14} color={c.brandAccent} />
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
  }

  function renderConnectAlertCard(alert: ConnectNotificationItem) {
    return (
                  <View
                    key={alert.id}
                    style={[
                      styles.card,
                      {
                        backgroundColor: c.surface,
                        borderColor: alert.isRead ? c.border : c.brandAccent,
                        borderWidth: alert.isRead ? 1 : 1.5,
                      },
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: alert.isRead ? (isDark ? '#1F3F6D' : '#E2E8F0') : 'rgba(247, 181, 3, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                          <QrCode size={15} color={alert.isRead ? c.textMuted : c.brandAccent} />
                        </View>
                        <View>
                          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
                            {alert.reason ? alert.reason.replace(/_/g, ' ').toUpperCase() : 'PASSERBY ALERT'}
                          </Text>
                          <Text style={[styles.cardSubtitle, { color: c.textMuted }]}>
                            {new Date(alert.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                          </Text>
                        </View>
                      </View>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: alert.isRead ? (isDark ? '#1F2937' : '#F1F5F9') : 'rgba(247, 181, 3, 0.15)' }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: alert.isRead ? c.textMuted : c.brandAccent }}>
                          {alert.isRead ? 'READ' : 'NEW'}
                        </Text>
                      </View>
                    </View>

                    {alert.messagePreview ? (
                      <Text style={[styles.metaText, { color: c.textPrimary, fontStyle: 'italic', marginVertical: 6, fontSize: 13 }]}>
                        "{alert.messagePreview}"
                      </Text>
                    ) : null}

                    {!alert.isRead && (
                      <TouchableOpacity
                        onPress={() => handleMarkConnectAlertRead(alert.id)}
                        style={{ alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: 'rgba(16, 185, 129, 0.12)', marginTop: 4 }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>Mark Acknowledged</Text>
                      </TouchableOpacity>
                    )}
                  </View>
    );
  }

  function renderFeedEntry(entry: FeedEntry) {
    switch (entry.type) {
      case 'activity':
        return renderActivityItem({ item: entry.item });
      case 'service':
        return <View style={styles.feedGap}>{renderServiceCard(entry.item)}</View>;
      case 'rental':
        return <View style={styles.feedGap}>{renderRentalCard(entry.item)}</View>;
      case 'connect':
        return <View style={styles.feedGap}>{renderConnectAlertCard(entry.item)}</View>;
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Your Activity</Text>
        <Text style={[styles.headerSubtitle, { color: c.textSecondary }]}>
          Real-time status of your buying, selling, and service requests
        </Text>
      </View>

      {/* Filter Tabs */}
      <View style={{ height: 48 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {[
            { key: 'ALL', label: `All (${totalCount})` },
            { key: 'CONNECT', label: `Connect (${connectAlerts.length})` },
            { key: 'SERVICE', label: `Service (${serviceRequests.length})` },
            { key: 'RENTAL', label: `Rentals (${rentals.length})` },
            { key: 'SELLING', label: `Selling (${selling.length})` },
            { key: 'TEST_DRIVES', label: `Test Drives (${drives.length})` },
            { key: 'PURCHASES', label: `Enquiries (${purchases.length})` },
            { key: 'SUPPORT', label: `Support (${cases.length})` },
          ].map((tab) => {
            const active = filter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabItem,
                  { backgroundColor: c.surface, borderColor: c.border },
                  active && { backgroundColor: c.selected, borderColor: c.brandAccent },
                ]}
                onPress={() => setFilter(tab.key as FilterTab)}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? c.brandAccent : c.textSecondary, fontWeight: active ? '700' : '600' },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.brandAccent} />
        </View>
      ) : totalCount === 0 ? (
        <View style={styles.center}>
          <CarFront size={48} color={c.textMuted} />
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No Activity Yet</Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
            When you request test drives, submit cars for valuation, or create enquiries, you can track them here live.
          </Text>
        </View>
      ) : filter === 'ALL' ? (
        <FlatList
          contentContainerStyle={[styles.list, { paddingBottom: tabBottomPadding }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData();
              }}
              tintColor={c.brandAccent}
            />
          }
          data={feed}
          keyExtractor={(entry) => entry.key}
          renderItem={({ item: entry }) => renderFeedEntry(entry)}
          onEndReached={() => void loadOlderActivity()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            activityPage < activityPages ? (
              <TouchableOpacity
                style={[styles.loadMore, { borderColor: c.border }]}
                onPress={() => void loadOlderActivity()}
                disabled={loadingOlder}
              >
                <Text style={[styles.loadMoreText, { color: c.brandAccent }]}>
                  {loadingOlder ? 'Loading older activity…' : 'Load older activity'}
                </Text>
              </TouchableOpacity>
            ) : null
          }
        />
      ) : (
        <FlatList
          contentContainerStyle={[styles.list, { paddingBottom: tabBottomPadding }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData();
              }}
              tintColor={c.brandAccent}
            />
          }
          data={[1]}
          keyExtractor={() => 'activity-content'}
          renderItem={() => (
            <View style={{ gap: space.md }}>
              {/* V MOTIV Connect™ Passerby Alerts */}
              {filter === 'CONNECT' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                    V MOTIV Connect™ Passerby Alerts
                  </Text>
                  {connectAlerts.length === 0 ? (
                    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, alignItems: 'center', paddingVertical: 32 }]}>
                      <ShieldCheck size={36} color="#10B981" />
                      <Text style={[styles.cardTitle, { color: c.textPrimary, marginTop: 8 }]}>All Clear — No Alerts</Text>
                      <Text style={[styles.cardSubtitle, { color: c.textMuted, textAlign: 'center', paddingHorizontal: 20, marginTop: 4 }]}>
                        When a passerby scans your vehicle's QR sticker to alert you about parking, lights left on, or an issue, the notification appears here.
                      </Text>
                    </View>
                  ) : (
                    connectAlerts.map((alert) => (
                      <View
                        key={alert.id}
                        style={[
                          styles.card,
                          {
                            backgroundColor: c.surface,
                            borderColor: alert.isRead ? c.border : c.brandAccent,
                            borderWidth: alert.isRead ? 1 : 1.5,
                          },
                        ]}
                      >
                        <View style={styles.cardHeader}>
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: alert.isRead ? (isDark ? '#1F3F6D' : '#E2E8F0') : 'rgba(247, 181, 3, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                              <QrCode size={15} color={alert.isRead ? c.textMuted : c.brandAccent} />
                            </View>
                            <View>
                              <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
                                {alert.reason ? alert.reason.replace(/_/g, ' ').toUpperCase() : 'PASSERBY ALERT'}
                              </Text>
                              <Text style={[styles.cardSubtitle, { color: c.textMuted }]}>
                                {new Date(alert.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                              </Text>
                            </View>
                          </View>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: alert.isRead ? (isDark ? '#1F2937' : '#F1F5F9') : 'rgba(247, 181, 3, 0.15)' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: alert.isRead ? c.textMuted : c.brandAccent }}>
                              {alert.isRead ? 'READ' : 'NEW'}
                            </Text>
                          </View>
                        </View>

                        {alert.messagePreview ? (
                          <Text style={[styles.metaText, { color: c.textPrimary, fontStyle: 'italic', marginVertical: 6, fontSize: 13 }]}>
                            "{alert.messagePreview}"
                          </Text>
                        ) : null}

                        {!alert.isRead && (
                          <TouchableOpacity
                            onPress={() => handleMarkConnectAlertRead(alert.id)}
                            style={{ alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: 'rgba(16, 185, 129, 0.12)', marginTop: 4 }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>Mark Acknowledged</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* Selling Requests */}
              {filter === 'SELLING' && selling.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Vehicle Selling Requests</Text>
                  {selling.map((item) => {
                    const activeOffer = item.offers?.find((o) => o.status === 'OFFERED');
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
                        onPress={() =>
                          navigation.navigate('SellingRequestDetails', { leadId: item.id })
                        }
                      >
                        <View style={styles.cardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
                              {item.manufacturingYear} {item.make} {item.model}{item.variant ? ` ${item.variant}` : ''}
                            </Text>
                            <Text style={[styles.cardSubtitle, { color: c.textMuted }]}>
                              {[item.fuelType, item.transmission, item.color ? `Color: ${item.color}` : ''].filter(Boolean).join(' · ')}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                              {item.registrationNumber ? (
                                <View style={{ backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderWidth: 1, borderColor: isDark ? '#334155' : '#CBD5E1', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: c.textPrimary, letterSpacing: 0.5 }}>{item.registrationNumber}</Text>
                                </View>
                              ) : (
                                <View style={{ backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 10, fontWeight: '600', color: c.textMuted }}>Reg. Pending</Text>
                                </View>
                              )}
                              {(item.registrationYear || item.registrationCity || item.city) && (
                                <Text style={{ fontSize: 11, color: c.textMuted }}>
                                  {[item.registrationYear ? `Reg: ${item.registrationYear}` : '', item.registrationCity || item.city].filter(Boolean).join(' · ')}
                                </Text>
                              )}
                            </View>
                          </View>
                          <StatusBadge status={item.status} themeColors={c} />
                        </View>

                        {/* Active Offer Callout */}
                        {activeOffer ? (
                          <View style={[styles.offerCallout, { backgroundColor: c.brandAccent }]}>
                            <IndianRupee size={16} color={c.brandNavy} />
                            <Text style={[styles.offerCalloutText, { color: c.brandNavy, fontWeight: '700' }]}>
                              {item.offers?.some(o => o.status === 'DECLINED')
                                ? `Revised Counter-Offer: ${formatPaise(activeOffer.offerAmountPaise)}`
                                : `Offer Available: ${formatPaise(activeOffer.offerAmountPaise)}`}
                            </Text>
                            <ChevronRight size={14} color={c.brandNavy} />
                          </View>
                        ) : item.offers?.[0]?.status === 'DECLINED' ? (
                          <View style={[styles.offerCallout, { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.35)' }]}>
                            <Clock size={15} color={isDark ? '#FBBF24' : '#D97706'} />
                            <Text style={[styles.offerCalloutText, { color: isDark ? '#FBBF24' : '#D97706', flex: 1, fontSize: 13, fontWeight: '700' }]}>
                              Offer Declined · Reviewing Counter-Offer
                            </Text>
                            <ChevronRight size={14} color={isDark ? '#FBBF24' : '#D97706'} />
                          </View>
                        ) : (item.status === 'OFFER_PENDING' || item.inspection?.isCompleted) ? (
                          <View style={[styles.offerCallout, { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.35)' }]}>
                            <CheckCircle size={15} color="#10B981" />
                            <Text style={[styles.offerCalloutText, { color: '#10B981', flex: 1, fontSize: 13, fontWeight: '700' }]}>
                              Inspection Completed · Preparing Offer
                            </Text>
                            <ChevronRight size={14} color="#10B981" />
                          </View>
                        ) : null}

                        <View style={styles.metaRow}>
                          <Text style={[styles.metaText, { color: c.textMuted }]}>
                            Ref: {item.referenceCode?.slice(0, 8).toUpperCase()}
                          </Text>
                          <Text style={[styles.metaText, { color: c.textMuted }]}>
                            {new Date(item.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Test Drives */}
              {filter === 'TEST_DRIVES' && drives.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Test Drive Bookings</Text>
                  {drives.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.85}
                      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
                      onPress={() => navigation.navigate('TestDriveDetails', { driveId: item.id })}
                    >
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{item.listing.title}</Text>
                          <Text style={[styles.cardSubtitle, { color: c.brandAccent }]}>
                            {formatPaise(item.listing.pricePaise)}
                          </Text>
                        </View>
                        <StatusBadge status={item.status} themeColors={c} />
                      </View>

                      <View style={styles.driveDetails}>
                        <View style={styles.driveRow}>
                          <Calendar size={14} color={c.brandAccent} />
                          <Text style={[styles.driveText, { color: c.textSecondary }]}>
                            {new Date(item.requestedDate).toLocaleDateString('en-IN', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                            })}{' '}
                            · {item.timeSlot}
                          </Text>
                        </View>
                        <View style={styles.driveRow}>
                          <MapPin size={14} color={c.brandAccent} />
                          <Text style={[styles.driveText, { color: c.textSecondary }]}>
                            {item.locationPreference === 'HOME'
                              ? `Doorstep (${item.address || item.serviceCity})`
                              : `V MOTIV Hub (${item.serviceCity})`}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs }}>
                        <Text style={[styles.metaText, { color: c.brandAccent, fontWeight: '700' }]}>
                          View Test Drive Details →
                        </Text>
                        {item.status === 'REQUESTED' ? (
                          <TouchableOpacity
                            style={styles.cancelLink}
                            onPress={() => handleCancelTestDrive(item.id)}
                          >
                            <XCircle size={14} color={c.error} />
                            <Text style={[styles.cancelLinkText, { color: c.error }]}>Cancel</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Purchase Enquiries */}
              {filter === 'PURCHASES' && purchases.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Purchase Enquiries</Text>
                  {purchases.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
                      onPress={() =>
                        navigation.navigate('PurchaseEnquiryDetails', { enquiryId: item.id })
                      }
                    >
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{item.listing.title}</Text>
                          <Text style={[styles.cardSubtitle, { color: c.brandAccent }]}>
                            {formatPaise(item.listing.pricePaise)}
                          </Text>
                        </View>
                        <StatusBadge status={item.status} themeColors={c} />
                      </View>
                      {item.message ? (
                        <Text style={[styles.enquiryMsg, { color: c.textSecondary }]} numberOfLines={2}>
                          "{item.message}"
                        </Text>
                      ) : null}
                      <Text style={[styles.metaText, { color: c.textMuted }]}>
                        Sent {new Date(item.createdAt).toLocaleDateString('en-IN')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Support Cases */}
              {filter === 'SUPPORT' && cases.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Customer Support</Text>
                  {cases.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
                      activeOpacity={0.8}
                      onPress={() =>
                        navigation.navigate('SupportCaseDetails', { caseId: item.id })
                      }
                    >
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{item.subject}</Text>
                          <Text style={[styles.cardSubtitle, { color: c.textMuted }]}>
                            Case #{item.referenceCode.slice(0, 8).toUpperCase()} · {item.category.replace(/_/g, ' ')}
                          </Text>
                        </View>
                        <StatusBadge status={item.status} themeColors={c} />
                      </View>
                      {item.description ? (
                        <Text style={[styles.enquiryMsg, { color: c.textSecondary }]} numberOfLines={2}>
                          {item.description}
                        </Text>
                      ) : null}
                      <View style={[styles.metaRow, { alignItems: 'center', paddingTop: space.xs }]}>
                        <Text style={[styles.metaText, { color: c.textMuted }]}>
                          Updated {new Date(item.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={{ color: c.brandAccent, fontSize: 12, fontWeight: '700' }}>View thread</Text>
                          <ChevronRight size={14} color={c.brandAccent} />
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Car Service Requests */}
              {filter === 'SERVICE' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Car Service Requests</Text>
                  {serviceRequests.length === 0 ? (
                    <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
                      No car service bookings found. You can book scheduled maintenance or diagnostics anytime.
                    </Text>
                  ) : (
                    serviceRequests.map(renderServiceCard)
                  )}
                </View>
              )}

              {/* Car Rental Bookings */}
              {filter === 'RENTAL' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Car Rental Bookings</Text>
                  {rentals.length === 0 ? (
                    <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
                      No car rental bookings found. You can explore available self-drive rental cars anytime.
                    </Text>
                  ) : (
                    rentals.map(renderRentalCard)
                  )}
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

function formatStatusBadgeLabel(status: string) {
  switch (status) {
    case 'OFFER_PENDING':
      return 'INSPECTION COMPLETED';
    case 'INSPECTION_SCHEDULED':
      return 'INSPECTION SCHEDULED';
    case 'OFFERED':
      return 'OFFER READY';
    case 'ACCEPTED':
      return 'OFFER ACCEPTED';
    case 'QUALIFYING':
      return 'UNDER REVIEW';
    case 'SUBMITTED':
      return 'REQUEST SUBMITTED';
    default:
      return (status || 'PENDING').replace(/_/g, ' ');
  }
}

function StatusBadge({ status, themeColors }: { status: string; themeColors: any }) {
  const isPositive = ['OFFERED', 'ACCEPTED', 'CONFIRMED', 'RESOLVED', 'COMPLETED', 'OFFER_PENDING'].includes(status);
  const isNegative = ['CANCELLED', 'REJECTED', 'CLOSED'].includes(status);

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: isPositive
            ? themeColors.successBackground
            : isNegative
            ? themeColors.errorBackground
            : themeColors.badgeBackground,
        },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          {
            color: isPositive
              ? themeColors.success
              : isNegative
              ? themeColors.error
              : themeColors.brandAccent,
          },
        ]}
      >
        {formatStatusBadgeLabel(status)}
      </Text>
    </View>
  );
}

function activityLabel(kind: ActivityItem['kind']) {
  return { TEST_DRIVE: 'Test drive', SELLING: 'Selling request', PURCHASE: 'Purchase enquiry', SUPPORT: 'Support case' }[kind];
}

const styles = StyleSheet.create({
  feedGap: {},
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  tabBadge: {
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.3)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tabBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  header: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  tabItem: {
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 11,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: space.md,
  },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: space.xs,
    lineHeight: 20,
  },
  list: {
    padding: space.md,
  },
  loadMore: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: space.sm,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    marginBottom: space.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: space.sm,
  },
  card: {
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    borderWidth: 1,
    marginBottom: space.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  offerCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    borderRadius: radius.sm,
    marginTop: space.sm,
    gap: space.xs,
  },
  offerCalloutText: {
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  metaText: {
    fontSize: 11,
  },
  driveDetails: {
    marginTop: space.sm,
    gap: 4,
  },
  driveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  driveText: {
    fontSize: 12,
  },
  cancelLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: space.sm,
    paddingTop: space.xs,
  },
  cancelLinkText: {
    fontSize: 12,
    fontWeight: '600',
  },
  enquiryMsg: {
    fontSize: 12,
    marginVertical: space.xs,
    fontStyle: 'italic',
  },
});
