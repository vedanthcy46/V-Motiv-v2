import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme';
import { CustomerButton } from '../components/customer-ui';
import { Notice, ScreenHeader, StatusPill } from '../components/scrap/ScrapUi';
import { scrapApi, type ScrapSummary } from '../services/scrap-api';
import { customerAction, formatPaiseRange, scrapErrorMessage } from '../services/scrap-form';
import { formatDate, isClosedStatus } from '../services/scrap-text';
import type { RootStack } from '../navigation/types';

type Props = NativeStackScreenProps<RootStack, 'MyScrapRequests'>;
type Row = Partial<ScrapSummary> & { id: string; requestNumber: string; status: string; statusLabel?: string };

type Section = { key: string; title: string } | { key: string; row: Row };

/** Everything the customer has ever started: unfinished and in-progress first, then history. */
export function MyScrapRequestsScreen({ navigation }: Props) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (mode: 'first' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    setError('');
    try {
      const page = await scrapApi.list();
      setRows(page.items as Row[]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(scrapErrorMessage(e, 'We could not load your requests.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(rows.length ? 'refresh' : 'first'); }, [load]));

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await scrapApi.list(cursor);
      setRows(current => [...current, ...(page.items as Row[]).filter(item => !current.some(existing => existing.id === item.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(scrapErrorMessage(e, 'We could not load more.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const open = (row: Row) => (row.status === 'DRAFT'
    ? navigation.navigate('ScrapRequest', { requestId: row.id })
    : navigation.navigate('ScrapRequestDetails', { requestId: row.id }));

  const active = rows.filter(row => !isClosedStatus(row.status));
  const history = rows.filter(row => isClosedStatus(row.status));
  const data: Section[] = [
    ...(active.length ? [{ key: 'h-active', title: 'In progress' }, ...active.map(row => ({ key: row.id, row }))] : []),
    ...(history.length ? [{ key: 'h-history', title: 'History' }, ...history.map(row => ({ key: row.id, row }))] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="My scrapping requests" onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.brandAccent} accessibilityLabel="Loading your requests" /></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item.key}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} tintColor={c.brandAccent} />}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={error ? <Notice tone="danger" action={{ label: 'Try again', onPress: () => void load('refresh') }}>{error}</Notice> : null}
          ListEmptyComponent={!error ? (
            <View style={{ alignItems: 'center', gap: 14, paddingVertical: 48 }}>
              <Text accessibilityRole="header" style={{ color: c.textPrimary, fontSize: 18, fontWeight: '800' }}>No scrapping requests yet</Text>
              <Text style={{ color: c.textSecondary, textAlign: 'center', maxWidth: 300 }}>When you scrap a car with V MOTIV, you can follow every step here.</Text>
              <CustomerButton title="Scrap a car" onPress={() => navigation.navigate('ScrapRequest')} />
            </View>
          ) : null}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={c.brandAccent} style={{ margin: 16 }} /> : null}
          renderItem={({ item }) => {
            if ('title' in item) return <Text accessibilityRole="header" style={{ color: c.textMuted, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.6, marginTop: 8 }}>{item.title.toUpperCase()}</Text>;
            const row = item.row;
            const estimate = row.estimate ? formatPaiseRange(row.estimate.minPaise, row.estimate.maxPaise) : null;
            const name = row.vehicle ? [row.vehicle.manufacturingYear, row.vehicle.make, row.vehicle.model].filter(Boolean).join(' ') : 'Unfinished request';
            const needsYou = customerAction(row.status);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${row.statusLabel ?? row.status}${needsYou ? ', needs your attention' : ''}`}
                onPress={() => open(row)}
                style={({ pressed }) => ({ minHeight: 88, borderRadius: 18, borderWidth: 1, borderColor: needsYou ? c.brandAccent : c.border, backgroundColor: c.surface, padding: 14, gap: 6, opacity: pressed ? 0.85 : 1 })}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <Text numberOfLines={1} style={{ color: c.textPrimary, fontWeight: '800', fontSize: 15.5, flex: 1 }}>{name}</Text>
                  <StatusPill status={row.status} label={row.statusLabel ?? row.status} />
                </View>
                <Text style={{ color: c.textMuted, fontSize: 12.5 }}>
                  {row.vehicle?.registrationNumber ? `${row.vehicle.registrationNumber} · ` : ''}{row.requestNumber} · {formatDate(row.submittedAt ?? row.updatedAt ?? row.createdAt)}
                </Text>
                {needsYou === 'FINISH_DRAFT' ? <Text style={{ color: c.brandAccent, fontWeight: '800' }}>Continue where you left off</Text> : null}
                {needsYou === 'RESPOND_TO_OFFER' ? <Text style={{ color: c.brandAccent, fontWeight: '800' }}>Your offer is ready</Text> : null}
                {needsYou === 'PROVIDE_DOCUMENTS' ? <Text style={{ color: c.warning, fontWeight: '800' }}>We need some documents</Text> : null}
                {estimate && !needsYou ? <Text style={{ color: c.textSecondary, fontSize: 13 }}>Estimate {estimate}</Text> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
