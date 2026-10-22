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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  AlertCircle,
  Calendar,
  CarFront,
  CheckCircle,
  ChevronRight,
  Clock,
  HelpCircle,
  IndianRupee,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Tag,
  XCircle,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import { useAuth } from '../auth/AuthProvider';
import { AuthScreen } from './AuthScreen';
import { color, radius, space } from '../theme';
import { formatPaise, friendlyError } from '../format';
import type { ActivityItem, PurchaseEnquiry, SellingRequest, SupportCase, TestDrive } from '../types';

type FilterTab = 'ALL' | 'SELLING' | 'TEST_DRIVES' | 'PURCHASES' | 'SUPPORT';

export function RequestsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { state } = useAuth();
  const [filter, setFilter] = useState<FilterTab>('ALL');

  const [drives, setDrives] = useState<TestDrive[]>([]);
  const [selling, setSelling] = useState<SellingRequest[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEnquiry[]>([]);
  const [cases, setCases] = useState<SupportCase[]>([]);
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
      const [d, s, p, c, activity] = await Promise.all([
        customer.testDrives(),
        customer.sellingRequests(),
        customer.purchaseEnquiries(),
        customer.supportCases(),
        customer.activity(),
      ]);
      setDrives(d);
      setSelling(s);
      setPurchases(p);
      setCases(c);
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
      setActivityItems(current => [...current, ...next.items]);
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
    return <AuthScreen />;
  }

  const totalCount = activityTotal;

  function openActivity(item: ActivityItem) {
    if (item.kind === 'SELLING') {
      navigation.navigate('SellingRequestDetails', { leadId: item.id.replace('selling/', '') });
    } else if ((item.kind === 'TEST_DRIVE' || item.kind === 'PURCHASE') && item.listingId) {
      navigation.navigate('Vehicle', { listingId: item.listingId });
    } else if (item.kind === 'SUPPORT') {
      navigation.navigate('Support');
    }
  }

  function renderActivityItem({ item }: { item: ActivityItem }) {
    const canOpen = item.kind === 'SELLING' || Boolean(item.listingId) || item.kind === 'SUPPORT';
    return (
      <TouchableOpacity disabled={!canOpen} onPress={() => openActivity(item)} style={styles.card} accessibilityRole={canOpen ? 'button' : undefined}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSubtitle}>{activityLabel(item.kind)} · {item.reference.slice(0, 8).toUpperCase()}</Text>
          </View>
          <StatusBadge status={item.status} />
        </View>
        <Text style={styles.metaText}>Updated {new Date(item.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Activity</Text>
        <Text style={styles.headerSubtitle}>
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
          <TouchableOpacity
            style={[styles.tabItem, filter === 'ALL' && styles.tabItemActive]}
            onPress={() => setFilter('ALL')}
          >
            <Text style={[styles.tabText, filter === 'ALL' && styles.tabTextActive]}>
              All ({totalCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, filter === 'SELLING' && styles.tabItemActive]}
            onPress={() => setFilter('SELLING')}
          >
            <Text style={[styles.tabText, filter === 'SELLING' && styles.tabTextActive]}>
              Selling ({selling.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, filter === 'TEST_DRIVES' && styles.tabItemActive]}
            onPress={() => setFilter('TEST_DRIVES')}
          >
            <Text style={[styles.tabText, filter === 'TEST_DRIVES' && styles.tabTextActive]}>
              Test Drives ({drives.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, filter === 'PURCHASES' && styles.tabItemActive]}
            onPress={() => setFilter('PURCHASES')}
          >
            <Text style={[styles.tabText, filter === 'PURCHASES' && styles.tabTextActive]}>
              Enquiries ({purchases.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, filter === 'SUPPORT' && styles.tabItemActive]}
            onPress={() => setFilter('SUPPORT')}
          >
            <Text style={[styles.tabText, filter === 'SUPPORT' && styles.tabTextActive]}>
              Support ({cases.length})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={color.yellow} />
        </View>
      ) : totalCount === 0 ? (
        <View style={styles.center}>
          <CarFront size={48} color={color.muted} />
          <Text style={styles.emptyTitle}>No Activity Yet</Text>
          <Text style={styles.emptyBody}>
            When you request test drives, submit cars for valuation, or create enquiries, you can track them here live.
          </Text>
        </View>
      ) : filter === 'ALL' ? (
        <FlatList
          contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 20) + 72 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={color.yellow} />}
          data={activityItems}
          keyExtractor={(item) => item.id}
          renderItem={renderActivityItem}
          onEndReached={() => void loadOlderActivity()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={activityPage < activityPages ? <TouchableOpacity style={styles.loadMore} onPress={() => void loadOlderActivity()} disabled={loadingOlder}><Text style={styles.loadMoreText}>{loadingOlder ? 'Loading older activity…' : 'Load older activity'}</Text></TouchableOpacity> : null}
        />
      ) : (
        <FlatList
          contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 20) + 72 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData();
              }}
              tintColor={color.yellow}
            />
          }
          data={[1]} // single scroll view wrapper
          keyExtractor={() => 'activity-content'}
          renderItem={() => (
            <View style={{ gap: space.md }}>
              {/* Selling Requests */}
              {filter === 'SELLING' && selling.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Vehicle Selling Requests</Text>
                  {selling.map((item) => {
                    const activeOffer = item.offers?.find((o) => o.status === 'OFFERED');
                    const isAccepted = item.status === 'ACCEPTED';
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.card}
                        onPress={() =>
                          navigation.navigate('SellingRequestDetails', { leadId: item.id })
                        }
                      >
                        <View style={styles.cardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle}>
                              {item.manufacturingYear} {item.make} {item.model}
                            </Text>
                            {item.variant ? (
                              <Text style={styles.cardSubtitle}>{item.variant}</Text>
                            ) : null}
                          </View>
                          <StatusBadge status={item.status} />
                        </View>

                        {/* Active Offer Callout */}
                        {activeOffer ? (
                          <View style={styles.offerCallout}>
                            <IndianRupee size={16} color={color.navy} />
                            <Text style={styles.offerCalloutText}>
                              Offer Available: {formatPaise(activeOffer.offerAmountPaise)}
                            </Text>
                            <ChevronRight size={14} color={color.navy} />
                          </View>
                        ) : null}

                        <View style={styles.metaRow}>
                          <Text style={styles.metaText}>
                            Ref: {item.referenceCode?.slice(0, 8).toUpperCase()}
                          </Text>
                          <Text style={styles.metaText}>
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
                  <Text style={styles.sectionTitle}>Test Drive Bookings</Text>
                  {drives.map((item) => (
                    <View key={item.id} style={styles.card}>
                      <View style={styles.cardHeader}>
                        <TouchableOpacity
                          style={{ flex: 1 }}
                          onPress={() =>
                            navigation.navigate('Vehicle', { listingId: item.listing.id })
                          }
                        >
                          <Text style={styles.cardTitle}>{item.listing.title}</Text>
                          <Text style={styles.cardSubtitle}>
                            {formatPaise(item.listing.pricePaise)}
                          </Text>
                        </TouchableOpacity>
                        <StatusBadge status={item.status} />
                      </View>

                      <View style={styles.driveDetails}>
                        <View style={styles.driveRow}>
                          <Calendar size={14} color={color.yellow} />
                          <Text style={styles.driveText}>
                            {new Date(item.requestedDate).toLocaleDateString('en-IN', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                            })}{' '}
                            · {item.timeSlot}
                          </Text>
                        </View>
                        <View style={styles.driveRow}>
                          <MapPin size={14} color={color.yellow} />
                          <Text style={styles.driveText}>
                            {item.locationPreference === 'HOME'
                              ? `Doorstep (${item.address || item.serviceCity})`
                              : `V MOTIV Hub (${item.serviceCity})`}
                          </Text>
                        </View>
                      </View>

                      {item.status === 'REQUESTED' ? (
                        <TouchableOpacity
                          style={styles.cancelLink}
                          onPress={() => handleCancelTestDrive(item.id)}
                        >
                          <XCircle size={14} color="#EF4444" />
                          <Text style={styles.cancelLinkText}>Cancel Booking</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}

              {/* Purchase Enquiries */}
              {filter === 'PURCHASES' && purchases.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Purchase Enquiries</Text>
                  {purchases.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.card}
                      onPress={() =>
                        navigation.navigate('Vehicle', { listingId: item.listing.id })
                      }
                    >
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{item.listing.title}</Text>
                          <Text style={styles.cardSubtitle}>
                            {formatPaise(item.listing.pricePaise)}
                          </Text>
                        </View>
                        <StatusBadge status={item.status} />
                      </View>
                      {item.message ? (
                        <Text style={styles.enquiryMsg} numberOfLines={2}>
                          "{item.message}"
                        </Text>
                      ) : null}
                      <Text style={styles.metaText}>
                        Sent {new Date(item.createdAt).toLocaleDateString('en-IN')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Support Cases */}
              {filter === 'SUPPORT' && cases.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Customer Support</Text>
                  {cases.map((item) => (
                    <View key={item.id} style={styles.card}>
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{item.subject}</Text>
                          <Text style={styles.cardSubtitle}>
                            Case {item.referenceCode.slice(0, 8).toUpperCase()} · {item.category}
                          </Text>
                        </View>
                        <StatusBadge status={item.status} />
                      </View>
                      <Text style={styles.enquiryMsg} numberOfLines={3}>
                        {item.description}
                      </Text>
                      <Text style={styles.metaText}>
                        Updated {new Date(item.updatedAt).toLocaleDateString('en-IN')}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isPositive = ['OFFERED', 'ACCEPTED', 'CONFIRMED', 'RESOLVED'].includes(status);
  const isNegative = ['CANCELLED', 'REJECTED', 'CLOSED'].includes(status);

  return (
    <View
      style={[
        styles.badge,
        isPositive && styles.badgePositive,
        isNegative && styles.badgeNegative,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          isPositive && styles.badgeTextPositive,
          isNegative && styles.badgeTextNegative,
        ]}
      >
        {status.replace(/_/g, ' ')}
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
    backgroundColor: color.canvas,
  },
  header: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  headerTitle: {
    color: color.white,
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: color.muted,
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
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
  },
  tabItemActive: {
    borderColor: color.yellow,
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
  },
  tabText: {
    color: color.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  tabTextActive: {
    color: color.yellow,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
  },
  emptyTitle: {
    color: color.white,
    fontSize: 16,
    fontWeight: '700',
    marginTop: space.md,
  },
  emptyBody: {
    color: color.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: space.xs,
    lineHeight: 20,
  },
  list: {
    padding: space.md,
    paddingBottom: space.xxl,
  },
  loadMore: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
    marginTop: space.sm,
  },
  loadMoreText: {
    color: color.yellow,
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    marginBottom: space.lg,
  },
  sectionTitle: {
    color: color.white,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: space.sm,
  },
  card: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  cardTitle: {
    color: color.white,
    fontSize: 15,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: color.muted,
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  badgePositive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  badgeNegative: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  badgeText: {
    color: color.yellow,
    fontSize: 10,
    fontWeight: '800',
  },
  badgeTextPositive: {
    color: '#22C55E',
  },
  badgeTextNegative: {
    color: '#EF4444',
  },
  offerCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.yellow,
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    borderRadius: radius.sm,
    marginTop: space.sm,
    gap: space.xs,
  },
  offerCalloutText: {
    color: color.navy,
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
    color: color.muted,
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
    color: '#E5E7EB',
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
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  enquiryMsg: {
    color: '#D1D5DB',
    fontSize: 12,
    marginVertical: space.xs,
    fontStyle: 'italic',
  },
});
