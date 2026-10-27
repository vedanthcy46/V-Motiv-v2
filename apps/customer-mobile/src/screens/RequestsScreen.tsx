import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  Calendar,
  CarFront,
  CheckCircle,
  ChevronRight,
  IndianRupee,
  MapPin,
  Wrench,
  XCircle,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import { fetchCustomerServiceRequests, type ServiceRequestSummary } from '../services/service-api';
import { useAuth } from '../auth/AuthProvider';
import { BrandLogo } from '../components/BrandLogo';
import { AuthScreen } from './AuthScreen';
import { useAppTheme, radius, space } from '../theme';
import { formatPaise, friendlyError } from '../format';
import type { ActivityItem, PurchaseEnquiry, SellingRequest, SupportCase, TestDrive } from '../types';

type FilterTab = 'ALL' | 'SELLING' | 'TEST_DRIVES' | 'PURCHASES' | 'SUPPORT' | 'SERVICE';

export function RequestsScreen() {
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
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPages, setActivityPages] = useState(1);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (state !== 'signed-in') return;
    try {
      setError('');
      const [d, s, p, cs, activity, sr] = await Promise.all([
        customer.testDrives(),
        customer.sellingRequests(),
        customer.purchaseEnquiries(),
        customer.supportCases(),
        customer.activity(),
        fetchCustomerServiceRequests().catch(() => []),
      ]);
      setDrives(d);
      setSelling(s);
      setPurchases(p);
      setCases(cs);
      setServiceRequests(sr);
      setActivityItems(activity.items);
      setActivityTotal(activity.total);
      setActivityPage(activity.page);
      setActivityPages(activity.totalPages);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [state]);

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

  const totalCount = activityTotal;

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
          </View>
          <StatusBadge status={item.status} themeColors={c} />
        </View>
        <Text style={[styles.metaText, { color: c.textMuted }]}>
          Updated {new Date(item.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
        </Text>
      </TouchableOpacity>
    );
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
            { key: 'SERVICE', label: `Service (${serviceRequests.length})` },
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
          contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 20) + 96 }]}
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
          data={activityItems}
          keyExtractor={(item) => item.id}
          renderItem={renderActivityItem}
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
          contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 20) + 96 }]}
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
                              {item.manufacturingYear} {item.make} {item.model}
                            </Text>
                            {item.variant ? (
                              <Text style={[styles.cardSubtitle, { color: c.textMuted }]}>{item.variant}</Text>
                            ) : null}
                          </View>
                          <StatusBadge status={item.status} themeColors={c} />
                        </View>

                        {/* Active Offer Callout */}
                        {activeOffer ? (
                          <View style={[styles.offerCallout, { backgroundColor: c.brandAccent }]}>
                            <IndianRupee size={16} color={c.brandNavy} />
                            <Text style={[styles.offerCalloutText, { color: c.brandNavy }]}>
                              Offer Available: {formatPaise(activeOffer.offerAmountPaise)}
                            </Text>
                            <ChevronRight size={14} color={c.brandNavy} />
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
                    serviceRequests.map((item) => (
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
                    ))
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
