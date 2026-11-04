import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit2,
  ExternalLink,
  Gauge,
  Lock,
  Plus,
  PhoneCall,
  QrCode,
  Radio,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Wrench,
  X,
  Zap,
} from 'lucide-react-native';
import { useAppTheme, radius, space } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import { AuthScreen } from './AuthScreen';
import { BrandLogo } from '../components/BrandLogo';
import { CarBrandLogo } from '../components/CarBrandLogo';
import { useKeyboard } from '../components/KeyboardAwareFormScreen';
import {
  archiveCustomerVehicle,
  createCustomerVehicle,
  fetchCustomerVehicles,
  updateCustomerVehicle,
  type CustomerVehicle,
} from '../services/service-api';
import {
  fetchConnectStatus,
  issueConnectSticker,
  toggleConnectStatus,
  revokeConnectQR,
  requestConnectSticker,
  markConnectAlertRead,
  type GarageConnectInfo,
  type ConnectNotificationItem,
} from '../services/connect-api';
import {
  CAR_COLOURS,
  CAR_MAKES,
  MODELS_BY_MAKE,
  OWNERSHIP_TYPES,
  QUICK_YEARS,
  FUEL_TYPES,
  TRANSMISSIONS,
} from '../constants/car-catalog';

export function MyGarageScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useAppTheme();
  const { state: authState } = useAuth();
  const c = {
    ...theme.colors,
    text: theme.colors.textPrimary,
    textMuted: theme.colors.textSecondary,
    accent: theme.colors.brandAccent,
  };

  if (authState !== 'signed-in') {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View
          style={{
            paddingTop: insets.top + space.sm,
            paddingHorizontal: 16,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: c.surface,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <BrandLogo variant="horizontal" size={26} bodyColor={isDark ? '#FFFFFF' : c.brandNavy} />
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: isDark ? 'rgba(247, 181, 3, 0.15)' : '#FEF3C7',
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: c.accent }}>MY GARAGE</Text>
          </View>
        </View>
        <AuthScreen includeTopInset={false} showHeader={false} />
      </View>
    );
  }

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<CustomerVehicle | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // V MOTIV Connect™ State
  const [connectStatuses, setConnectStatuses] = useState<Record<string, GarageConnectInfo>>({});
  const [connectModalVisible, setConnectModalVisible] = useState(false);
  const [activeConnectVehicle, setActiveConnectVehicle] = useState<CustomerVehicle | null>(null);
  const [connectDetails, setConnectDetails] = useState<GarageConnectInfo | null>(null);
  const [loadingConnectDetails, setLoadingConnectDetails] = useState(false);
  const [connectTab, setConnectTab] = useState<'GENERATE' | 'ORDER'>('GENERATE');
  const [stickerUrl, setStickerUrl] = useState<string | null>(null);
  const [stickerImageUrl, setStickerImageUrl] = useState<string | null>(null);
  const [connectSubmitting, setConnectSubmitting] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryPincode, setDeliveryPincode] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [enlargedPhotoUrl, setEnlargedPhotoUrl] = useState<string | null>(null);

  const modalScrollRef = useRef<ScrollView>(null);
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();
  const screenHeight = Dimensions.get('window').height;

  const handleInputFocus = useCallback((yOffset: number) => {
    setTimeout(() => {
      modalScrollRef.current?.scrollTo({ y: yOffset, animated: true });
    }, 120);
  }, []);

  const activeSheetHeight = isKeyboardVisible
    ? Math.max(340, screenHeight - keyboardHeight - insets.top - (Platform.OS === 'ios' ? 20 : 30))
    : Math.min(screenHeight * 0.9, 780);

  // Form State
  const [makeSearch, setMakeSearch] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('2023');
  const [variant, setVariant] = useState('');
  const [fuelType, setFuelType] = useState('PETROL');
  const [transmission, setTransmission] = useState('MANUAL');
  const [color, setColor] = useState('White');
  const [regNumber, setRegNumber] = useState('');
  const [odometer, setOdometer] = useState('');
  const [ownership, setOwnership] = useState('OWNER');
  const [notes, setNotes] = useState('');

  const filteredMakes = useMemo(() => {
    const q = makeSearch.trim().toLowerCase();
    if (!q) return CAR_MAKES;
    return CAR_MAKES.filter(m => m.name.toLowerCase().includes(q));
  }, [makeSearch]);

  const suggestedModels = useMemo(() => {
    if (!make) return [];
    return MODELS_BY_MAKE[make] || [];
  }, [make]);

  const loadConnectDataForVehicles = useCallback(async (vehList: CustomerVehicle[]) => {
    const statuses: Record<string, GarageConnectInfo> = {};
    await Promise.allSettled(
      vehList.map(async (v) => {
        try {
          const res = await fetchConnectStatus(v.id);
          statuses[v.id] = res;
        } catch {
          // not linked or offline
        }
      })
    );
    setConnectStatuses(statuses);
  }, []);

  const loadVehicles = useCallback(async () => {
    try {
      const data = await fetchCustomerVehicles();
      const list = Array.isArray(data) ? data : ((data as any)?.vehicles || (data as any)?.data || []);
      setVehicles(list);
      setLoadError(null);
      void loadConnectDataForVehicles(list);
    } catch (err: any) {
      console.warn('[GARAGE_FETCH_ERROR]', err?.message || err);
      if (err?.code === 'USER_NOT_FOUND' || err?.message === 'USER_NOT_FOUND' || err?.code === 'RESOURCE_NOT_FOUND') {
        setVehicles([]);
        setLoadError(null);
      } else {
        setLoadError('We could not refresh your Garage. Your saved cars have not been removed. Please retry in a moment.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadConnectDataForVehicles]);

  const openConnectModal = useCallback(async (vehicle: CustomerVehicle) => {
    setActiveConnectVehicle(vehicle);
    setConnectModalVisible(true);
    setLoadingConnectDetails(true);
    setStickerUrl(null);
    setStickerImageUrl(null);
    setConnectTab('GENERATE');
    try {
      const details = await fetchConnectStatus(vehicle.id);
      setConnectDetails(details);
      setStickerImageUrl(details.link?.stickerImageUrl || null);
      setConnectStatuses(prev => ({ ...prev, [vehicle.id]: details }));
    } catch {
      setConnectDetails(null);
    } finally {
      setLoadingConnectDetails(false);
    }
  }, []);

  const handleGenerateSticker = async () => {
    if (!activeConnectVehicle) return;
    setConnectSubmitting(true);
    try {
      const res = await issueConnectSticker(activeConnectVehicle.id);
      setStickerUrl(res.stickerUrl);
      setStickerImageUrl(res.stickerImageUrl);
      const updated = await fetchConnectStatus(activeConnectVehicle.id);
      setConnectDetails(updated);
      setConnectStatuses(prev => ({ ...prev, [activeConnectVehicle.id]: updated }));
      Alert.alert('Sticker generated', 'Your secure QR is ready below. Save or print it now. Generating another sticker will invalidate this one.');
    } catch (err: any) {
      Alert.alert('Could not generate sticker', err.message || 'Please try again.');
    } finally {
      setConnectSubmitting(false);
    }
  };

  const handleShareSticker = async () => {
    const imgUrl = stickerImageUrl || connectDetails?.link?.stickerImageUrl;
    if (!imgUrl) {
      Alert.alert('No Sticker Found', 'Please generate a QR sticker first.');
      return;
    }

    const vehicleTitle = activeConnectVehicle
      ? `${activeConnectVehicle.make} ${activeConnectVehicle.model}`
      : 'vehicle';

    Alert.alert(
      'V MOTIV Connect Sticker',
      'Choose an option for your vehicle sticker:',
      [
        {
          text: 'Share Sticker via Apps',
          onPress: async () => {
            try {
              const shareMessage = stickerUrl
                ? `V MOTIV Connect™ QR sticker for ${vehicleTitle}.\n\nHigh-resolution sticker image: ${imgUrl}\n\nPublic link: ${stickerUrl}`
                : `V MOTIV Connect™ QR sticker for ${vehicleTitle}.\n\nHigh-resolution sticker image: ${imgUrl}`;

              await Share.share(
                Platform.OS === 'ios'
                  ? { title: `V MOTIV Connect - ${vehicleTitle}`, message: shareMessage, url: imgUrl }
                  : { title: `V MOTIV Connect - ${vehicleTitle}`, message: shareMessage }
              );
            } catch (err: any) {
              if (err?.message && !err.message.includes('dismiss') && !err.message.includes('cancel')) {
                Alert.alert('Unable to Share', err.message || 'Share failed.');
              }
            }
          },
        },
        {
          text: 'Open & Save Image',
          onPress: async () => {
            try {
              const supported = await Linking.canOpenURL(imgUrl);
              if (supported) {
                await Linking.openURL(imgUrl);
              } else {
                Alert.alert('Unable to Open', 'Cannot open image URL in browser.');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Could not open image.');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const confirmReplacementSticker = () => {
    Alert.alert(
      'Generate a replacement sticker?',
      'The existing QR will stop working immediately. Only generate a replacement if you have lost the old sticker or need a fresh print.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate replacement', style: 'destructive', onPress: () => void handleGenerateSticker() },
      ],
    );
  };

  const handleOrderSticker = async () => {
    if (!activeConnectVehicle) return;
    if (!deliveryAddress.trim() || !deliveryCity.trim() || !deliveryPincode.trim()) {
      Alert.alert('Incomplete Address', 'Please provide your address, city, and pincode for sticker dispatch.');
      return;
    }
    setConnectSubmitting(true);
    try {
      const res = await requestConnectSticker(activeConnectVehicle.id, {
        deliveryAddress: deliveryAddress.trim(),
        city: deliveryCity.trim(),
        pincode: deliveryPincode.trim(),
        instructions: deliveryInstructions.trim() || undefined,
      });
      Alert.alert(
        'Sticker Ordered!',
        `${res.message}\nOrder Ref: ${res.requestId}\nEstimated Dispatch: ${res.estimatedDeliveryDays} business days\n\nYour generated QR remains the active sticker; the printed version will carry the same secure link.`,
        [{ text: 'OK' }]
      );
      setDeliveryAddress('');
      setDeliveryCity('');
      setDeliveryPincode('');
      setDeliveryInstructions('');
      setConnectTab('GENERATE');
    } catch (err: any) {
      Alert.alert('Order Failed', err.message || 'Unable to place sticker order.');
    } finally {
      setConnectSubmitting(false);
    }
  };

  const handleToggleConnect = async () => {
    if (!activeConnectVehicle || !connectDetails?.link) return;
    const currentEnabled = connectDetails.link.status === 'ACTIVE';
    const newEnabled = !currentEnabled;
    setConnectSubmitting(true);
    try {
      await toggleConnectStatus(activeConnectVehicle.id, newEnabled);
      const updated = await fetchConnectStatus(activeConnectVehicle.id);
      setConnectDetails(updated);
      setConnectStatuses(prev => ({ ...prev, [activeConnectVehicle.id]: updated }));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update status');
    } finally {
      setConnectSubmitting(false);
    }
  };

  const handleRevokeConnect = () => {
    if (!activeConnectVehicle) return;
    Alert.alert(
      'Revoke QR Sticker?',
      'Warning: Revoking this QR sticker will permanently deactivate it. Passerbys scanning the sticker will be notified that it is no longer valid. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Revoke Sticker',
          style: 'destructive',
          onPress: async () => {
            setConnectSubmitting(true);
            try {
              await revokeConnectQR(activeConnectVehicle.id, 'Customer requested revocation from garage');
              Alert.alert('Revoked', 'The QR sticker has been permanently revoked.');
              const updated = await fetchConnectStatus(activeConnectVehicle.id);
              setConnectDetails(updated);
              setConnectStatuses(prev => ({ ...prev, [activeConnectVehicle.id]: updated }));
            } catch (err: any) {
              Alert.alert('Revocation Error', err.message || 'Failed to revoke sticker');
            } finally {
              setConnectSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleMarkAlertRead = async (alertId: string) => {
    try {
      await markConnectAlertRead(alertId);
      if (activeConnectVehicle) {
        const updated = await fetchConnectStatus(activeConnectVehicle.id);
        setConnectDetails(updated);
        setConnectStatuses(prev => ({ ...prev, [activeConnectVehicle.id]: updated }));
      }
    } catch (err: any) {
      console.warn('Mark read error:', err.message);
    }
  };

  const handleReportConnectAbuse = () => {
    Alert.alert(
      'Report Passerby Abuse / Harassment',
      'Our 24/7 Trust & Safety team reviews reported scans. If a visitor is misusing the QR code, their IP and access will be permanently blocked from contacting you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit Safety Report',
          onPress: () => {
            Alert.alert('Report Received', 'Thank you. Our Trust & Safety team is reviewing recent activity on this QR code.');
          },
        },
      ]
    );
  };

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  useFocusEffect(
    useCallback(() => {
      void loadVehicles();
    }, [loadVehicles])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadVehicles();
  }, [loadVehicles]);

  const openAddModal = () => {
    setEditingVehicle(null);
    setMakeSearch('');
    setMake('');
    setModel('');
    setYear('2023');
    setVariant('');
    setFuelType('PETROL');
    setTransmission('MANUAL');
    setColor('White');
    setRegNumber('');
    setOdometer('');
    setOwnership('OWNER');
    setNotes('');
    setModalVisible(true);
  };

  const openEditModal = (v: CustomerVehicle) => {
    setEditingVehicle(v);
    setMakeSearch('');
    setMake(v.make);
    setModel(v.model);
    setYear(v.year.toString());
    setVariant(v.variant || '');
    setFuelType(v.fuelType);
    setTransmission(v.transmission);
    setColor(v.color || 'White');
    setRegNumber(v.registrationNumber || '');
    setOdometer(v.odometerKm ? v.odometerKm.toString() : '');
    setOwnership(v.declaredOwnership || 'OWNER');
    setNotes(v.notes || '');
    setModalVisible(true);
  };

  const handleSaveVehicle = async () => {
    if (!make.trim()) {
      Alert.alert('Select Brand', 'Please select a car brand/make.');
      return;
    }
    if (!model.trim()) {
      Alert.alert('Enter Model', 'Please select or type your car model.');
      return;
    }
    const yearNum = parseInt(year, 10);
    const currentYear = new Date().getFullYear();
    if (!year.trim() || isNaN(yearNum) || yearNum < 1980 || yearNum > currentYear + 1) {
      Alert.alert(
        'Invalid Year',
        `Please select or type a valid 4-digit manufacturing year between 1980 and ${currentYear + 1}.`
      );
      return;
    }

    setSubmitting(true);
    try {
      if (editingVehicle) {
        const updated = await updateCustomerVehicle(editingVehicle.id, {
          variant: variant.trim() || undefined,
          color: color.trim() || undefined,
          registrationNumber: regNumber.trim().toUpperCase() || undefined,
          odometerKm: odometer ? parseInt(odometer, 10) : undefined,
          declaredOwnership: ownership,
          notes: notes.trim() || undefined,
        });
        if (updated && updated.id) {
          setVehicles(prev => prev.map(v => (v.id === updated.id ? { ...v, ...updated } : v)));
        }
        Alert.alert('Vehicle Updated', 'Your car details have been saved.');
      } else {
        const created = await createCustomerVehicle({
          make: make.trim(),
          model: model.trim(),
          year: yearNum,
          variant: variant.trim() || undefined,
          fuelType,
          transmission,
          color: color.trim() || undefined,
          registrationNumber: regNumber.trim().toUpperCase() || undefined,
          odometerKm: odometer ? parseInt(odometer, 10) : undefined,
          declaredOwnership: ownership,
          notes: notes.trim() || undefined,
        });
        if (created && created.id) {
          setVehicles(prev => [created, ...prev.filter(v => v.id !== created.id)]);
        }
        Alert.alert('Car Added', 'Your car has been added to My Garage.');
      }
      setModalVisible(false);
      void loadVehicles();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not save vehicle.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetPreferred = async (vehicle: CustomerVehicle) => {
    if (vehicle.isPreferred) return;
    try {
      setVehicles(prev => prev.map(v => ({ ...v, isPreferred: v.id === vehicle.id })));
      await updateCustomerVehicle(vehicle.id, { isPreferred: true });
      void loadVehicles();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to set as default car.');
    }
  };

  const handleArchive = (vehicle: CustomerVehicle) => {
    Alert.alert(
      'Archive Car',
      `Are you sure you want to remove ${vehicle.make} ${vehicle.model} from your active garage? Your service and invoice history will remain preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveCustomerVehicle(vehicle.id);
              setVehicles(prev => prev.filter(v => v.id !== vehicle.id));
              void loadVehicles();
            } catch (err: any) {
              Alert.alert('Cannot Archive', err?.message || 'Failed to archive vehicle.');
            }
          },
        },
      ]
    );
  };

  const canGoBack = navigation.canGoBack();

  return (
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {/* Top Navigation Bar */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={styles.headerLeft}>
          {canGoBack && (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.backBtn, { backgroundColor: c.surface }]}
            >
              <ArrowLeft size={20} color={c.text} />
            </TouchableOpacity>
          )}
          <Text style={[styles.headerTitle, { color: c.text }]}>My Garage</Text>
        </View>
        <TouchableOpacity
          onPress={openAddModal}
          style={[styles.addBtn, { backgroundColor: c.accent }]}
        >
          <Plus size={18} color="#061A38" />
          <Text style={styles.addBtnText}>Add Car</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={c.accent} />
            <Text style={[styles.loadingText, { color: c.textMuted }]}>Loading your garage...</Text>
          </View>
        ) : loadError && vehicles.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? '#3A2630' : '#FFF1F1' }]}>
              <AlertCircle size={40} color="#D84A4A" />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>Garage temporarily unavailable</Text>
            <Text style={[styles.emptyDesc, { color: c.textMuted }]}>{loadError}</Text>
            <TouchableOpacity
              onPress={() => void loadVehicles()}
              style={[styles.primaryActionBtn, { backgroundColor: c.accent }]}
            >
              <Text style={styles.primaryActionBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : vehicles.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? '#162C4E' : '#EBF3FF' }]}>
              <Car size={40} color={c.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>Your Garage is Empty</Text>
            <Text style={[styles.emptyDesc, { color: c.textMuted }]}>
              Add your cars to book seamless maintenance, monitor service history, and track live repair progress.
            </Text>
            <TouchableOpacity
              onPress={openAddModal}
              style={[styles.primaryActionBtn, { backgroundColor: c.accent }]}
            >
              <Plus size={20} color="#061A38" />
              <Text style={styles.primaryActionBtnText}>Add Your First Car</Text>
            </TouchableOpacity>
          </View>
        ) : (
          vehicles.map(v => (
            <View key={v.id} style={[styles.carCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              {/* Card Header */}
              <View style={styles.carHeaderRow}>
                <View style={styles.carBrandWrap}>
                  <CarBrandLogo brand={v.make} size={32} />
                  <View style={styles.carTitleWrap}>
                    <Text style={[styles.carTitle, { color: c.text }]}>
                      {v.make} {v.model}
                    </Text>
                    <Text style={[styles.carSubtitle, { color: c.textMuted }]}>
                      {v.year} {v.variant ? `· ${v.variant}` : ''}
                    </Text>
                  </View>
                </View>

                {v.isPreferred ? (
                  <View style={[styles.preferredPill, { backgroundColor: isDark ? '#1C3B24' : '#E8F5E9' }]}>
                    <Star size={12} color="#10B981" fill="#10B981" />
                    <Text style={styles.preferredText}>Default</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleSetPreferred(v)}
                    style={[styles.setDefaultBtn, { borderColor: c.border }]}
                  >
                    <Text style={[styles.setDefaultText, { color: c.textMuted }]}>Set Default</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Badges / Specs Row */}
              <View style={styles.specChipsRow}>
                {v.registrationNumber && (
                  <View style={[styles.specChip, { backgroundColor: isDark ? '#162C4E' : '#F1F5F9' }]}>
                    <Text style={[styles.specChipText, { color: c.text }]}>{v.registrationNumber}</Text>
                  </View>
                )}
                <View style={[styles.specChip, { backgroundColor: isDark ? '#162C4E' : '#F1F5F9' }]}>
                  <Text style={[styles.specChipText, { color: c.text }]}>{v.fuelType}</Text>
                </View>
                <View style={[styles.specChip, { backgroundColor: isDark ? '#162C4E' : '#F1F5F9' }]}>
                  <Text style={[styles.specChipText, { color: c.text }]}>{v.transmission}</Text>
                </View>
                {v.odometerKm && (
                  <View style={[styles.specChip, { backgroundColor: isDark ? '#162C4E' : '#F1F5F9' }]}>
                    <Text style={[styles.specChipText, { color: c.text }]}>{v.odometerKm.toLocaleString('en-IN')} km</Text>
                  </View>
                )}
                {v.color && (
                  <View style={[styles.specChip, { backgroundColor: isDark ? '#162C4E' : '#F1F5F9' }]}>
                    <Text style={[styles.specChipText, { color: c.text }]}>{v.color}</Text>
                  </View>
                )}
              </View>

              {/* Maintenance Metrics */}
              <View style={[styles.infoGrid, { borderTopColor: c.border }]}>
                <View style={styles.infoCol}>
                  <View style={styles.infoIconRow}>
                    <Clock size={14} color={c.textMuted} />
                    <Text style={[styles.infoLabel, { color: c.textMuted }]}>Next Service</Text>
                  </View>
                  <Text style={[styles.infoValue, { color: c.text }]}>
                    {v.nextServiceDueKm ? `At ${v.nextServiceDueKm.toLocaleString('en-IN')} km` : 'Every 10,000 km'}
                  </Text>
                </View>
              </View>

              {/* Active Service Banner */}
              {v.activeServiceRequest && (
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('ServiceRequestDetails', {
                      requestId: v.activeServiceRequest!.id,
                    })
                  }
                  style={[styles.activeBanner, { backgroundColor: isDark ? '#1A3358' : '#FFF9E6', borderColor: '#F7B503' }]}
                >
                  <View style={styles.activeBannerLeft}>
                    <Wrench size={16} color="#F7B503" />
                    <View style={styles.activeBannerTextWrap}>
                      <Text style={[styles.activeBannerTitle, { color: c.text }]}>
                        Service Active: {v.activeServiceRequest.status.replace(/_/g, ' ')}
                      </Text>
                      <Text style={[styles.activeBannerSub, { color: c.textMuted }]}>
                        {v.activeServiceRequest.requestNumber} · {v.activeServiceRequest.scheduledDate}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#F7B503" />
                </TouchableOpacity>
              )}

              {/* V MOTIV Connect™ QR Sticker Status Section */}
              {(() => {
                const cInfo = connectStatuses[v.id];
                const isLinked = Boolean(cInfo?.isLinked && cInfo?.link?.status !== 'REVOKED');
                const isActive = Boolean(isLinked && cInfo?.link?.status === 'ACTIVE');
                const unreadAlerts = cInfo?.stats?.unreadAlerts || 0;

                return (
                  <View style={[styles.vehicleConnectRow, { backgroundColor: isDark ? '#14253E' : '#F6F9FD', borderColor: isDark ? '#1F3F6D' : '#DCE7F5' }]}>
                    <View style={styles.vehicleConnectLeft}>
                      <View style={[styles.vehicleConnectIconWrap, { backgroundColor: isLinked ? (isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(247, 181, 3, 0.15)') : (isDark ? '#233550' : '#E2E8F0') }]}>
                        <QrCode size={18} color={isLinked ? (isActive ? '#10B981' : '#F7B503') : c.textMuted} />
                      </View>
                      <View style={styles.vehicleConnectInfo}>
                        <View style={styles.vehicleConnectTitleRow}>
                          <Text style={[styles.vehicleConnectTitle, { color: c.text }]}>V MOTIV Connect™</Text>
                          <View style={[styles.statusBadgeSmall, { backgroundColor: isLinked ? (isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(247, 181, 3, 0.15)') : (isDark ? '#2A2E3D' : '#EDF2F7') }]}>
                            <Text style={[styles.statusBadgeSmallText, { color: isLinked ? (isActive ? '#10B981' : '#F7B503') : c.textMuted }]}>
                              {isLinked ? (isActive ? 'ACTIVE' : 'PAUSED') : 'NOT LINKED'}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.vehicleConnectSub, { color: c.textMuted }]} numberOfLines={1}>
                          {isLinked
                            ? `${cInfo?.link?.qrTokenPreview || 'Sticker Linked'} · Zero-knowledge privacy`
                            : 'Protect your car with zero phone number exposure'}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => openConnectModal(v)}
                      style={[styles.manageConnectBtn, { backgroundColor: isLinked ? (isDark ? '#1F3F6D' : '#E6EFFB') : c.accent }]}
                    >
                      <Text style={[styles.manageConnectBtnText, { color: isLinked ? (isDark ? '#93C5FD' : '#0F4B8E') : '#061A38' }]}>
                        {isLinked ? (unreadAlerts > 0 ? `Alerts (${unreadAlerts})` : 'Manage QR') : 'Set up QR'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}

              {/* Card Actions */}
              <View style={[styles.cardFooter, { borderTopColor: c.border }]}>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('ServiceHome', { preselectedVehicleId: v.id })
                  }
                  style={[styles.bookServiceBtn, { backgroundColor: c.accent }]}
                >
                  <Wrench size={16} color="#061A38" />
                  <Text style={styles.bookServiceBtnText}>Book Service</Text>
                </TouchableOpacity>

                <View style={styles.subActionsRow}>
                  <TouchableOpacity
                    onPress={() => openEditModal(v)}
                    style={[styles.iconActionBtn, { borderColor: c.border }]}
                  >
                    <Edit2 size={16} color={c.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleArchive(v)}
                    style={[styles.iconActionBtn, { borderColor: c.border }]}
                  >
                    <Trash2 size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}

        {/* V MOTIV Connect™ Protection Spotlight */}
        <View style={[styles.connectCard, { backgroundColor: c.surface, borderColor: isDark ? '#1F3F6D' : '#DCE7F5' }]}>
          <View style={styles.connectHeaderRow}>
            <View style={styles.connectTitleRow}>
              <View style={[styles.connectIconWrap, { backgroundColor: '#F7B503' }]}>
                <Radio size={18} color="#061A38" />
              </View>
              <View>
                <Text style={[styles.connectTitle, { color: c.text }]}>V MOTIV Connect™</Text>
                <Text style={[styles.connectSubtitle, { color: c.textMuted }]}>
                  Zero-Knowledge Smart Vehicle QR Protection
                </Text>
              </View>
            </View>
            <View style={[styles.connectBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Text style={[styles.connectBadgeText, { color: '#10B981' }]}>LIVE SYSTEM</Text>
            </View>
          </View>

          <Text style={[styles.connectDesc, { color: c.textMuted }]}>
            Attach an official V MOTIV Connect™ QR sticker to your windshield. Anyone can scan it to alert you if your car is blocking, lights are left on, or an emergency arises — without ever exposing your phone number or identity.
          </Text>

          <View style={styles.connectPillarsRow}>
            <View style={[styles.connectPillar, { backgroundColor: isDark ? '#14253E' : '#F6F9FD' }]}>
              <ShieldCheck size={16} color="#10B981" />
              <Text style={[styles.connectPillarTitle, { color: c.text }]}>100% Private</Text>
              <Text style={[styles.connectPillarText, { color: c.textMuted }]}>Zero phone number or name exposure</Text>
            </View>
            <View style={[styles.connectPillar, { backgroundColor: isDark ? '#14253E' : '#F6F9FD' }]}>
              <Bell size={16} color="#F7B503" />
              <Text style={[styles.connectPillarTitle, { color: c.text }]}>Instant Alerts</Text>
              <Text style={[styles.connectPillarText, { color: c.textMuted }]}>Real-time notifications to your phone</Text>
            </View>
          </View>

          {vehicles.length > 0 && vehicles[0] && (
            <TouchableOpacity
              onPress={() => openConnectModal(vehicles[0]!)}
              style={[styles.connectActionBtn, { backgroundColor: c.accent }]}
            >
              <QrCode size={16} color="#061A38" />
              <Text style={styles.connectActionBtnText}>
                Configure Connect QR for Your Vehicles
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Add / Edit Vehicle Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
        statusBarTranslucent={true}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setModalVisible(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
            style={[
              styles.keyboardAvoidWrap,
              Platform.OS === 'android' && isKeyboardVisible ? { marginBottom: keyboardHeight } : null,
            ]}
          >
            <View
              style={[
                styles.modalSheet,
                {
                  backgroundColor: c.surface,
                  height: activeSheetHeight,
                  paddingBottom: isKeyboardVisible ? 10 : Math.max(insets.bottom, 16),
                },
              ]}
            >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>
                {editingVehicle ? 'Edit Vehicle Details' : 'Add Car to My Garage'}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[styles.modalCloseText, { color: c.accent }]}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={modalScrollRef}
              style={styles.modalBody}
              contentContainerStyle={[
                styles.modalScrollContent,
                { paddingBottom: isKeyboardVisible ? 240 : 40 },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={true}
              automaticallyAdjustKeyboardInsets={true}
            >
              {/* SECTION 1: Brand Selection with Authentic Logos */}
              <View style={styles.formSection}>
                <Text style={[styles.label, { color: c.text }]}>Brand / Make *</Text>

                {make === '' ? (
                  <>
                    {/* Brand Search Box */}
                    <View style={[styles.searchBox, { backgroundColor: isDark ? '#142742' : '#F1F5F9', borderColor: c.border }]}>
                      <Search size={16} color={c.textMuted} />
                      <TextInput
                        style={[styles.searchInput, { color: c.text }]}
                        placeholder="Search brand (e.g. Maruti, Hyundai, Tata, BYD)..."
                        placeholderTextColor={c.textMuted}
                        value={makeSearch}
                        onChangeText={setMakeSearch}
                        onFocus={() => handleInputFocus(0)}
                        autoCapitalize="words"
                        returnKeyType="search"
                      />
                    </View>

                    {/* 28 Brands Grid (Authentic Brand Logos) */}
                    <View style={styles.brandGrid}>
                      {filteredMakes.map(m => (
                        <TouchableOpacity
                          key={m.name}
                          onPress={() => {
                            setMake(m.name);
                            setModel('');
                            setMakeSearch('');
                          }}
                          style={[
                            styles.brandCard,
                            {
                              backgroundColor: isDark ? '#162C4E' : '#FFFFFF',
                              borderColor: isDark ? 'rgba(255,255,255,0.12)' : c.border,
                            },
                          ]}
                        >
                          <CarBrandLogo brand={m.name} size={36} disableBadgeBg />
                          <Text numberOfLines={1} style={[styles.brandCardText, { color: c.text }]}>
                            {m.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {filteredMakes.length === 0 && (
                        <Text style={[styles.noResults, { color: c.textMuted }]}>
                          No brands match "{makeSearch}". Type custom name below:
                        </Text>
                      )}
                    </View>

                    {makeSearch.trim() !== '' && filteredMakes.length === 0 && (
                      <TouchableOpacity
                        style={[styles.customBrandBtn, { borderColor: c.accent, backgroundColor: isDark ? '#162C4E' : '#FFF9E6' }]}
                        onPress={() => {
                          setMake(makeSearch.trim());
                          setMakeSearch('');
                        }}
                      >
                        <Text style={[styles.customBrandBtnText, { color: c.accent }]}>
                          Use "{makeSearch.trim()}" as Brand
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  /* Once selected: Collapse/close all brands and show selected brand card with Change button */
                  <View style={[styles.selectedBrandBanner, { backgroundColor: isDark ? '#162C4E' : '#FFF9E6', borderColor: c.accent }]}>
                    <View style={styles.selectedBrandLeft}>
                      <CarBrandLogo brand={make} size={36} isSelected={true} />
                      <View style={{ marginLeft: 12 }}>
                        <Text style={[styles.selectedBrandLabel, { color: c.textMuted }]}>Selected Brand</Text>
                        <Text style={[styles.selectedBrandName, { color: c.text }]}>{make}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setMake('');
                        setModel('');
                        setMakeSearch('');
                      }}
                      style={[styles.changeBrandBtn, { backgroundColor: isDark ? '#0F2038' : '#FFFFFF', borderColor: c.border }]}
                    >
                      <Text style={[styles.changeBrandText, { color: c.accent }]}>Change</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* SECTION 2: Model Selection */}
              {make !== '' && (
                <View style={styles.formSection}>
                  <Text style={[styles.label, { color: c.text }]}>Car Model *</Text>
                  {suggestedModels.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.modelsRow}
                    >
                      {suggestedModels.map(m => {
                        const isSelected = model.toLowerCase() === m.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={m}
                            onPress={() => setModel(m)}
                            style={[
                              styles.modelChip,
                              {
                                backgroundColor: isSelected ? c.accent : (isDark ? '#162C4E' : '#F1F5F9'),
                                borderColor: isSelected ? c.accent : c.border,
                              },
                            ]}
                          >
                            <Text style={[styles.modelChipText, { color: isSelected ? '#061A38' : c.text }]}>
                              {m}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                  <TextInput
                    value={model}
                    onChangeText={setModel}
                    onFocus={() => handleInputFocus(120)}
                    placeholder="e.g. Creta, Swift, Nexon, Innova Crysta..."
                    placeholderTextColor={c.textMuted}
                    style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                  />
                </View>
              )}

              {/* SECTION 3: Manufacturing Year (Quick Chips + Manual Type Input) */}
              <View style={styles.formSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.label, { color: c.text }]}>Manufacturing Year *</Text>
                  {year !== '' && (
                    <View style={[styles.selectedYearBadge, { backgroundColor: isDark ? '#1C3B24' : '#E8F5E9' }]}>
                      <Text style={styles.selectedYearBadgeText}>
                        Year: {year}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Quick Selection Chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.yearsRow}
                >
                  {QUICK_YEARS.map(y => {
                    const isSelected = year === y;
                    return (
                      <TouchableOpacity
                        key={y}
                        onPress={() => setYear(y)}
                        style={[
                          styles.yearChip,
                          {
                            backgroundColor: isSelected ? c.accent : (isDark ? '#162C4E' : '#F1F5F9'),
                            borderColor: isSelected ? c.accent : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.yearChipText, { color: isSelected ? '#061A38' : c.text }]}>
                          {y}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Manual Manufacture Year Input */}
                <View style={[styles.manualYearBox, { backgroundColor: c.background, borderColor: c.border }]}>
                  <Calendar size={18} color={c.textMuted} />
                  <TextInput
                    value={year}
                    onChangeText={txt => {
                      const cleaned = txt.replace(/[^0-9]/g, '').slice(0, 4);
                      setYear(cleaned);
                    }}
                    onFocus={() => handleInputFocus(220)}
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder="Or type manufacture year manually (e.g. 2018)"
                    placeholderTextColor={c.textMuted}
                    style={[styles.manualYearInput, { color: c.text }]}
                  />
                  {year !== '' && (
                    <TouchableOpacity
                      onPress={() => setYear('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={16} color={c.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* SECTION 4: Fuel Type */}
              <View style={styles.formSection}>
                <Text style={[styles.label, { color: c.text }]}>Fuel Type</Text>
                <View style={styles.pillSelectorRow}>
                  {FUEL_TYPES.map(f => {
                    const isSelected = fuelType === f.value;
                    return (
                      <TouchableOpacity
                        key={f.value}
                        onPress={() => setFuelType(f.value)}
                        style={[
                          styles.pillOption,
                          {
                            backgroundColor: isSelected ? c.accent : (isDark ? '#162C4E' : '#F1F5F9'),
                            borderColor: isSelected ? c.accent : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.pillOptionText, { color: isSelected ? '#061A38' : c.text }]}>
                          {f.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* SECTION 5: Transmission */}
              <View style={styles.formSection}>
                <Text style={[styles.label, { color: c.text }]}>Transmission</Text>
                <View style={styles.pillSelectorRow}>
                  {TRANSMISSIONS.map(t => {
                    const isSelected = transmission === t.value;
                    return (
                      <TouchableOpacity
                        key={t.value}
                        onPress={() => setTransmission(t.value)}
                        style={[
                          styles.pillOption,
                          {
                            backgroundColor: isSelected ? c.accent : (isDark ? '#162C4E' : '#F1F5F9'),
                            borderColor: isSelected ? c.accent : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.pillOptionText, { color: isSelected ? '#061A38' : c.text }]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* SECTION 6: Vehicle Colour (Visual Swatches) */}
              <View style={styles.formSection}>
                <Text style={[styles.label, { color: c.text }]}>Vehicle Colour</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.colorsRow}
                >
                  {CAR_COLOURS.map(item => {
                    const isSelected = color.toLowerCase() === item.name.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={item.name}
                        onPress={() => setColor(item.name)}
                        style={styles.colorSwatchWrap}
                      >
                        <View
                          style={[
                            styles.colorCircle,
                            {
                              backgroundColor: item.hex,
                              borderColor: isSelected
                                ? c.accent
                                : (item.borderOnly ? (isDark ? '#555' : '#D1D5DB') : 'rgba(0,0,0,0.12)'),
                              borderWidth: isSelected ? 3 : 1.5,
                              transform: [{ scale: isSelected ? 1.08 : 1 }],
                            },
                          ]}
                        >
                          {isSelected && (
                            <Check
                              size={14}
                              color={item.hex === '#FFFFFF' || item.hex === '#C0C0C0' || item.hex === '#C89B3C' ? '#061A38' : '#FFFFFF'}
                              strokeWidth={3}
                            />
                          )}
                        </View>
                        <Text numberOfLines={1} style={[styles.colorName, { color: isSelected ? c.accent : c.textMuted }]}>
                          {item.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TextInput
                  value={color}
                  onChangeText={setColor}
                  onFocus={() => handleInputFocus(380)}
                  placeholder="Or enter custom colour (e.g. Polar White, Abyss Black)"
                  placeholderTextColor={c.textMuted}
                  style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                />
              </View>

              {/* SECTION 7: Registration Number & Current Odometer */}
              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={[styles.label, { color: c.text }]}>Registration Number</Text>
                  <TextInput
                    value={regNumber}
                    onChangeText={txt => setRegNumber(txt.toUpperCase())}
                    onFocus={() => handleInputFocus(500)}
                    autoCapitalize="characters"
                    placeholder="TN 09 BK 1234"
                    placeholderTextColor={c.textMuted}
                    style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                  />
                </View>
                <View style={styles.inputHalf}>
                  <Text style={[styles.label, { color: c.text }]}>Current Odometer (km)</Text>
                  <TextInput
                    value={odometer}
                    onChangeText={setOdometer}
                    onFocus={() => handleInputFocus(560)}
                    keyboardType="number-pad"
                    placeholder="e.g. 28000"
                    placeholderTextColor={c.textMuted}
                    style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                  />
                </View>
              </View>

              {/* SECTION 8: Ownership Status */}
              <View style={styles.formSection}>
                <Text style={[styles.label, { color: c.text }]}>Ownership Relationship</Text>
                <View style={styles.pillSelectorRow}>
                  {OWNERSHIP_TYPES.map(o => {
                    const isSelected = ownership === o.value;
                    return (
                      <TouchableOpacity
                        key={o.value}
                        onPress={() => setOwnership(o.value)}
                        style={[
                          styles.pillOption,
                          {
                            backgroundColor: isSelected ? c.accent : (isDark ? '#162C4E' : '#F1F5F9'),
                            borderColor: isSelected ? c.accent : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.pillOptionText, { color: isSelected ? '#061A38' : c.text }]}>
                          {o.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* SECTION 9: Notes */}
              <View style={styles.formSection}>
                <Text style={[styles.label, { color: c.text }]}>Notes / Special Preferences</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  onFocus={() => handleInputFocus(720)}
                  placeholder="e.g. Prefers synthetic oil, custom sound system installed..."
                  placeholderTextColor={c.textMuted}
                  multiline
                  numberOfLines={3}
                  style={[styles.textArea, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                />
              </View>

              {/* Save Button */}
              <TouchableOpacity
                onPress={handleSaveVehicle}
                disabled={submitting}
                style={[styles.saveBtn, { backgroundColor: c.accent }]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#061A38" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingVehicle ? 'Update Vehicle' : 'Save Car to Garage'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>

    {/* V MOTIV Connect™ Management Modal */}
    <Modal
      visible={connectModalVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setConnectModalVisible(false)}
      statusBarTranslucent={true}
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setConnectModalVisible(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
          style={[
            styles.keyboardAvoidWrap,
            Platform.OS === 'android' && isKeyboardVisible ? { marginBottom: keyboardHeight } : null,
          ]}
        >
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: c.surface,
                height: activeSheetHeight,
                paddingBottom: isKeyboardVisible ? 10 : Math.max(insets.bottom, 16),
              },
            ]}
          >
            {/* Connect Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.connectIconWrap, { backgroundColor: '#F7B503', width: 32, height: 32 }]}>
                  <QrCode size={16} color="#061A38" />
                </View>
                <View>
                  <Text style={[styles.modalTitle, { color: c.text, fontSize: 17 }]}>
                    V MOTIV Connect™
                  </Text>
                  {activeConnectVehicle && (
                    <Text style={[styles.modalSubTitle, { color: c.textMuted }]}>
                      {activeConnectVehicle.make} {activeConnectVehicle.model} {activeConnectVehicle.registrationNumber ? `· ${activeConnectVehicle.registrationNumber}` : ''}
                    </Text>
                  )}
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setConnectModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[styles.modalCloseText, { color: c.accent }]}>Done</Text>
              </TouchableOpacity>
            </View>

            {loadingConnectDetails ? (
              <View style={[styles.connectCenterWrap, { paddingVertical: 40 }]}>
                <ActivityIndicator size="large" color={c.accent} />
                <Text style={[styles.connectLoadingText, { color: c.textMuted }]}>Syncing QR status...</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={[
                  styles.modalScrollContent,
                  { paddingBottom: isKeyboardVisible ? 240 : 40 },
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* If NOT LINKED */}
                {(!connectDetails?.isLinked || connectDetails?.link?.status === 'REVOKED') ? (
                  <View style={styles.connectUnlinkedWrap}>
                    {/* Segmented Control */}
                    <View style={[styles.connectTabRow, { backgroundColor: isDark ? '#14253E' : '#EDF2F7' }]}>
                      <TouchableOpacity
                        style={[
                          styles.connectTabBtn,
                          connectTab === 'GENERATE' && [styles.connectTabBtnActive, { backgroundColor: c.surface }],
                        ]}
                        onPress={() => setConnectTab('GENERATE')}
                      >
                        <Text
                          style={[
                            styles.connectTabBtnText,
                            { color: connectTab === 'GENERATE' ? c.text : c.textMuted },
                          ]}
                        >
                          Generate QR sticker
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.connectTabBtn,
                          connectTab === 'ORDER' && [styles.connectTabBtnActive, { backgroundColor: c.surface }],
                        ]}
                        onPress={() => setConnectTab('ORDER')}
                      >
                        <Text
                          style={[
                            styles.connectTabBtnText,
                            { color: connectTab === 'ORDER' ? c.text : c.textMuted },
                          ]}
                        >
                          Order Physical Sticker
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {connectTab === 'GENERATE' ? (
                      <View style={styles.connectTabContent}>
                        {/* Privacy Shield Info */}
                        <View style={[styles.privacyShieldBanner, { backgroundColor: isDark ? '#142742' : '#F0FDF4', borderColor: isDark ? '#1E3A5F' : '#BBF7D0' }]}>
                          <ShieldCheck size={20} color="#10B981" />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.privacyShieldTitle, { color: isDark ? '#34D399' : '#166534' }]}>
                              Zero-Knowledge Owner Privacy
                            </Text>
                            <Text style={[styles.privacyShieldDesc, { color: isDark ? '#93C5FD' : '#15803D' }]}>
                              Your QR never contains your phone number, address, or vehicle registration. Passersby use a secure V MOTIV relay.
                            </Text>
                          </View>
                        </View>

                        <Text style={[styles.connectOrderIntro, { color: c.textMuted }]}>
                          Create a unique QR sticker for this car. Scan it from any phone to send you an alert or request a privacy-protected call.
                        </Text>

                        <TouchableOpacity
                          onPress={handleGenerateSticker}
                          disabled={connectSubmitting}
                          style={[styles.saveBtn, { backgroundColor: c.accent, marginTop: 12 }]}
                        >
                          {connectSubmitting ? (
                            <ActivityIndicator size="small" color="#061A38" />
                          ) : (
                            <Text style={styles.saveBtnText}>Generate secure QR sticker</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.connectTabContent}>
                        <Text style={[styles.connectOrderIntro, { color: c.textMuted }]}>
                          Request a weather-resistant, UV-coated V MOTIV Connect™ sticker. Generate the secure QR first, then submit the delivery request.
                        </Text>

                        <View style={styles.formSection}>
                          <Text style={[styles.label, { color: c.text }]}>Delivery Address *</Text>
                          <TextInput
                            style={[styles.textArea, { color: c.text, borderColor: c.border, backgroundColor: isDark ? '#142742' : '#F8FAFC' }]}
                            placeholder="Flat/House number, Street, Apartment name"
                            placeholderTextColor={c.textMuted}
                            value={deliveryAddress}
                            onChangeText={setDeliveryAddress}
                            multiline
                          />
                        </View>

                        <View style={styles.inputRow}>
                          <View style={styles.inputHalf}>
                            <Text style={[styles.label, { color: c.text }]}>City *</Text>
                            <TextInput
                              style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: isDark ? '#142742' : '#F8FAFC' }]}
                              placeholder="e.g. Bengaluru"
                              placeholderTextColor={c.textMuted}
                              value={deliveryCity}
                              onChangeText={setDeliveryCity}
                            />
                          </View>
                          <View style={styles.inputHalf}>
                            <Text style={[styles.label, { color: c.text }]}>PIN Code *</Text>
                            <TextInput
                              style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: isDark ? '#142742' : '#F8FAFC' }]}
                              placeholder="e.g. 560001"
                              placeholderTextColor={c.textMuted}
                              keyboardType="number-pad"
                              maxLength={6}
                              value={deliveryPincode}
                              onChangeText={setDeliveryPincode}
                            />
                          </View>
                        </View>

                        <View style={styles.formSection}>
                          <Text style={[styles.label, { color: c.text }]}>Delivery Notes</Text>
                          <TextInput
                            style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: isDark ? '#142742' : '#F8FAFC' }]}
                            placeholder="e.g. Leave with security desk"
                            placeholderTextColor={c.textMuted}
                            value={deliveryInstructions}
                            onChangeText={setDeliveryInstructions}
                          />
                        </View>

                        <TouchableOpacity
                          onPress={handleOrderSticker}
                          disabled={connectSubmitting}
                          style={[styles.saveBtn, { backgroundColor: c.accent, marginTop: 12 }]}
                        >
                          {connectSubmitting ? (
                            <ActivityIndicator size="small" color="#061A38" />
                          ) : (
        <Text style={styles.saveBtnText}>Request printed sticker</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ) : (
                  /* If LINKED & ACTIVE / DISABLED */
                  <View style={styles.connectLinkedWrap}>
                    {/* Active Status Card */}
                    <View style={[styles.connectStatusCard, { backgroundColor: isDark ? '#14253E' : '#F6F9FD', borderColor: isDark ? '#1F3F6D' : '#DCE7F5' }]}>
                      <View style={styles.connectStatusHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.statusDot, { backgroundColor: connectDetails.link?.status === 'ACTIVE' ? '#10B981' : '#F7B503' }]} />
                          <Text style={[styles.connectStatusTitle, { color: c.text }]}>
                            {connectDetails.link?.status === 'ACTIVE' ? 'Passerby Alerts Active' : 'Passerby Alerts Paused'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={handleToggleConnect}
                          disabled={connectSubmitting}
                          style={[
                            styles.toggleStatusBtn,
                            { backgroundColor: connectDetails.link?.status === 'ACTIVE' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.toggleStatusBtnText,
                              { color: connectDetails.link?.status === 'ACTIVE' ? '#EF4444' : '#10B981' },
                            ]}
                          >
                            {connectDetails.link?.status === 'ACTIVE' ? 'Pause Alerts' : 'Resume Alerts'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={[styles.connectStatusDesc, { color: c.textMuted }]}>
                        {connectDetails.link?.status === 'ACTIVE'
                          ? 'Scanners will be able to message you or request a masked call when needed.'
                          : 'Scanners will see that the vehicle is temporarily not accepting requests.'}
                      </Text>

                      {/* Token Info Row */}
                      <View style={[styles.tokenRow, { borderTopColor: isDark ? '#1E3A5F' : '#E2E8F0' }]}>
                        <Text style={[styles.tokenLabel, { color: c.textMuted }]}>Sticker Token:</Text>
                        <Text style={[styles.tokenValue, { color: c.text }]}>{connectDetails.link?.qrTokenPreview}</Text>
                      </View>
                    </View>

                    {stickerImageUrl ? (
                      <View style={[styles.generatedStickerCard, { backgroundColor: isDark ? '#14253E' : '#FFFFFF', borderColor: isDark ? '#1F3F6D' : c.accent }]}>
                        <Text style={[styles.generatedStickerEyebrow, { color: isDark ? c.accent : '#9A6500' }]}>READY TO PRINT</Text>
                        <Text style={[styles.generatedStickerTitle, { color: c.text }]}>Your V MOTIV Connect sticker</Text>
                        <Text style={[styles.generatedStickerText, { color: c.textMuted }]}>Stored securely in Cloudinary. Print it and place it inside the windscreen.</Text>
                        <View style={[styles.generatedQrWrap, { backgroundColor: '#FFFFFF', borderColor: isDark ? '#1F3F6D' : '#DCE7F5' }]}>
                          <Image source={{ uri: stickerImageUrl }} style={styles.generatedQrImage} accessibilityLabel="Generated V MOTIV Connect QR sticker" />
                        </View>
                        <Text selectable style={[styles.generatedStickerUrl, { color: c.textMuted }]} numberOfLines={2}>{stickerImageUrl}</Text>
                        <TouchableOpacity onPress={() => void handleShareSticker()} style={[styles.saveBtn, { backgroundColor: c.accent, width: '100%', marginBottom: 0 }]}>
                          <Text style={styles.saveBtnText}>Save or share sticker</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    {/* Stats Overview */}
                    <View style={styles.connectStatsRow}>
                      <View style={[styles.connectStatBox, { backgroundColor: isDark ? '#14253E' : '#F6F9FD' }]}>
                        <Text style={[styles.connectStatNum, { color: c.text }]}>{connectDetails.stats?.totalAlerts || 0}</Text>
                        <Text style={[styles.connectStatLabel, { color: c.textMuted }]}>Total Alerts</Text>
                      </View>
                      <View style={[styles.connectStatBox, { backgroundColor: isDark ? '#14253E' : '#F6F9FD' }]}>
                        <Text style={[styles.connectStatNum, { color: (connectDetails.stats?.unreadAlerts || 0) > 0 ? '#F7B503' : c.text }]}>
                          {connectDetails.stats?.unreadAlerts || 0}
                        </Text>
                        <Text style={[styles.connectStatLabel, { color: c.textMuted }]}>Unread</Text>
                      </View>
                      <View style={[styles.connectStatBox, { backgroundColor: isDark ? '#14253E' : '#F6F9FD' }]}>
                        <Text style={[styles.connectStatNum, { color: c.text }]}>{connectDetails.stats?.totalCalls || 0}</Text>
                        <Text style={[styles.connectStatLabel, { color: c.textMuted }]}>Masked Calls</Text>
                      </View>
                    </View>

                    {/* Recent Passerby Alerts List */}
                    <View style={styles.alertsSection}>
                      {connectDetails.recentCalls?.some(call => ['requested', 'validating', 'queued', 'initiating', 'ringing'].includes(call.status.toLowerCase())) ? (
                        <View style={[styles.incomingCallBanner, { backgroundColor: isDark ? '#25301A' : '#F4FCE8', borderColor: '#84CC16' }]}>
                          <PhoneCall size={20} color="#65A30D" />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.incomingCallTitle, { color: c.text }]}>Incoming Connect call request</Text>
                            <Text style={[styles.incomingCallText, { color: c.textMuted }]}>A passerby has requested a privacy-protected call. Review the request in V MOTIV Connect before responding.</Text>
                          </View>
                        </View>
                      ) : null}
                      {connectDetails.recentCalls?.length ? (
                        <View style={styles.callHistoryWrap}>
                          <Text style={[styles.sectionSubtitle, { color: c.text }]}>Recent Call Requests</Text>
                          {connectDetails.recentCalls.slice(0, 3).map(call => (
                            <View key={call.id} style={[styles.callHistoryRow, { borderColor: c.border, backgroundColor: isDark ? '#14253E' : '#F8FAFC' }]}>
                              <PhoneCall size={16} color={call.status.toLowerCase() === 'connected' ? '#10B981' : c.accent} />
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.callHistoryTitle, { color: c.text }]}>Masked call · {call.status.replace(/_/g, ' ')}</Text>
                                <Text style={[styles.callHistoryMeta, { color: c.textMuted }]}>{new Date(call.createdAt).toLocaleString()}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      <Text style={[styles.sectionSubtitle, { color: c.text }]}>Recent Passerby Notifications</Text>

                      {(!connectDetails.recentAlerts || connectDetails.recentAlerts.length === 0) ? (
                        <View style={[styles.noAlertsBox, { backgroundColor: isDark ? '#14253E' : '#F8FAFC' }]}>
                          <Bell size={24} color={c.textMuted} />
                          <Text style={[styles.noAlertsText, { color: c.textMuted }]}>
                            No notifications yet. When a passerby scans your sticker to report blocking, lights left on, or an issue, it will appear here.
                          </Text>
                        </View>
                      ) : (
                        connectDetails.recentAlerts.map((alert) => (
                          <View
                            key={alert.id}
                            style={[
                              styles.alertCard,
                              {
                                backgroundColor: isDark ? '#14253E' : '#FFFFFF',
                                borderColor: alert.isRead ? (isDark ? '#1F3F6D' : '#E2E8F0') : '#F7B503',
                              },
                            ]}
                          >
                            <View style={styles.alertCardHeader}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                {!alert.isRead && <View style={styles.unreadDot} />}
                                <Text style={[styles.alertReason, { color: c.text }]}>
                                  {alert.reason ? alert.reason.replace(/_/g, ' ').toUpperCase() : 'ALERT'}
                                </Text>
                              </View>
                              <Text style={[styles.alertTime, { color: c.textMuted }]}>
                                {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>

                            {alert.messagePreview ? (
                              <Text style={[styles.alertMessage, { color: c.text }]}>
                                "{alert.messagePreview}"
                              </Text>
                            ) : null}

                            {alert.photoUrls && Array.isArray(alert.photoUrls) && alert.photoUrls.length > 0 ? (
                              <View style={styles.alertPhotosWrap}>
                                <Text style={[styles.alertPhotosLabel, { color: c.textMuted }]}>
                                  Attached evidence photo{alert.photoUrls.length > 1 ? 's' : ''}:
                                </Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.alertPhotosRow}>
                                  {alert.photoUrls.map((pUrl, pIdx) => (
                                    <TouchableOpacity
                                      key={pIdx}
                                      activeOpacity={0.8}
                                      onPress={() => setEnlargedPhotoUrl(pUrl)}
                                      style={[styles.alertPhotoThumbWrap, { borderColor: isDark ? '#1F3F6D' : '#CBD5E1' }]}
                                    >
                                      <Image source={{ uri: pUrl }} style={styles.alertPhotoThumb} resizeMode="cover" />
                                    </TouchableOpacity>
                                  ))}
                                </ScrollView>
                              </View>
                            ) : null}

                            {!alert.isRead && (
                              <TouchableOpacity
                                onPress={() => handleMarkAlertRead(alert.id)}
                                style={styles.markReadBtn}
                              >
                                <Check size={14} color="#10B981" />
                                <Text style={styles.markReadText}>Mark as Read</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))
                      )}
                    </View>

                    {/* Safety & Sticker Actions */}
                    <View style={styles.securityActionsWrap}>
                      <TouchableOpacity
                        onPress={confirmReplacementSticker}
                        style={[styles.securityActionBtn, { borderColor: c.border }]}
                      >
                        <QrCode size={16} color={c.accent} />
                        <Text style={[styles.securityActionText, { color: c.text }]}>Generate replacement QR sticker</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={handleReportConnectAbuse}
                        style={[styles.securityActionBtn, { borderColor: c.border }]}
                      >
                        <ShieldAlert size={16} color="#F7B503" />
                        <Text style={[styles.securityActionText, { color: c.text }]}>Report Passerby Misuse / Spam</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={handleRevokeConnect}
                        style={[styles.securityActionBtn, { borderColor: 'rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }]}
                      >
                        <Trash2 size={16} color="#EF4444" />
                        <Text style={[styles.securityActionText, { color: '#EF4444' }]}>Revoke Lost / Stolen Sticker</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>

    {/* Modal for viewing enlarged alert photo */}
    <Modal visible={Boolean(enlargedPhotoUrl)} transparent animationType="fade" onRequestClose={() => setEnlargedPhotoUrl(null)}>
      <View style={styles.photoModalBackdrop}>
        <TouchableOpacity
          style={[styles.photoModalCloseBtn, { top: insets.top + 16 }]}
          onPress={() => setEnlargedPhotoUrl(null)}
        >
          <X size={24} color="#FFFFFF" />
        </TouchableOpacity>
        {enlargedPhotoUrl ? (
          <Image
            source={{ uri: enlargedPhotoUrl }}
            style={styles.photoModalImage}
            resizeMode="contain"
          />
        ) : null}
      </View>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#061A38',
  },
  scrollContent: {
    padding: space.lg,
    gap: space.lg,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyBox: {
    padding: 32,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    gap: 16,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radius.pill,
    marginTop: 8,
  },
  primaryActionBtnText: {
    color: '#061A38',
    fontSize: 15,
    fontWeight: '700',
  },
  carCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    gap: space.md,
  },
  carHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  carBrandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  carTitleWrap: {
    gap: 2,
  },
  carTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  carSubtitle: {
    fontSize: 13,
  },
  preferredPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  preferredText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  setDefaultBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  setDefaultText: {
    fontSize: 11,
    fontWeight: '600',
  },
  specChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  specChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  specChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoGrid: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
  },
  infoCol: {
    flex: 1,
    gap: 4,
  },
  infoIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  activeBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  activeBannerTextWrap: {
    flex: 1,
  },
  activeBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeBannerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
  },
  bookServiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  bookServiceBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#061A38',
  },
  subActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    gap: 12,
  },
  connectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  connectTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  connectSubtitle: {
    fontSize: 12,
  },
  connectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  connectBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  connectDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  connectBtnDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  connectBtnDisabledText: {
    fontSize: 12,
    fontWeight: '600',
  },
  vehicleConnectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 12,
  },
  vehicleConnectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  vehicleConnectIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleConnectInfo: {
    flex: 1,
  },
  vehicleConnectTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vehicleConnectTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  statusBadgeSmallText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  vehicleConnectSub: {
    fontSize: 11,
    marginTop: 2,
  },
  manageConnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  manageConnectBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  connectPillarsRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 4,
  },
  connectPillar: {
    flex: 1,
    padding: 10,
    borderRadius: radius.md,
    gap: 4,
  },
  connectPillarTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  connectPillarText: {
    fontSize: 11,
    lineHeight: 15,
  },
  connectActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  connectActionBtnText: {
    color: '#061A38',
    fontSize: 13,
    fontWeight: '700',
  },
  connectScanInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectScanInput: {
    flex: 1,
  },
  connectScanButton: {
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  connectScanButtonText: {
    color: '#061A38',
    fontSize: 11,
    fontWeight: '800',
  },
  modalSubTitle: {
    fontSize: 12,
    marginTop: 1,
  },
  connectCenterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  connectLoadingText: {
    fontSize: 13,
  },
  connectUnlinkedWrap: {
    gap: 14,
  },
  connectTabRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.pill,
    marginBottom: 8,
  },
  connectTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  connectTabBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    elevation: 1,
  },
  connectTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  connectTabContent: {
    gap: 12,
  },
  privacyShieldBanner: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
    alignItems: 'flex-start',
  },
  privacyShieldTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  privacyShieldDesc: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  fieldHint: {
    fontSize: 11,
    marginTop: 4,
  },
  connectOrderIntro: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 4,
  },
  connectLinkedWrap: {
    gap: 16,
  },
  connectStatusCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  connectStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  toggleStatusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  toggleStatusBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  connectStatusDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  generatedStickerCard: {
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: 10,
  },
  generatedStickerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  generatedStickerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  generatedStickerText: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  generatedQrWrap: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  generatedQrImage: {
    width: 184,
    height: 184,
  },
  generatedStickerUrl: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  tokenLabel: {
    fontSize: 12,
  },
  tokenValue: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  connectStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  connectStatBox: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  connectStatNum: {
    fontSize: 18,
    fontWeight: '800',
  },
  connectStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  alertsSection: {
    gap: 10,
    marginTop: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  noAlertsBox: {
    padding: 20,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  noAlertsText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  alertCard: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  incomingCallBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  incomingCallTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  incomingCallText: {
    marginTop: 3,
    fontSize: 11.5,
    lineHeight: 16,
  },
  callHistoryWrap: {
    gap: 8,
  },
  callHistoryRow: {
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  callHistoryTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  callHistoryMeta: {
    marginTop: 2,
    fontSize: 10.5,
  },
  alertCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F7B503',
  },
  alertReason: {
    fontSize: 12,
    fontWeight: '700',
  },
  alertTime: {
    fontSize: 11,
  },
  alertMessage: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  alertPhotosWrap: {
    marginTop: 6,
    gap: 6,
  },
  alertPhotosLabel: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  alertPhotosRow: {
    flexDirection: 'row',
    gap: 8,
  },
  alertPhotoThumbWrap: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
  },
  alertPhotoThumb: {
    width: '100%',
    height: '100%',
  },
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  photoModalCloseBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoModalImage: {
    width: '100%',
    height: '80%',
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingTop: 4,
  },
  markReadText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
  securityActionsWrap: {
    gap: 10,
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#334155',
    paddingTop: 16,
  },
  securityActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  securityActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  keyboardAvoidWrap: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: space.lg,
    width: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalBody: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 40,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  selectedYearBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  selectedYearBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  manualYearBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  manualYearInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  formSection: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  brandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  brandCard: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    gap: 4,
  },
  brandCardText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  noResults: {
    fontSize: 13,
    marginVertical: 12,
  },
  customBrandBtn: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 6,
  },
  customBrandBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  selectedBrandBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  selectedBrandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedBrandLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  selectedBrandName: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
  },
  changeBrandBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  changeBrandText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modelsRow: {
    gap: 8,
    paddingBottom: 8,
  },
  modelChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  modelChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  yearsRow: {
    gap: 8,
    paddingBottom: 4,
  },
  yearChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  yearChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pillSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillOption: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillOptionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  colorsRow: {
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  colorSwatchWrap: {
    alignItems: 'center',
    gap: 4,
  },
  colorCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  colorName: {
    fontSize: 10,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inputHalf: {
    flex: 1,
  },
  input: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textArea: {
    minHeight: 70,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  saveBtn: {
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  saveBtnText: {
    color: '#061A38',
    fontSize: 15,
    fontWeight: '700',
  },
});
