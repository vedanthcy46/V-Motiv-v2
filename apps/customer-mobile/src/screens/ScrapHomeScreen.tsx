import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CheckCircle2, ClipboardCheck, FileCheck2, Recycle, Search, Truck } from 'lucide-react-native';
import { useAuth } from '../auth/AuthProvider';
import { useAppTheme } from '../theme';
import { CustomerButton } from '../components/customer-ui';
import { Card, Notice, ScreenHeader, StatusPill } from '../components/scrap/ScrapUi';
import { scrapApi, type ScrapSummary } from '../services/scrap-api';
import { customerAction, scrapErrorMessage } from '../services/scrap-form';
import { isClosedStatus } from '../services/scrap-text';
import { featureBadge } from '../constants/features';
import type { RootStack } from '../navigation/types';

type Props = NativeStackScreenProps<RootStack, 'ScrapHome'>;
type Row = Partial<ScrapSummary> & { id: string; requestNumber: string; status: string; statusLabel?: string };

const STEPS = [
  { Icon: ClipboardCheck, title: 'Tell us about your vehicle', body: 'Answer a few questions about its condition and ownership. We save as you go.' },
  { Icon: Search, title: 'We review and inspect', body: 'Our team reviews your request and an inspector checks the vehicle.' },
  { Icon: FileCheck2, title: 'You get an offer', body: 'We get a quotation from an authorised scrapping facility. You decide whether to accept.' },
  { Icon: Truck, title: 'Collection and scrapping', body: 'The vehicle is collected and taken to the facility, which scraps it.' },
  { Icon: CheckCircle2, title: 'Certificates and registration', body: 'The facility issues the official certificates. We check them and follow up on the registration.' },
];

/**
 * The scrapping introduction: what happens, what V MOTIV does and does not do, and the way into a request. V MOTIV arranges scrapping with an
 * authorised facility. It is not the facility and not a government service, and this screen says so plainly.
 */
export function ScrapHomeScreen({ navigation }: Props) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const { state } = useAuth();
  const signedIn = state === 'signed-in';

  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (!signedIn) return;
    if (refresh) setRefreshing(true);
    setError('');
    try {
      setRows((await scrapApi.list()).items as Row[]);
    } catch (e) {
      setError(scrapErrorMessage(e, ''));
    } finally {
      setRefreshing(false);
    }
  }, [signedIn]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const drafts = rows.filter(row => row.status === 'DRAFT');
  const active = rows.filter(row => row.status !== 'DRAFT' && !isClosedStatus(row.status));
  const attention = rows.find(row => customerAction(row.status) && row.status !== 'DRAFT') ?? null;

  const start = () => {
    if (!signedIn) { navigation.navigate('Tabs', { screen: 'Account' }); return; }
    navigation.navigate('ScrapRequest');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="Scrap a car" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }}
        refreshControl={signedIn ? <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={c.brandAccent} /> : undefined}
      >
        <View style={{ backgroundColor: c.surface, borderColor: c.brandAccent, borderWidth: 1.5, borderRadius: 22, padding: 20, alignItems: 'center', gap: 12 }}>
          <View style={{ width: 68, height: 68, borderRadius: 20, backgroundColor: c.brandAccent, alignItems: 'center', justifyContent: 'center' }}>
            <Recycle size={32} color={c.brandNavy} accessibilityElementsHidden />
          </View>
          <View style={{ backgroundColor: c.brandAccent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7 }}>
            <Text style={{ color: c.brandNavy, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>{featureBadge('scrap')}</Text>
          </View>
          <Text accessibilityRole="header" style={{ color: c.textPrimary, fontSize: 21, fontWeight: '800', textAlign: 'center' }}>Retire your old vehicle responsibly</Text>
          <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
            V MOTIV arranges the scrapping of your vehicle with an authorised scrapping facility, and keeps you updated at every step.
          </Text>
          <CustomerButton title={drafts.length ? 'Start a new request' : 'Start a request'} onPress={start} />
        </View>

        {signedIn && error ? <Notice tone="warning" action={{ label: 'Try again', onPress: () => void load(true) }}>{error || 'We could not load your requests.'}</Notice> : null}

        {attention ? (
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate('ScrapRequestDetails', { requestId: attention.id })}>
            <Notice tone="warning">{attention.status === 'OFFER_PENDING_CUSTOMER' ? 'Your offer is ready. Tap to review it.' : 'We need something from you. Tap to see what.'}</Notice>
          </Pressable>
        ) : null}

        {drafts.map(draft => (
          <Pressable key={draft.id} accessibilityRole="button" accessibilityLabel="Continue your unfinished request" onPress={() => navigation.navigate('ScrapRequest', { requestId: draft.id })}>
            <Card>
              <StatusPill status="DRAFT" label="Unfinished" />
              <Text style={{ color: c.textPrimary, fontWeight: '800' }}>{draft.vehicle && 'make' in draft.vehicle && draft.vehicle.make ? `${draft.vehicle.make ?? ''} ${draft.vehicle.model ?? ''}`.trim() : 'Your request'}</Text>
              <Text style={{ color: c.brandAccent, fontWeight: '800' }}>Continue where you left off</Text>
            </Card>
          </Pressable>
        ))}

        {signedIn && (active.length > 0 || rows.length > 0) ? (
          <CustomerButton title={active.length ? `My requests (${active.length} in progress)` : 'My requests'} secondary onPress={() => navigation.navigate('MyScrapRequests')} />
        ) : null}

        <Card title="How it works">
          {STEPS.map(({ Icon, title, body }, index) => (
            <View key={title} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color={c.brandAccent} accessibilityElementsHidden />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textPrimary, fontWeight: '800' }}>{index + 1}. {title}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 13.5, lineHeight: 19 }}>{body}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Card title="Good to know">
          <Text style={{ color: c.textSecondary, lineHeight: 21 }}>
            • V MOTIV is not the scrapping facility and not a government service. The facility does the scrapping and issues the official certificates.{'\n'}
            • Signing in with Google does not prove you own the vehicle. We may ask for proof of ownership.{'\n'}
            • Any estimate is only a guide. You are never bound to anything until you accept an offer.{'\n'}
            • You can cancel before your vehicle is collected.
          </Text>
        </Card>

        {!signedIn ? <Notice tone="info">Sign in to start a request and follow it here.</Notice> : null}
        <CustomerButton title="Talk to our team" secondary onPress={() => (signedIn ? navigation.navigate('Support') : navigation.navigate('Tabs', { screen: 'Account' }))} />
      </ScrollView>
    </View>
  );
}
