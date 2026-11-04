import React, { useState, useEffect, type FC, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { api } from '../api';
import { CURRENT_YEAR } from '../calendar';
import type {
  Branch,
  RentalBookingItem,
  RentalFleetItem,
  RentalOperationsSummary,
  RentalPaymentDashboard,
  RentalPaymentSummary,
  RentalPaymentSchedule,
  RentalPaymentTransaction,
} from '../types';
import { IconCheck, IconCross, IconRefresh, IconRentals, IconSearch } from '../icons';

function formatRupees(paise?: string | number | null): string {
  if (paise === undefined || paise === null || paise === '') return '—';
  try {
    const p = typeof paise === 'string' ? BigInt(paise) : BigInt(Math.round(paise));
    const isNeg = p < 0n;
    const abs = isNeg ? -p : p;
    const inr = Number(abs / 100n);
    const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(inr);
    return isNeg ? `-${formatted}` : formatted;
  } catch {
    return '—';
  }
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

interface RentalOperationsPanelProps {
  user: User;
  branches: Branch[];
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export const RentalOperationsPanel: FC<RentalOperationsPanelProps> = ({
  user,
  branches,
  onError,
  onSuccess,
}) => {
  const oneYearFromNow = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [subTab, setSubTab] = useState<'fleet' | 'bookings'>('fleet');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<RentalOperationsSummary | null>(null);
  const [fleet, setFleet] = useState<RentalFleetItem[]>([]);
  const [bookings, setBookings] = useState<RentalBookingItem[]>([]);
  const [paymentDashboard, setPaymentDashboard] = useState<RentalPaymentDashboard | null>(null);
  const [hubs, setHubs] = useState<Array<{ id: string; name: string; city: string }>>([]);
  const [bookingStatusFilter, setBookingStatusFilter] = useState('ALL');
  const [selectedHubId, setSelectedHubId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Optional date check: shows which cars are free, on hold, booked or in trip for an interval.
  const [availFrom, setAvailFrom] = useState('');
  const [availTo, setAvailTo] = useState('');
  const [availRange, setAvailRange] = useState<{ from: string; to: string } | null>(null);
  const [availOnlyBookable, setAvailOnlyBookable] = useState(false);

  // Modals & Drawer
  const [onboardModalOpen, setOnboardModalOpen] = useState(false);
  const [walkInModalOpen, setWalkInModalOpen] = useState(false);
  const [blockModalVehicle, setBlockModalVehicle] = useState<RentalFleetItem | null>(null);
  const [historyModalVehicle, setHistoryModalVehicle] = useState<RentalFleetItem | null>(null);
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);
  const [activeBooking, setActiveBooking] = useState<RentalBookingItem | null>(null);
  const [bookingDrawerTab, setBookingDrawerTab] = useState<'overview' | 'kyc' | 'handover' | 'return' | 'extension' | 'payment'>('overview');
  const [actionBusy, setActionBusy] = useState(false);

  // Active Booking Payment & Audit State
  const [activePaymentSummary, setActivePaymentSummary] = useState<RentalPaymentSummary | null>(null);
  const [activePaymentSchedule, setActivePaymentSchedule] = useState<RentalPaymentSchedule | null>(null);
  const [activePaymentHistory, setActivePaymentHistory] = useState<RentalPaymentTransaction[]>([]);
  const [loadingPaymentDetails, setLoadingPaymentDetails] = useState(false);

  // Manual / Counter Payment State
  const [recordPaymentModalOpen, setRecordPaymentModalOpen] = useState(false);
  const [recordPaymentType, setRecordPaymentType] = useState<'BALANCE' | 'ADVANCE' | 'FULL' | 'DEPOSIT' | 'ADDITIONAL'>('BALANCE');
  const [recordPaymentAmount, setRecordPaymentAmount] = useState<string>('');
  const [recordPaymentMethod, setRecordPaymentMethod] = useState<string>('CASH');
  const [recordPaymentReference, setRecordPaymentReference] = useState<string>('');
  const [recordPaymentNotes, setRecordPaymentNotes] = useState<string>('');
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Operations Manual Cancellation State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelCategory, setCancelCategory] = useState<'KYC_CORRECTION_TIMEOUT' | 'CUSTOMER_REQUESTED' | 'NO_SHOW' | 'OPERATIONS_DISCRETION' | 'VEHICLE_UNAVAILABLE' | 'PAYMENT_FAILED_OR_OVERDUE' | 'OTHER'>('CUSTOMER_REQUESTED');
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancelWaiveFee, setCancelWaiveFee] = useState<boolean>(true);
  const [cancelInternalNotes, setCancelInternalNotes] = useState<string>('');
  const [cancellingBooking, setCancellingBooking] = useState(false);

  // Walk-In / Offline Hub Booking Form State
  const [walkInVehicleId, setWalkInVehicleId] = useState('');
  // Availability of every fleet car for the walk-in dates (same rules customers see online).
  const [walkInAvailability, setWalkInAvailability] = useState<Record<string, RentalFleetItem['availability']>>({});
  const [walkInCustomerName, setWalkInCustomerName] = useState('');
  const [walkInCustomerPhone, setWalkInCustomerPhone] = useState('');
  const [walkInCustomerEmail, setWalkInCustomerEmail] = useState('');
  const [walkInStartDate, setWalkInStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [walkInStartTime, setWalkInStartTime] = useState('10:00');
  const [walkInDays, setWalkInDays] = useState(2);
  const [walkInLicenseNumber, setWalkInLicenseNumber] = useState('');
  const [walkInLicenseExpiry, setWalkInLicenseExpiry] = useState(oneYearFromNow());
  const [walkInExperienceYears, setWalkInExperienceYears] = useState(5);
  const [walkInLicenseFrontUrl, setWalkInLicenseFrontUrl] = useState('');
  const [walkInLicenseBackUrl, setWalkInLicenseBackUrl] = useState('');
  const [walkInPaymentMethod, setWalkInPaymentMethod] = useState('UPI');
  const [walkInPaymentTxRef, setWalkInPaymentTxRef] = useState('');
  const [walkInImmediateHandover, setWalkInImmediateHandover] = useState(true);
  const [walkInStartOdo, setWalkInStartOdo] = useState<number>(0);
  const [walkInFuelPercent, setWalkInFuelPercent] = useState<number>(100);
  const [walkInNotes, setWalkInNotes] = useState('');

  interface LocalFileItem {
    file: File;
    previewUrl: string;
  }

  // Hub KYC Upload State
  const [hubKycLicenseNumber, setHubKycLicenseNumber] = useState('');
  const [hubKycExpiry, setHubKycExpiry] = useState(oneYearFromNow());
  const [hubKycFrontUrl, setHubKycFrontUrl] = useState('');
  const [hubKycBackUrl, setHubKycBackUrl] = useState('');
  const [hubKycFrontLocal, setHubKycFrontLocal] = useState<LocalFileItem | null>(null);
  const [hubKycBackLocal, setHubKycBackLocal] = useState<LocalFileItem | null>(null);
  const [editKycDocuments, setEditKycDocuments] = useState(false);

  // Dispatch / Handover Inspection Photos
  const [handoverPhotos, setHandoverPhotos] = useState<string[]>([]);
  const [handoverLocalFiles, setHandoverLocalFiles] = useState<LocalFileItem[]>([]);
  const [editHandover, setEditHandover] = useState(false);

  // Return Inspection Photos
  const [returnPhotos, setReturnPhotos] = useState<string[]>([]);
  const [returnLocalFiles, setReturnLocalFiles] = useState<LocalFileItem[]>([]);
  const [editReturnSettlement, setEditReturnSettlement] = useState(false);

  // Walk-in KYC Local Files
  const [walkInFrontLocal, setWalkInFrontLocal] = useState<LocalFileItem | null>(null);
  const [walkInBackLocal, setWalkInBackLocal] = useState<LocalFileItem | null>(null);

  // Onboard local file holding
  const [onboardLocalFiles, setOnboardLocalFiles] = useState<LocalFileItem[]>([]);

  // Lightbox Document & Photo Preview Modal
  const [lightboxModal, setLightboxModal] = useState<{ url: string; title: string } | null>(null);

  // Onboard form state
  const [onboardReg, setOnboardReg] = useState('');
  const [onboardFleetNumber, setOnboardFleetNumber] = useState('');
  const [onboardVin, setOnboardVin] = useState('');
  const [onboardMake, setOnboardMake] = useState('Hyundai');
  const [onboardModel, setOnboardModel] = useState('Creta');
  const [onboardVariant, setOnboardVariant] = useState('SX(O) AT');
  const [onboardYear, setOnboardYear] = useState<number>(2024);
  const [onboardHubId, setOnboardHubId] = useState('');
  const [onboardTransmission, setOnboardTransmission] = useState('AUTOMATIC');
  const [onboardFuel, setOnboardFuel] = useState('PETROL');
  const [onboardSeats, setOnboardSeats] = useState<number>(5);
  const [onboardColor, setOnboardColor] = useState('Polar White');
  const [onboardDailyRateRupees, setOnboardDailyRateRupees] = useState<number>(2800);
  const [onboardHourlyRateRupees, setOnboardHourlyRateRupees] = useState<number>(280);
  const [onboardDepositRupees, setOnboardDepositRupees] = useState<number>(5000);
  const [onboardIncludedKm, setOnboardIncludedKm] = useState<number>(250);
  const [onboardExtraKmRateRupees, setOnboardExtraKmRateRupees] = useState<number>(12);
  const [onboardOdometerKm, setOnboardOdometerKm] = useState<number>(12000);

  // Documentation / Compliance state
  const [onboardPermitNumber, setOnboardPermitNumber] = useState('');
  const [onboardPermitExpiry, setOnboardPermitExpiry] = useState(oneYearFromNow());
  const [onboardInsurancePolicy, setOnboardInsurancePolicy] = useState('');
  const [onboardInsuranceExpiry, setOnboardInsuranceExpiry] = useState(oneYearFromNow());
  const [onboardFitnessExpiry, setOnboardFitnessExpiry] = useState(oneYearFromNow());

  // Images state
  const [onboardImages, setOnboardImages] = useState<string[]>([
    'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
  ]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageUploading, setImageUploading] = useState(false);

  // Features state
  const POPULAR_FEATURES = [
    'Air Conditioning',
    'Touchscreen Apple CarPlay & Android Auto',
    'Reverse Camera & Parking Sensors',
    'Electric Sunroof',
    'Cruise Control',
    'Push Button Start & Keyless Entry',
    'Fastag Fitted & Active',
    'GPS Real-Time Tracking',
    'Wireless Phone Charger',
    'Leatherette Seats',
    '6 Airbags & ABS with EBD',
    'USB-C Fast Charging Ports',
    'Bluetooth Audio & Calling',
    'Alloy Wheels',
  ];
  const [onboardFeatures, setOnboardFeatures] = useState<string[]>([
    'Air Conditioning',
    'Touchscreen Apple CarPlay & Android Auto',
    'Reverse Camera & Parking Sensors',
    'Fastag Fitted & Active',
    'GPS Real-Time Tracking',
    'Bluetooth Audio & Calling',
  ]);
  const [customFeatureInput, setCustomFeatureInput] = useState('');

  const MODEL_PRESETS: Record<string, { make: string; model: string; variant: string; fuel: string; transmission: string; seats: number; dailyRate: number; deposit: number; color: string; images: string[] }> = {
    'Hyundai Creta': {
      make: 'Hyundai',
      model: 'Creta',
      variant: 'SX(O) AT',
      fuel: 'PETROL',
      transmission: 'AUTOMATIC',
      seats: 5,
      dailyRate: 2800,
      deposit: 5000,
      color: 'Polar White',
      images: [
        'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80',
      ],
    },
    'Tata Nexon EV': {
      make: 'Tata',
      model: 'Nexon EV',
      variant: 'Empowered LR 40.5kWh',
      fuel: 'EV',
      transmission: 'AUTOMATIC',
      seats: 5,
      dailyRate: 3500,
      deposit: 6000,
      color: 'Daytona Grey',
      images: [
        'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&w=1200&q=80',
      ],
    },
    'Toyota Innova Crysta': {
      make: 'Toyota',
      model: 'Innova Crysta',
      variant: '2.4 VX 7-Seater',
      fuel: 'DIESEL',
      transmission: 'MANUAL',
      seats: 7,
      dailyRate: 4200,
      deposit: 7000,
      color: 'Silver Metallic',
      images: [
        'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=1200&q=80',
      ],
    },
    'Mahindra Thar 4x4': {
      make: 'Mahindra',
      model: 'Thar',
      variant: 'LX Hardtop AT 4x4',
      fuel: 'DIESEL',
      transmission: 'AUTOMATIC',
      seats: 4,
      dailyRate: 3800,
      deposit: 8000,
      color: 'Napoli Black',
      images: [
        'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80',
      ],
    },
    'Maruti Swift': {
      make: 'Maruti Suzuki',
      model: 'Swift',
      variant: 'ZXi+ AMT',
      fuel: 'PETROL',
      transmission: 'AUTOMATIC',
      seats: 5,
      dailyRate: 1900,
      deposit: 4000,
      color: 'Sizzling Red',
      images: [
        'https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=1200&q=80',
      ],
    },
  };

  const applyCarPreset = (presetKey: string) => {
    const p = MODEL_PRESETS[presetKey];
    if (!p) return;
    setOnboardMake(p.make);
    setOnboardModel(p.model);
    setOnboardVariant(p.variant);
    setOnboardFuel(p.fuel);
    setOnboardTransmission(p.transmission);
    setOnboardSeats(p.seats);
    setOnboardDailyRateRupees(p.dailyRate);
    setOnboardHourlyRateRupees(Math.round(p.dailyRate / 10));
    setOnboardDepositRupees(p.deposit);
    setOnboardColor(p.color);
    setOnboardImages(p.images);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newItems: LocalFileItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      if (file.size > 12 * 1024 * 1024) {
        onError(`${file.name} is larger than the 12 MB upload limit.`);
        continue;
      }
      newItems.push({
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    setOnboardLocalFiles(prev => [...prev, ...newItems]);
    if (e.target) e.target.value = '';
  };

  const handleAddImageUrl = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      onError('Please enter a valid HTTP/HTTPS image URL.');
      return;
    }
    setOnboardImages(prev => [...prev, url]);
    setImageUrlInput('');
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setOnboardImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSetCoverImage = (indexToCover: number) => {
    setOnboardImages(prev => {
      const copy = [...prev];
      const [item] = copy.splice(indexToCover, 1);
      if (item) copy.unshift(item);
      return copy;
    });
  };

  const handleToggleFeature = (feat: string) => {
    setOnboardFeatures(prev =>
      prev.includes(feat) ? prev.filter(f => f !== feat) : [...prev, feat]
    );
  };

  const handleAddCustomFeature = () => {
    const val = customFeatureInput.trim();
    if (!val) return;
    if (!onboardFeatures.includes(val)) {
      setOnboardFeatures(prev => [...prev, val]);
    }
    setCustomFeatureInput('');
  };

  const uploadFileToCloudinary = async (file: File, folder: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read file from disk'));
      reader.onload = async () => {
        try {
          const raw = reader.result as string;
          const base64Data = raw.includes(',') ? raw.split(',')[1]! : raw;
          const res = await api.uploadListingPhoto(user, {
            base64Data,
            mimeType: file.type || 'image/jpeg',
            filename: file.name.replace(/\.[^.]+$/, ''),
            folder,
          });
          const url = res.secureUrl || res.url;
          if (url) {
            resolve(url);
          } else {
            resolve(raw);
          }
        } catch {
          // Local dev fallback to data URL
          resolve(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Block form state
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');
  const [blockReason, setBlockReason] = useState('MAINTENANCE');
  const [blockNotes, setBlockNotes] = useState('');

  // Booking Action form states
  const [kycRejectionReason, setKycRejectionReason] = useState('');
  const [handoverOdometer, setHandoverOdometer] = useState<number>(12500);
  const [handoverFuel, setHandoverFuel] = useState<number>(100);
  const [handoverKeyReleased, setHandoverKeyReleased] = useState(true);
  const [handoverNotes, setHandoverNotes] = useState('Clean car, full tank fuel verified.');

  const [returnOdometer, setReturnOdometer] = useState<number>(12850);
  const [returnFuel, setReturnFuel] = useState<number>(90);
  const [returnKeyReceived, setReturnKeyReceived] = useState(true);
  const [returnExcessKm, setReturnExcessKm] = useState<number>(0);
  const [returnExcessKmChargeRupees, setReturnExcessKmChargeRupees] = useState<number>(0);
  const [returnDamageChargeRupees, setReturnDamageChargeRupees] = useState<number>(0);
  const [returnNotes, setReturnNotes] = useState('Vehicle returned in good condition. No visible damages.');

  useEffect(() => {
    if (!walkInModalOpen) return;
    const start = new Date(`${walkInStartDate}T${walkInStartTime}:00`);
    if (isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + walkInDays * 24 * 3600 * 1000);
    let cancelled = false;
    api
      .rentalFleet(user, { startTime: start.toISOString(), endTime: end.toISOString() })
      .then(list => {
        if (cancelled) return;
        const map: Record<string, RentalFleetItem['availability']> = {};
        for (const v of list || []) map[v.id] = v.availability ?? null;
        setWalkInAvailability(map);
      })
      .catch(() => { if (!cancelled) setWalkInAvailability({}); });
    return () => { cancelled = true; };
  }, [walkInModalOpen, walkInStartDate, walkInStartTime, walkInDays]);

  const loadData = async () => {
    setLoading(true);
    try {
      const isPaymentFilter = ['PARTIALLY_PAID', 'PAID_IN_FULL', 'OVERDUE'].includes(bookingStatusFilter);
      const isBookingFilter = ['CONFIRMED', 'TRIP_ACTIVE', 'RETURN_INSPECTED', 'SETTLED', 'CANCELLED'].includes(bookingStatusFilter);

      const [hubsList, sum, flt, bks, payDash] = await Promise.all([
        api.rentalHubs(user).catch(() => []),
        api.rentalSummary(user).catch(() => ({ activeFleet: 0, activeBookings: 0, pendingKyc: 0, returnsDueToday: 0 })),
        api.rentalFleet(user, {
          hubId: selectedHubId || undefined,
          startTime: availRange ? new Date(availRange.from).toISOString() : undefined,
          endTime: availRange ? new Date(availRange.to).toISOString() : undefined,
        }),
        api.rentalBookings(user, {
          hubId: selectedHubId || undefined,
          status: isBookingFilter ? bookingStatusFilter : undefined,
          paymentStatus: isPaymentFilter ? bookingStatusFilter : undefined,
        }),
        api.rentalPaymentDashboard(user).catch(() => null),
      ]);
      if (hubsList && hubsList.length > 0) {
        setHubs(hubsList);
      }
      setSummary(sum);
      setFleet(flt || []);
      setBookings(bks || []);
      setPaymentDashboard(payDash);
      if (!onboardHubId) {
        setOnboardHubId(hubsList?.[0]?.id || branches[0]?.id || '');
      }
    } catch (err: any) {
      onError(err?.message || 'Failed to load rental operations data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [selectedHubId, bookingStatusFilter, availRange]);

  // Load authoritative payment details & ledger whenever active booking changes
  useEffect(() => {
    if (!activeBooking) {
      setActivePaymentSummary(null);
      setActivePaymentSchedule(null);
      setActivePaymentHistory([]);
      return;
    }
    let isMounted = true;
    setLoadingPaymentDetails(true);
    Promise.all([
      api.rentalPaymentSummary(user, activeBooking.id).catch(() => null),
      api.rentalPaymentSchedule(user, activeBooking.id).catch(() => null),
      api.rentalPaymentHistory(user, activeBooking.id).catch(() => []),
    ]).then(([sum, sched, hist]) => {
      if (isMounted) {
        if (sum) setActivePaymentSummary(sum);
        if (sched) setActivePaymentSchedule(sched);
        if (hist) setActivePaymentHistory(hist);
        setLoadingPaymentDetails(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeBooking?.id]);

  const reloadPaymentDetails = async (bookingId: string) => {
    setLoadingPaymentDetails(true);
    try {
      const [updated, sum, sched, hist] = await Promise.all([
        api.rentalBookingDetails(user, bookingId).catch(() => null),
        api.rentalPaymentSummary(user, bookingId).catch(() => null),
        api.rentalPaymentSchedule(user, bookingId).catch(() => null),
        api.rentalPaymentHistory(user, bookingId).catch(() => []),
      ]);
      if (updated) setActiveBooking(updated);
      if (sum) setActivePaymentSummary(sum);
      if (sched) setActivePaymentSchedule(sched);
      if (hist) setActivePaymentHistory(hist);
    } finally {
      setLoadingPaymentDetails(false);
    }
  };

  const openRecordPaymentModal = (preferredType?: 'BALANCE' | 'ADVANCE' | 'FULL' | 'DEPOSIT' | 'ADDITIONAL') => {
    if (!activeBooking) return;
    const outstanding = Number(activePaymentSummary?.outstandingPaise || activeBooking.outstandingBalancePaise || 0) / 100;
    const deposit = Number(activeBooking.securityDepositPaise || 0) / 100;

    let targetType: 'BALANCE' | 'ADVANCE' | 'FULL' | 'DEPOSIT' | 'ADDITIONAL' = preferredType || 'BALANCE';
    let targetAmount = '';

    if (preferredType) {
      targetType = preferredType;
      if (preferredType === 'BALANCE' && outstanding > 0) targetAmount = outstanding.toString();
      else if (preferredType === 'DEPOSIT') targetAmount = deposit.toString();
    } else if (outstanding > 0) {
      targetType = 'BALANCE';
      targetAmount = outstanding.toString();
    } else if (activeBooking.depositStatus !== 'HELD_ESCROW' && deposit > 0) {
      targetType = 'DEPOSIT';
      targetAmount = deposit.toString();
    }

    setRecordPaymentType(targetType);
    setRecordPaymentAmount(targetAmount);
    setRecordPaymentMethod('CASH');
    setRecordPaymentReference('');
    setRecordPaymentNotes('');
    setRecordPaymentModalOpen(true);
  };

  const handleRecordPaymentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeBooking || !user) return;
    const amt = parseFloat(recordPaymentAmount);
    if (isNaN(amt) || amt <= 0) {
      onError('Please enter a valid payment amount greater than zero.');
      return;
    }
    try {
      setRecordingPayment(true);
      await api.recordRentalPayment(user, activeBooking.id, {
        installmentType: recordPaymentType,
        amountRupees: amt,
        paymentMethod: recordPaymentMethod,
        reference: recordPaymentReference.trim() || undefined,
        notes: recordPaymentNotes.trim() || undefined,
      });
      onSuccess(`Payment of ₹${amt.toLocaleString('en-IN')} recorded and verified successfully for ${activeBooking.bookingNumber}.`);
      setRecordPaymentModalOpen(false);
      setRecordPaymentAmount('');
      setRecordPaymentReference('');
      setRecordPaymentNotes('');
      await reloadPaymentDetails(activeBooking.id);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to record counter payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  const openCancelModal = (category: 'KYC_CORRECTION_TIMEOUT' | 'CUSTOMER_REQUESTED' | 'NO_SHOW' | 'OPERATIONS_DISCRETION' | 'VEHICLE_UNAVAILABLE' | 'PAYMENT_FAILED_OR_OVERDUE' | 'OTHER' = 'CUSTOMER_REQUESTED') => {
    if (!activeBooking) return;
    if (activeBooking.status !== 'CONFIRMED' && activeBooking.status !== 'PENDING_PAYMENT') {
      onError('Rental booking cannot be cancelled once vehicle pickup has been dispatched. Please use the Return Inspection workflow instead.');
      return;
    }
    setCancelCategory(category);
    if (category === 'KYC_CORRECTION_TIMEOUT') {
      setCancelReason('Customer did not submit corrected KYC documents within the required verification window.');
    } else if (category === 'CUSTOMER_REQUESTED') {
      setCancelReason('Customer contacted operations requesting to cancel this rental booking.');
    } else if (category === 'NO_SHOW') {
      setCancelReason('Customer did not arrive at pickup hub to collect vehicle.');
    } else if (category === 'VEHICLE_UNAVAILABLE') {
      setCancelReason('Assigned vehicle is undergoing unscheduled maintenance/repairs.');
    } else if (category === 'PAYMENT_FAILED_OR_OVERDUE') {
      setCancelReason('Rental payment schedule is overdue and unpaid.');
    } else {
      setCancelReason('Cancelled per operations review.');
    }
    setCancelWaiveFee(true);
    setCancelInternalNotes('');
    setCancelModalOpen(true);
  };

  const handleCancelBookingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeBooking || !user) return;
    if (activeBooking.status !== 'CONFIRMED' && activeBooking.status !== 'PENDING_PAYMENT') {
      onError('Rental booking cannot be cancelled once vehicle pickup has been dispatched.');
      return;
    }
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) {
      onError('Please provide a reason for cancelling this booking.');
      return;
    }
    try {
      setCancellingBooking(true);
      await api.cancelRentalBooking(user, activeBooking.id, {
        reason: trimmedReason,
        cancellationCategory: cancelCategory,
        waiveCancellationFee: cancelWaiveFee,
        internalNotes: cancelInternalNotes.trim() || undefined,
      });
      setCancelModalOpen(false);
      onSuccess(`Booking #${activeBooking.bookingNumber} was cancelled. Vehicle is released to Available.`);
      setActiveBooking(prev => prev ? { ...prev, status: 'CANCELLED', cancellationReason: `[${cancelCategory}] ${trimmedReason}` } : null);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to cancel rental booking');
    } finally {
      setCancellingBooking(false);
    }
  };

  // Handle Onboard Fleet
  const handleOnboardSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    try {
      const reg = onboardReg.toUpperCase().replace(/\s/g, '');
      const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const permitExp = onboardPermitExpiry ? new Date(`${onboardPermitExpiry}T00:00:00.000Z`).toISOString() : oneYear;
      const insExp = onboardInsuranceExpiry ? new Date(`${onboardInsuranceExpiry}T00:00:00.000Z`).toISOString() : oneYear;
      const fitExp = onboardFitnessExpiry ? new Date(`${onboardFitnessExpiry}T00:00:00.000Z`).toISOString() : oneYear;

      const uploadedLocalUrls: string[] = [];
      for (const item of onboardLocalFiles) {
        const url = await uploadFileToCloudinary(item.file, `vmotiv/rental-fleet/${reg || 'draft'}`);
        uploadedLocalUrls.push(url);
      }
      const allImages = [...onboardImages, ...uploadedLocalUrls];
      const vehicleImages = allImages.length > 0 ? allImages : [
        'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80'
      ];

      await api.createRentalFleetVehicle(user, {
        fleetNumber: onboardFleetNumber.trim() || `VMF-${Math.floor(100 + Math.random() * 899)}`,
        registrationNumber: reg,
        vin: onboardVin.toUpperCase().replace(/\s/g, '') || `VIN-RENTAL-${Date.now()}`,
        make: onboardMake.trim(),
        model: onboardModel.trim(),
        variant: onboardVariant.trim() || undefined,
        year: Number(onboardYear),
        hubId: onboardHubId || hubs[0]?.id || branches[0]?.id || '',
        transmission: onboardTransmission,
        fuelType: onboardFuel,
        seats: Number(onboardSeats) || 5,
        color: onboardColor.trim() || 'Polar White',
        baseDailyRatePaise: onboardDailyRateRupees * 100,
        baseHourlyRatePaise: (onboardHourlyRateRupees || Math.round(onboardDailyRateRupees / 10)) * 100,
        securityDepositPaise: onboardDepositRupees * 100,
        includedKmPerDay: Number(onboardIncludedKm) || 250,
        includedDailyKm: Number(onboardIncludedKm) || 250,
        extraKmRatePaise: onboardExtraKmRateRupees * 100,
        commercialPermitNumber: onboardPermitNumber.trim() || `KA-COMM-${reg.slice(-4) || 'RENTAL'}`,
        commercialPermitExpiry: permitExp,
        insurancePolicyNumber: onboardInsurancePolicy.trim() || `POL-VM-${reg.slice(-4) || 'RENTAL'}`,
        insuranceExpiry: insExp,
        fitnessCertExpiry: fitExp,
        images: vehicleImages,
        features: onboardFeatures,
      });
      onSuccess(`Successfully onboarded ${onboardMake} ${onboardModel} (${reg}) to rental fleet.`);
      setOnboardLocalFiles([]);
      setOnboardModalOpen(false);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to onboard rental fleet vehicle');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Availability Block
  const handleBlockSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!blockModalVehicle) return;
    setActionBusy(true);
    try {
      await api.createRentalBlock(user, blockModalVehicle.id, {
        startTime: blockStart ? new Date(blockStart).toISOString() : new Date().toISOString(),
        endTime: blockEnd ? new Date(blockEnd).toISOString() : new Date(Date.now() + 86400000).toISOString(),
        reason: blockReason,
        notes: blockNotes,
      });
      onSuccess(`Availability block created for ${blockModalVehicle.make} ${blockModalVehicle.model}.`);
      setBlockModalVehicle(null);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to create availability block');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Release vehicle from maintenance back to AVAILABLE
  const handleReleaseFromMaintenance = async (veh: RentalFleetItem, customNotes?: string) => {
    setActionBusy(true);
    try {
      await api.releaseRentalMaintenance(user, veh.id, customNotes);
      onSuccess(`${veh.make} ${veh.model} (${veh.registrationNumber}) has been released from maintenance to AVAILABLE!`);
      if (historyModalVehicle?.id === veh.id) {
        setHistoryModalVehicle(null);
      }
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to release vehicle from maintenance');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Release specific block early
  const handleReleaseSpecificBlock = async (veh: RentalFleetItem, blockId: string) => {
    setActionBusy(true);
    try {
      await api.releaseRentalBlock(user, veh.id, blockId);
      onSuccess(`Maintenance block ended early and vehicle updated.`);
      setHistoryModalVehicle(prev => {
        if (!prev || prev.id !== veh.id) return prev;
        return {
          ...prev,
          blocks: prev.blocks?.map(b => b.id === blockId ? { ...b, endTime: new Date().toISOString() } : b),
          status: 'AVAILABLE',
          activeBlock: null,
        };
      });
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to release maintenance block');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Delete block
  const handleDeleteSpecificBlock = async (veh: RentalFleetItem, blockId: string) => {
    if (!confirm('Are you sure you want to permanently delete this block record?')) return;
    setActionBusy(true);
    try {
      await api.deleteRentalBlock(user, veh.id, blockId);
      onSuccess(`Maintenance block record deleted.`);
      setHistoryModalVehicle(prev => {
        if (!prev || prev.id !== veh.id) return prev;
        return {
          ...prev,
          blocks: prev.blocks?.filter(b => b.id !== blockId),
        };
      });
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to delete block');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Driver KYC Review
  const handleKycReview = async (decision: 'VERIFIED' | 'REJECTED', reasonOverride?: string) => {
    if (!activeBooking) return;
    const effectiveReason = (reasonOverride !== undefined ? reasonOverride : kycRejectionReason).trim();
    if (decision === 'REJECTED' && !effectiveReason) {
      onError('Please provide a specific rejection reason for the customer.');
      return;
    }
    if (decision === 'VERIFIED') {
      const ver = activeBooking.driverVerification;
      if (!ver || !ver.licenseFrontUrl || !ver.licenseBackUrl) {
        onError('Physical driving license documents (front & back) are mandatory before KYC approval.');
        return;
      }
    }
    setActionBusy(true);
    try {
      await api.reviewRentalKyc(user, activeBooking.id, {
        decision: decision === 'VERIFIED' ? 'APPROVE' : 'REJECT',
        status: decision,
        rejectionReason: decision === 'REJECTED' ? effectiveReason : undefined,
      });
      onSuccess(`Driver KYC ${decision} for booking ${activeBooking.bookingNumber}.`);
      setActiveBooking(null);
      setKycRejectionReason('');
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to update driver KYC review');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Hub KYC Upload / Document Update
  const handleHubKycUploadSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeBooking) return;
    const hasFront = !!hubKycFrontLocal || !!hubKycFrontUrl.trim();
    const hasBack = !!hubKycBackLocal || !!hubKycBackUrl.trim();
    if (!hasFront || !hasBack) {
      onError('Both front and back photos of the physical license are required.');
      return;
    }
    setActionBusy(true);
    try {
      let finalFront = hubKycFrontUrl.trim();
      let finalBack = hubKycBackUrl.trim();
      if (hubKycFrontLocal) {
        finalFront = await uploadFileToCloudinary(hubKycFrontLocal.file, `vmotiv/rental-kyc/${activeBooking.id}`);
      }
      if (hubKycBackLocal) {
        finalBack = await uploadFileToCloudinary(hubKycBackLocal.file, `vmotiv/rental-kyc/${activeBooking.id}`);
      }

      await api.updateRentalKycDocuments(user, activeBooking.id, {
        licenseNumber: hubKycLicenseNumber.trim().toUpperCase(),
        licenseExpiry: new Date(hubKycExpiry).toISOString(),
        dateOfBirth: new Date('1990-01-01').toISOString(),
        drivingExperienceYears: 5,
        licenseFrontUrl: finalFront,
        licenseBackUrl: finalBack,
      });
      onSuccess(`Driving license documents attached for booking ${activeBooking.bookingNumber}.`);
      setHubKycFrontLocal(null);
      setHubKycBackLocal(null);
      setEditKycDocuments(false);
      const updated = await api.rentalBookingDetails(user, activeBooking.id);
      setActiveBooking(updated);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to attach driving license documents');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Delete Fleet Vehicle
  const handleDeleteVehicle = async (veh: RentalFleetItem) => {
    if (!confirm(`Are you sure you want to permanently delete or retire ${veh.make} ${veh.model} (${veh.registrationNumber}) from the rental fleet?`)) return;
    setActionBusy(true);
    try {
      const res = await api.deleteRentalVehicle(user, veh.id);
      onSuccess(res.archived ? `${veh.make} ${veh.model} was safely retired.` : `${veh.make} ${veh.model} has been deleted.`);
      if (historyModalVehicle?.id === veh.id) setHistoryModalVehicle(null);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to delete vehicle');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Walk-In / Offline Hub Rental Booking Submit
  const handleWalkInSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!walkInVehicleId) {
      onError('Please select an available fleet vehicle.');
      return;
    }
    const hasFront = !!walkInFrontLocal || !!walkInLicenseFrontUrl.trim();
    const hasBack = !!walkInBackLocal || !!walkInLicenseBackUrl.trim();
    if (!hasFront || !hasBack) {
      onError('Driving license front and back documents are mandatory.');
      return;
    }
    setActionBusy(true);
    try {
      let finalFront = walkInLicenseFrontUrl.trim();
      let finalBack = walkInLicenseBackUrl.trim();
      if (walkInFrontLocal) {
        finalFront = await uploadFileToCloudinary(walkInFrontLocal.file, 'vmotiv/rental-kyc');
      }
      if (walkInBackLocal) {
        finalBack = await uploadFileToCloudinary(walkInBackLocal.file, 'vmotiv/rental-kyc');
      }

      const startDateTime = new Date(`${walkInStartDate}T${walkInStartTime}:00`);
      const endDateTime = new Date(startDateTime.getTime() + walkInDays * 24 * 3600 * 1000);

      const booking = await api.createWalkInRentalBooking(user, {
        vehicleId: walkInVehicleId,
        customerName: walkInCustomerName.trim(),
        customerPhone: walkInCustomerPhone.trim(),
        customerEmail: walkInCustomerEmail.trim() || undefined,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        licenseNumber: walkInLicenseNumber.toUpperCase().trim() || 'DL-WALKIN',
        licenseExpiry: walkInLicenseExpiry ? new Date(walkInLicenseExpiry).toISOString() : new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        drivingExperienceYears: Number(walkInExperienceYears) || 3,
        licenseFrontUrl: finalFront || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80',
        licenseBackUrl: finalBack || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80',
        paymentMethod: walkInPaymentMethod,
        transactionReference: walkInPaymentTxRef.trim() || `COUNTER-${Date.now()}`,
        startOdometerKm: Number(walkInStartOdo) || undefined,
        fuelPercent: Number(walkInFuelPercent) || 100,
        notes: walkInNotes,
        immediateHandover: walkInImmediateHandover,
      });

      onSuccess(`On-Road Rental Booking #${booking.bookingNumber} created successfully! ${walkInImmediateHandover ? 'Vehicle is now ON TRIP.' : 'Ready for pickup.'}`);
      setWalkInModalOpen(false);
      // Reset form
      setWalkInCustomerName('');
      setWalkInCustomerPhone('');
      setWalkInCustomerEmail('');
      setWalkInLicenseNumber('');
      setWalkInLicenseFrontUrl('');
      setWalkInLicenseBackUrl('');
      setWalkInFrontLocal(null);
      setWalkInBackLocal(null);
      setWalkInPaymentTxRef('');
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to create walk-in booking');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Handover
  const handleHandoverSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeBooking) return;
    setActionBusy(true);
    try {
      const uploadedHandoverUrls: string[] = [];
      for (const item of handoverLocalFiles) {
        const url = await uploadFileToCloudinary(item.file, `vmotiv/rental-dispatch/${activeBooking.id}`);
        uploadedHandoverUrls.push(url);
      }
      const allPhotos = [...handoverPhotos, ...uploadedHandoverUrls];
      const fallbackPhoto = activeBooking.vehicle?.images?.[0] || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80';
      const photosToSend = allPhotos.length > 0 ? allPhotos : [fallbackPhoto];

      await api.recordRentalHandover(user, activeBooking.id, {
        odometerKm: Number(handoverOdometer),
        fuelPercent: Number(handoverFuel),
        keyReleased: handoverKeyReleased,
        customerSigned: true,
        conditionNotes: handoverNotes,
        notes: handoverNotes,
        photos: photosToSend,
      });
      onSuccess(`Vehicle handover complete for booking ${activeBooking.bookingNumber}. Trip is now ACTIVE.`);
      setHandoverLocalFiles([]);
      setHandoverPhotos([]);
      setEditHandover(false);
      const updated = await api.rentalBookingDetails(user, activeBooking.id).catch(() => null);
      if (updated) {
        setActiveBooking(updated);
      } else {
        setActiveBooking(null);
      }
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to record vehicle handover');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Return
  const handleReturnSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeBooking) return;
    setActionBusy(true);
    try {
      const uploadedReturnUrls: string[] = [];
      for (const item of returnLocalFiles) {
        const url = await uploadFileToCloudinary(item.file, `vmotiv/rental-return/${activeBooking.id}`);
        uploadedReturnUrls.push(url);
      }
      const allPhotos = [...returnPhotos, ...uploadedReturnUrls];
      const fallbackPhoto = activeBooking.vehicle?.images?.[0] || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80';
      const photosToSend = allPhotos.length > 0 ? allPhotos : [fallbackPhoto];

      await api.recordRentalReturn(user, activeBooking.id, {
        returnOdometerKm: Number(returnOdometer),
        odometerKm: Number(returnOdometer),
        returnFuelPercent: Number(returnFuel),
        fuelPercent: Number(returnFuel),
        customerSigned: true,
        keyReceived: returnKeyReceived,
        notes: returnNotes,
        conditionNotes: returnNotes,
        photos: photosToSend,
        excessKm: Number(returnExcessKm),
        excessKmChargePaise: returnExcessKmChargeRupees * 100,
        damageChargePaise: returnDamageChargeRupees * 100,
      });
      onSuccess(`Return inspection recorded for booking ${activeBooking.bookingNumber}. Settlement submitted.`);
      setReturnLocalFiles([]);
      setReturnPhotos([]);
      setEditReturnSettlement(false);
      const updated = await api.rentalBookingDetails(user, activeBooking.id).catch(() => null);
      if (updated) {
        setActiveBooking(updated);
      } else {
        setActiveBooking(null);
      }
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to record return inspection');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReleaseBlock = async (veh: RentalFleetItem, blockId: string) => {
    setActionBusy(true);
    try {
      await api.releaseRentalBlock(user, veh.id, blockId);
      onSuccess(`Block released — ${veh.make} ${veh.model} restored to AVAILABLE.`);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to release block');
    } finally {
      setActionBusy(false);
    }
  };

  const handleTogglePublish = async (veh: RentalFleetItem) => {
    setActionBusy(true);
    try {
      const newEligible = veh.isEligibleForRental === false ? true : false;
      await api.updateRentalFleetVehicle(user, veh.id, { isEligibleForRental: newEligible });
      onSuccess(
        newEligible
          ? `${veh.make} ${veh.model} (${veh.registrationNumber}) is now published and bookable by customers!`
          : `${veh.make} ${veh.model} has been delisted from customer rental searches.`
      );
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to update vehicle publishing status');
    } finally {
      setActionBusy(false);
    }
  };

  // Filtered lists
  const filteredFleet = fleet.filter(f => {
    if (availRange && availOnlyBookable && f.availability && !f.availability.bookable) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.make.toLowerCase().includes(q) ||
      f.model.toLowerCase().includes(q) ||
      f.registrationNumber.toLowerCase().includes(q) ||
      f.fleetNumber.toLowerCase().includes(q)
    );
  });

  const filteredBookings = bookings.filter(b => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.bookingNumber.toLowerCase().includes(q) ||
      b.customer?.displayName?.toLowerCase().includes(q) ||
      b.customer?.phone?.toLowerCase().includes(q) ||
      b.vehicle?.model.toLowerCase().includes(q)
    );
  });

  return (
    <div className="tab-pane active">
      {/* Top Header */}
      <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconRentals /> Car Rental Fleet & Operations
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: '4px' }}>
            Self-drive rental fleet management, driver KYC approval, strict handover inspection, and return settlement.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary button secondary" onClick={() => void loadData()} disabled={loading}>
            <IconRefresh /> Refresh
          </button>
          <button
            type="button"
            className="button secondary"
            style={{ background: '#059669', color: '#ffffff', borderColor: '#059669', fontWeight: 700 }}
            onClick={() => {
              const avail = fleet.find(v => v.status === 'AVAILABLE');
              if (avail) setWalkInVehicleId(avail.id);
              setWalkInModalOpen(true);
            }}
          >
            ⚡ + Book Offline Rental Car
          </button>
          <button type="button" className="btn-primary btn-gold button primary" onClick={() => setOnboardModalOpen(true)}>
            + Onboard Fleet Car
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Active Fleet Units</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--text)' }}>{summary?.activeFleet ?? fleet.length}</div>
        </div>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Active Trips</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--accent)' }}>
            {bookings.filter(b => b.status === 'TRIP_ACTIVE' || b.status === 'VEHICLE_COLLECTED').length}
          </div>
        </div>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Driver KYC Pending</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--warning, #f59e0b)' }}>
            {bookings.filter(b => b.kycStatus === 'PENDING_REVIEW').length}
          </div>
        </div>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Upcoming Bookings</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--success, #10b981)' }}>
            {bookings.filter(b => b.status === 'CONFIRMED').length}
          </div>
        </div>
      </div>

      {/* Sub-Tab Navigation */}
      <div className="sub-tab-group">
        <button
          type="button"
          className={`sub-tab-btn ${subTab === 'fleet' ? 'active' : ''}`}
          onClick={() => setSubTab('fleet')}
        >
          <span>🚗 Rental Fleet Inventory</span>
          <span className="sub-tab-count">{fleet.length}</span>
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${subTab === 'bookings' ? 'active' : ''}`}
          onClick={() => setSubTab('bookings')}
        >
          <span>📋 Rental Bookings & Trips</span>
          <span className="sub-tab-count">{bookings.length}</span>
        </button>
      </div>

      {/* Search and Hub Selector */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
          <input
            type="text"
            className="input"
            placeholder={subTab === 'fleet' ? "Filter fleet by make, model, plate #..." : "Filter bookings by booking #, customer, car..."}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', paddingLeft: '2.2rem' }}
          />
          <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
            <IconSearch />
          </span>
        </div>

        <select
          className="select"
          value={selectedHubId}
          onChange={e => setSelectedHubId(e.target.value)}
          style={{ minWidth: '200px' }}
        >
          <option value="">All Operating Hubs</option>
          {(hubs.length > 0 ? hubs : branches).map(b => (
            <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
          ))}
        </select>
      </div>

      {/* Availability for a date range (fleet tab) */}
      {subTab === 'fleet' && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.25rem', padding: '0.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)' }}>
            Check availability from
            <input type="datetime-local" className="input" value={availFrom} onChange={e => setAvailFrom(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)' }}>
            to
            <input type="datetime-local" className="input" value={availTo} min={availFrom || undefined} onChange={e => setAvailTo(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!availFrom || !availTo || new Date(availTo) <= new Date(availFrom)}
            onClick={() => setAvailRange({ from: availFrom, to: availTo })}
          >
            Check dates
          </button>
          {availRange && (
            <>
              <button type="button" className="btn" onClick={() => { setAvailRange(null); setAvailFrom(''); setAvailTo(''); }}>Clear</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem' }}>
                <input type="checkbox" checked={availOnlyBookable} onChange={e => setAvailOnlyBookable(e.target.checked)} />
                Only show bookable
              </label>
              <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
                {fleet.filter(f => f.availability?.bookable).length} of {fleet.length} cars bookable for the selected dates
              </span>
            </>
          )}
        </div>
      )}

      {/* VIEW A: FLEET INVENTORY */}
      {subTab === 'fleet' && (
        <div className="table-responsive" style={{ background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <table>
            <thead>
              <tr>
                <th>Fleet # & Plate</th>
                <th>Vehicle Model</th>
                <th>Hub</th>
                <th>Specs</th>
                <th>Daily Rate</th>
                <th>Deposit</th>
                <th>Status</th>
                <th>Market Visibility</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>Loading rental fleet…</td>
                </tr>
              ) : filteredFleet.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                    No rental fleet vehicles found. Click "+ Onboard Fleet Car" to enroll vehicles into the self-drive fleet.
                  </td>
                </tr>
              ) : (
                filteredFleet.map(veh => {
                  const isPublished = veh.isEligibleForRental !== false && veh.status === 'AVAILABLE';
                  const includedKm = veh.includedKmPerDay ?? veh.includedDailyKm ?? 0;
                  return (
                    <tr key={veh.id}>
                      <td>
                        <strong>{veh.fleetNumber}</strong>
                        <div><span className="code-pill">{veh.registrationNumber}</span></div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {veh.images && veh.images.length > 0 ? (
                            <img
                              src={veh.images[0]}
                              alt={`${veh.make} ${veh.model}`}
                              style={{
                                width: '52px',
                                height: '38px',
                                objectFit: 'cover',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                flexShrink: 0,
                              }}
                              onError={e => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '52px',
                                height: '38px',
                                borderRadius: '4px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1rem',
                                flexShrink: 0,
                              }}
                            >
                              🚗
                            </div>
                          )}
                          <div>
                            <div><strong>{veh.make} {veh.model}</strong> {veh.variant || ''}</div>
                            <small style={{ color: 'var(--muted)' }}>
                              Year {veh.year} · {veh.color} {veh.images && veh.images.length > 1 ? `· 📷 ${veh.images.length} photos` : ''}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div><strong>{veh.hub?.name || 'Local Hub'}</strong></div>
                        <small style={{ color: 'var(--muted)' }}>{veh.hub?.city || 'Bengaluru'}</small>
                      </td>
                      <td>
                        <div>{veh.transmission} · {veh.fuelType}</div>
                        <small style={{ color: 'var(--muted)' }}>{veh.seats} Seats · {includedKm} km/day · ₹{Math.round(Number(veh.extraKmRatePaise || 0) / 100)}/extra km</small>
                        {veh.kmPolicySource?.includedKm === 'HUB' || veh.kmPolicySource?.extraKmRate === 'HUB' ? (
                          <small style={{ display: 'block', color: '#34d399', fontSize: '0.65rem' }} title="Set by an administrator for this hub in the Admin portal">Hub policy</small>
                        ) : null}
                      </td>
                      <td className="money" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                        {formatRupees(veh.baseDailyRatePaise)}/day
                      </td>
                      <td className="money">
                        {formatRupees(veh.securityDepositPaise)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                          <span
                            className={`badge ${
                              veh.status === 'AVAILABLE' ? 'badge-success' :
                              veh.status === 'RENTED' || veh.status === 'ON_TRIP' || veh.status === 'RESERVED' ? 'badge-info' :
                              veh.status === 'MAINTENANCE' ? 'badge-warning' :
                              veh.status === 'CLEANING' ? 'badge-warning' : 'badge-danger'
                            }`}
                            style={{
                              cursor: (veh.status === 'MAINTENANCE' || veh.status === 'CLEANING' || (veh.blocks && veh.blocks.length > 0)) ? 'pointer' : 'default',
                            }}
                            onClick={() => {
                              if (veh.status === 'MAINTENANCE' || veh.status === 'CLEANING' || (veh.blocks && veh.blocks.length > 0)) {
                                setHistoryModalVehicle(veh);
                              }
                            }}
                            title="Click to view maintenance history & buffer records"
                          >
                            {veh.status === 'AVAILABLE' ? '● AVAILABLE' :
                             veh.status === 'MAINTENANCE' ? '● MAINTENANCE' :
                             veh.status === 'CLEANING' ? '● CLEANING' :
                             veh.status === 'ON_TRIP' || veh.status === 'RENTED' ? '● ON TRIP' :
                             veh.status === 'RESERVED' ? '● RESERVED' : veh.status}
                          </span>
                          {veh.availability && !veh.availability.bookable && (
                            <div style={{ marginTop: '4px' }}>
                              <span
                                className={`badge ${
                                  veh.availability.state === 'BOOKED' ? 'badge-danger' :
                                  veh.availability.state === 'IN_TRIP' ? 'badge-info' :
                                  veh.availability.state === 'UNAVAILABLE' ? 'badge-neutral' : 'badge-warning'
                                }`}
                              >
                                {veh.availability.state === 'ON_HOLD' ? '⏳ ON HOLD' :
                                 veh.availability.state === 'BOOKED' ? '📅 BOOKED' :
                                 veh.availability.state === 'IN_TRIP' ? '🚗 IN TRIP' :
                                 veh.availability.state === 'MAINTENANCE' ? '🛠 MAINTENANCE' :
                                 veh.availability.state === 'CLEANING' ? '🧽 CLEANING' : 'UNAVAILABLE'} for these dates
                              </span>
                              {veh.availability.availableFrom && (
                                <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>
                                  Free from {formatDate(veh.availability.availableFrom)}
                                </div>
                              )}
                              {veh.availability.state === 'ON_HOLD' && veh.availability.holdExpiresAt && (
                                <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>
                                  Hold lapses {formatDate(veh.availability.holdExpiresAt)} if unpaid
                                </div>
                              )}
                            </div>
                          )}
                          {veh.availability && veh.availability.bookable && (
                            <span className="badge badge-success" style={{ marginTop: 4 }}>✓ Free for these dates</span>
                          )}
                          {veh.activeBlock && (
                            <div style={{ marginTop: '2px' }}>
                              <span style={{ fontSize: '0.6875rem', color: '#fbbf24', fontWeight: 700 }}>
                                {veh.activeBlock.reason.replace(/_/g, ' ')}
                              </span>
                              <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>
                                Until {formatDate(veh.activeBlock.endTime)}
                              </div>
                            </div>
                          )}
                          {veh.blocks && veh.blocks.length > 0 && !veh.activeBlock && (
                            <button
                              type="button"
                              onClick={() => setHistoryModalVehicle(veh)}
                              style={{ fontSize: '0.6875rem', color: 'var(--muted)', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                            >
                              {veh.blocks.length} service record{veh.blocks.length > 1 ? 's' : ''}
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        {isPublished ? (
                          <div>
                            <span className="badge badge-success" style={{ gap: 4 }}>
                              <span>✓</span> Published
                            </span>
                            <small style={{ display: 'block', fontSize: '0.6875rem', color: '#34d399', marginTop: 2 }}>
                              Live on App & Web
                            </small>
                          </div>
                        ) : (
                          <div>
                            <span className="badge badge-neutral" style={{ gap: 4 }}>
                              <span>⏸</span> Off-market
                            </span>
                            <small style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--muted)', marginTop: 2 }}>
                              {veh.status !== 'AVAILABLE' ? veh.status : 'Delisted'}
                            </small>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                          {/* Direct Release to Available action if in Maintenance / Cleaning */}
                          {(veh.status === 'MAINTENANCE' || veh.status === 'CLEANING' || veh.activeBlock) && (
                            <button
                              type="button"
                              className="btn-sm btn-primary button primary small"
                              style={{ background: '#10b981', color: '#061a38', borderColor: '#10b981', fontWeight: 700 }}
                              disabled={actionBusy}
                              onClick={() => void handleReleaseFromMaintenance(veh)}
                              title="End maintenance and restore vehicle to AVAILABLE immediately"
                            >
                              ✓ Release to Available
                            </button>
                          )}

                          <button
                            type="button"
                            className={`btn-sm button small ${isPublished ? 'btn-secondary secondary' : 'btn-gold btn-primary primary'}`}
                            disabled={actionBusy}
                            onClick={() => void handleTogglePublish(veh)}
                            title={isPublished ? 'Delist from customer searches' : 'Publish to customer searches'}
                          >
                            {isPublished ? 'Delist' : 'Publish'}
                          </button>

                          <button
                            type="button"
                            className="btn-secondary btn-sm button secondary small"
                            onClick={() => setHistoryModalVehicle(veh)}
                            title="View start/end dates, reason, notes, and maintenance history"
                          >
                            🛠 History ({veh.blocks?.length || 0})
                          </button>

                          <button
                            type="button"
                            className="btn-secondary btn-sm button secondary small"
                            onClick={() => {
                              setBlockModalVehicle(veh);
                              setBlockStart(new Date().toISOString().slice(0, 16));
                              setBlockEnd(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
                            }}
                            title="Schedule maintenance or turnaround buffer"
                          >
                            + Buffer
                          </button>

                          <button
                            type="button"
                            className="btn-danger btn-sm button danger small"
                            disabled={actionBusy}
                            onClick={() => void handleDeleteVehicle(veh)}
                            title="Delete or retire car from rental fleet"
                          >
                            🗑 Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW B: BOOKINGS & TRIPS */}
      {subTab === 'bookings' && (
        <div>
          {/* Operations Payment Summary Widgets */}
          <div
            className="grid-summary"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <div className="card-kpi" style={{ background: 'var(--surface)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Partially Paid</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '2px', color: '#f59e0b' }}>
                {paymentDashboard?.partiallyPaidCount ?? bookings.filter(b => b.rentalPaymentStatus === 'PARTIALLY_PAID').length}
              </div>
            </div>
            <div className="card-kpi" style={{ background: 'var(--surface)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Paid In Full</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '2px', color: '#10b981' }}>
                {paymentDashboard?.fullyPaidCount ?? bookings.filter(b => b.rentalPaymentStatus === 'PAID_IN_FULL').length}
              </div>
            </div>
            <div className="card-kpi" style={{ background: 'var(--surface)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Overdue Payments</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '2px', color: '#ef4444' }}>
                {paymentDashboard?.overdueCount ?? bookings.filter(b => b.rentalPaymentStatus === 'OVERDUE' || (b.balanceDueAt && new Date(b.balanceDueAt).getTime() < Date.now() && Number(b.outstandingBalancePaise || 0) > 0)).length}
              </div>
            </div>
            <div className="card-kpi" style={{ background: 'var(--surface)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Pickups Blocked</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '2px', color: '#ef4444' }}>
                {paymentDashboard?.blockedPickupsCount ?? bookings.filter(b => b.status === 'CONFIRMED' && (Number(b.outstandingBalancePaise || 0) > 0 || b.kycStatus !== 'VERIFIED')).length}
              </div>
            </div>
            <div className="card-kpi" style={{ background: 'var(--surface)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Pending Reconciliation</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '2px', color: 'var(--accent, #3b82f6)' }}>
                {paymentDashboard?.reconciliationPendingCount ?? bookings.filter(b => (b.status === 'RETURN_INSPECTED' || b.status === 'SETTLED') && b.depositStatus === 'REFUND_QUEUED').length}
              </div>
            </div>
          </div>

          {/* Status filter buttons */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {['ALL', 'PARTIALLY_PAID', 'PAID_IN_FULL', 'OVERDUE', 'CONFIRMED', 'TRIP_ACTIVE', 'RETURN_INSPECTED', 'SETTLED', 'CANCELLED'].map(st => (
              <button
                key={st}
                type="button"
                className={`button small ${bookingStatusFilter === st ? 'primary' : 'secondary'}`}
                style={{ fontSize: '0.75rem' }}
                onClick={() => setBookingStatusFilter(st)}
              >
                {st.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          <div className="table-responsive" style={{ background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table>
              <thead>
                <tr>
                  <th>Booking # & Date</th>
                  <th>Customer</th>
                  <th>Car Booked</th>
                  <th>Trip Dates</th>
                  <th>Payment Plan</th>
                  <th>Rental Total & Paid</th>
                  <th>Balance Due</th>
                  <th>Payment Status</th>
                  <th>Pickup Gate</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>Loading bookings…</td>
                  </tr>
                ) : filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                      No rental bookings matching current filters.
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map(b => {
                    const outstanding = Number(b.outstandingBalancePaise || 0);
                    const verifiedPaid = Number(b.verifiedPaidPaise || 0);
                    const isOverdue = !!b.balanceDueAt && new Date(b.balanceDueAt).getTime() < Date.now() && outstanding > 0;
                    const isPickupReady = b.pickupReadiness
                      ? ((b.pickupReadiness as any).isReady ?? (b.pickupReadiness as any).eligible ?? false)
                      : (
                        (b.status === 'CONFIRMED' || b.status === 'TRIP_ACTIVE' || b.status === 'RETURN_INSPECTED' || b.status === 'SETTLED') &&
                        outstanding === 0 &&
                        b.kycStatus === 'VERIFIED'
                      );
                    const reasons: string[] = b.pickupReadiness?.reasons || (b.pickupReadiness as any)?.blockers || [];

                    return (
                      <tr key={b.id}>
                        <td>
                          <strong>{b.bookingNumber}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{formatDate(b.startTime)}</div>
                        </td>
                        <td>
                          <div><strong>{b.customer?.displayName || 'Customer'}</strong></div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{b.customer?.phone || b.customer?.email || '—'}</div>
                        </td>
                        <td>
                          <div><strong>{b.vehicle?.make} {b.vehicle?.model}</strong></div>
                          <span className="code-pill" style={{ fontSize: '0.75rem' }}>{b.vehicle?.registrationNumber || 'Fleet Vehicle'}</span>
                        </td>
                        <td>
                          <div>{formatDate(b.startTime)}</div>
                          <small style={{ color: 'var(--muted)' }}>to {formatDate(b.endTime)}</small>
                        </td>
                        <td>
                          <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                            {b.paymentPlanSnapshot?.planName || (b.paymentPlanSnapshot?.advancePercentage ? `${b.paymentPlanSnapshot.advancePercentage}% Advance` : 'Standard')}
                          </span>
                        </td>
                        <td className="money">
                          <div><strong>{formatRupees(b.totalPayablePaise)}</strong></div>
                          <div style={{ fontSize: '0.72rem', color: '#10b981' }}>Paid: {formatRupees(verifiedPaid)}</div>
                          <div style={{ fontSize: '0.72rem', color: outstanding > 0 ? '#ef4444' : 'var(--muted)' }}>
                            Bal: {formatRupees(outstanding)}
                          </div>
                        </td>
                        <td>
                          {b.balanceDueAt ? (
                            <div>
                              <div style={{ fontSize: '0.75rem' }}>{formatDate(b.balanceDueAt)}</div>
                              {isOverdue && (
                                <span className="badge badge-danger" style={{ fontSize: '0.65rem', marginTop: '2px' }}>
                                  OVERDUE
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {(() => {
                            if (b.rentalPaymentStatus === 'PAID_IN_FULL' || (outstanding === 0 && verifiedPaid > 0)) {
                              return <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>PAID IN FULL</span>;
                            }
                            if (isOverdue || b.rentalPaymentStatus === 'OVERDUE') {
                              return <span className="badge badge-danger" style={{ fontSize: '0.72rem' }}>OVERDUE</span>;
                            }
                            if (b.rentalPaymentStatus === 'PARTIALLY_PAID' || verifiedPaid > 0) {
                              return <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>PARTIALLY PAID</span>;
                            }
                            return <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>NOT PAID</span>;
                          })()}
                        </td>
                        <td>
                          <span
                            className={`badge ${isPickupReady ? 'badge-success' : 'badge-danger'}`}
                            style={{ fontSize: '0.72rem' }}
                            title={reasons.join('; ')}
                          >
                            {isPickupReady ? '✓ READY' : '⊘ BLOCKED'}
                          </span>
                          {!isPickupReady && reasons.length > 0 && (
                            <div style={{ fontSize: '0.68rem', color: '#ef4444', marginTop: '2px', maxWidth: '120px', whiteSpace: 'normal' }}>
                              {reasons[0]}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                            <button
                              type="button"
                              className="button primary small"
                              onClick={() => {
                                setActiveBooking(b);
                                setBookingDrawerTab('overview');
                              }}
                            >
                              Manage Trip
                            </button>
                            {(b.status === 'CONFIRMED' || b.status === 'PENDING_PAYMENT') && (
                              <button
                                type="button"
                                className="button danger small"
                                style={{ fontSize: '0.72rem', padding: '0.3rem 0.5rem' }}
                                onClick={() => {
                                  setActiveBooking(b);
                                  openCancelModal(b.kycStatus === 'REJECTED' ? 'KYC_CORRECTION_TIMEOUT' : 'CUSTOMER_REQUESTED');
                                }}
                                title="Cancel booking before dispatch"
                              >
                                🚫 Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: WALK-IN / ON-ROAD RENTAL BOOKING AT OFFLINE HUB */}
      {walkInModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="modal-dialog"
            style={{
              maxWidth: '860px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--surface, #0f172a)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
              overflow: 'hidden',
            }}
          >
            {/* MODAL HEADER */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(15, 23, 42, 0.95)',
              }}
            >
              <div>
                <span className="eyebrow" style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  ⚡ OFFLINE HUB WALK-IN RENTAL
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text, #f8fafc)' }}>
                  Create On-Road Rental Booking
                </h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setWalkInModalOpen(false)}
                title="Close"
                style={{ width: '32px', height: '32px', borderRadius: '6px' }}
              >
                <IconCross />
              </button>
            </div>

            {/* FORM BODY WITH SCROLL */}
            <form onSubmit={handleWalkInSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div
                className="modal-body custom-scrollbar"
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.5rem',
                }}
              >
                {/* 1. SELECT FLEET VEHICLE */}
                <div style={{ background: 'var(--surface-secondary)', padding: '1rem', borderRadius: '8px' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', display: 'block', marginBottom: '0.5rem' }}>
                    1. Select Available Fleet Vehicle *
                  </label>
                  <select
                    className="select"
                    required
                    value={walkInVehicleId}
                    onChange={e => {
                      setWalkInVehicleId(e.target.value);
                      const veh = fleet.find(v => v.id === e.target.value);
                      if (veh) setWalkInStartOdo(veh.odometerKm || 0);
                    }}
                    style={{ width: '100%', fontSize: '0.95rem', fontWeight: 600 }}
                  >
                    <option value="">-- Choose an Available Fleet Car --</option>
                    {fleet
                      .filter(v => v.status === 'AVAILABLE')
                      .map(v => {
                        const av = walkInAvailability[v.id];
                        const blocked = Boolean(av && !av.bookable);
                        return (
                          <option key={v.id} value={v.id} disabled={blocked}>
                            {v.make} {v.model} ({v.registrationNumber}) — {formatRupees(v.baseDailyRatePaise)}/day [{v.hub?.city || 'Local Hub'}]
                            {blocked ? ` — ${av!.state.replace('_', ' ')} for these dates` : ''}
                          </option>
                        );
                      })}
                  </select>
                  {(() => {
                    const av = walkInAvailability[walkInVehicleId];
                    if (!walkInVehicleId || !av || av.bookable) return null;
                    return (
                      <div role="alert" style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#fbbf24', fontWeight: 600 }}>
                        {av.label}.{av.availableFrom ? ` Free from ${formatDate(av.availableFrom)}.` : ''} Pick another car or change the dates.
                      </div>
                    );
                  })()}
                </div>

                {/* 2. CUSTOMER IDENTITY */}
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                    2. Customer Identity (Counter Walk-In)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Full Name *</label>
                      <input type="text" className="input" required value={walkInCustomerName} onChange={e => setWalkInCustomerName(e.target.value)} placeholder="e.g. Rahul Sharma" style={{ width: '100%', marginTop: '3px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Mobile Phone *</label>
                      <input type="tel" className="input" required value={walkInCustomerPhone} onChange={e => setWalkInCustomerPhone(e.target.value)} placeholder="+91 9876543210" style={{ width: '100%', marginTop: '3px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Email Address *</label>
                      <input type="email" className="input" required value={walkInCustomerEmail} onChange={e => setWalkInCustomerEmail(e.target.value)} placeholder="customer@example.com" style={{ width: '100%', marginTop: '3px' }} />
                    </div>
                  </div>
                </div>

                {/* 3. MANDATORY DRIVER LICENSE & PHOTO UPLOAD */}
                <div style={{ border: '1px solid rgba(245, 158, 11, 0.3)', padding: '1rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>
                      3. Driver License KYC & Mandatory Documents *
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700 }}>
                      Legally Required for On-Road Insurance
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Driving License Number *</label>
                      <input type="text" className="input" required value={walkInLicenseNumber} onChange={e => setWalkInLicenseNumber(e.target.value)} placeholder="e.g. KA0120220045892" style={{ width: '100%', marginTop: '3px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>License Expiry Date *</label>
                      <input type="date" className="input" required value={walkInLicenseExpiry} onChange={e => setWalkInLicenseExpiry(e.target.value)} style={{ width: '100%', marginTop: '3px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Driving Experience (Years) *</label>
                      <input type="number" className="input" min={1} max={50} required value={walkInExperienceYears} onChange={e => setWalkInExperienceYears(Number(e.target.value))} style={{ width: '100%', marginTop: '3px' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: (walkInFrontLocal || walkInLicenseFrontUrl) ? '#10b981' : 'var(--text)' }}>
                          License Front Photo * {(walkInFrontLocal || walkInLicenseFrontUrl) && '✓'}
                        </label>
                        <label
                          htmlFor="walkin-front-file"
                          className="button secondary small"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer' }}
                        >
                          📁 Choose Photo
                        </label>
                        <input
                          id="walkin-front-file"
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setWalkInFrontLocal({ file, previewUrl: URL.createObjectURL(file) });
                            if (e.target) e.target.value = '';
                          }}
                        />
                      </div>
                      {(walkInFrontLocal || walkInLicenseFrontUrl) ? (
                        <div style={{ position: 'relative', marginTop: '4px', border: '1px solid #10b981', borderRadius: '4px', padding: '4px', background: 'rgba(16, 185, 129, 0.05)' }}>
                          <img
                            src={walkInFrontLocal ? walkInFrontLocal.previewUrl : walkInLicenseFrontUrl}
                            alt="Front preview"
                            style={{ width: '100%', height: '70px', objectFit: 'cover', borderRadius: '3px', display: 'block' }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (walkInFrontLocal) URL.revokeObjectURL(walkInFrontLocal.previewUrl);
                              setWalkInFrontLocal(null);
                              setWalkInLicenseFrontUrl('');
                            }}
                            style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(239, 68, 68, 0.9)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '0.625rem', cursor: 'pointer' }}
                            title="Remove photo"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="input"
                          required
                          placeholder="Select photo above or paste URL"
                          value={walkInLicenseFrontUrl}
                          onChange={e => setWalkInLicenseFrontUrl(e.target.value)}
                          style={{ width: '100%', marginTop: '3px' }}
                        />
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: (walkInBackLocal || walkInLicenseBackUrl) ? '#10b981' : 'var(--text)' }}>
                          License Back Photo * {(walkInBackLocal || walkInLicenseBackUrl) && '✓'}
                        </label>
                        <label
                          htmlFor="walkin-back-file"
                          className="button secondary small"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer' }}
                        >
                          📁 Choose Photo
                        </label>
                        <input
                          id="walkin-back-file"
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setWalkInBackLocal({ file, previewUrl: URL.createObjectURL(file) });
                            if (e.target) e.target.value = '';
                          }}
                        />
                      </div>
                      {(walkInBackLocal || walkInLicenseBackUrl) ? (
                        <div style={{ position: 'relative', marginTop: '4px', border: '1px solid #10b981', borderRadius: '4px', padding: '4px', background: 'rgba(16, 185, 129, 0.05)' }}>
                          <img
                            src={walkInBackLocal ? walkInBackLocal.previewUrl : walkInLicenseBackUrl}
                            alt="Back preview"
                            style={{ width: '100%', height: '70px', objectFit: 'cover', borderRadius: '3px', display: 'block' }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (walkInBackLocal) URL.revokeObjectURL(walkInBackLocal.previewUrl);
                              setWalkInBackLocal(null);
                              setWalkInLicenseBackUrl('');
                            }}
                            style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(239, 68, 68, 0.9)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '0.625rem', cursor: 'pointer' }}
                            title="Remove photo"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="input"
                          required
                          placeholder="Select photo above or paste URL"
                          value={walkInLicenseBackUrl}
                          onChange={e => setWalkInLicenseBackUrl(e.target.value)}
                          style={{ width: '100%', marginTop: '3px' }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. RENTAL DURATION & SCHEDULE */}
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                    4. Rental Duration & Schedule
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Pickup Date *</label>
                      <input type="date" className="input" required value={walkInStartDate} onChange={e => setWalkInStartDate(e.target.value)} style={{ width: '100%', marginTop: '3px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Pickup Time *</label>
                      <input type="time" className="input" required value={walkInStartTime} onChange={e => setWalkInStartTime(e.target.value)} style={{ width: '100%', marginTop: '3px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Rental Duration (Days) *</label>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '3px' }}>
                        {[1, 2, 3, 5, 7, 10, 14].map(d => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setWalkInDays(d)}
                            style={{
                              padding: '0.35rem 0.6rem',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              borderRadius: '4px',
                              background: walkInDays === d ? 'var(--accent)' : 'var(--surface-secondary)',
                              color: walkInDays === d ? '#061a38' : 'var(--text)',
                              border: '1px solid var(--border)',
                              cursor: 'pointer',
                            }}
                          >
                            {d}d
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. PRICING & COUNTER PAYMENT */}
                <div style={{ background: 'var(--surface-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                    5. Price Calculation & Offline Payment
                  </div>
                  {(() => {
                    const selVeh = fleet.find(v => v.id === walkInVehicleId);
                    const daily = selVeh ? Number(BigInt(selVeh.baseDailyRatePaise) / 100n) : 0;
                    const dep = selVeh ? Number(BigInt(selVeh.securityDepositPaise) / 100n) : 0;
                    const base = daily * walkInDays;
                    const tax = Math.round(base * 0.18);
                    const total = base + tax + dep;
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1rem', background: 'var(--surface)', padding: '0.75rem', borderRadius: '6px' }}>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>DAILY RATE</div>
                          <div style={{ fontWeight: 700 }}>₹{daily.toLocaleString('en-IN')}/day</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>BASE ({walkInDays} DAYS)</div>
                          <div style={{ fontWeight: 700 }}>₹{base.toLocaleString('en-IN')}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>GST (18%)</div>
                          <div style={{ fontWeight: 700 }}>₹{tax.toLocaleString('en-IN')}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>SECURITY DEPOSIT</div>
                          <div style={{ fontWeight: 700 }}>₹{dep.toLocaleString('en-IN')}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>TOTAL PAYABLE</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>₹{total.toLocaleString('en-IN')}</div>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Payment Method at Counter *</label>
                      <select className="select" value={walkInPaymentMethod} onChange={e => setWalkInPaymentMethod(e.target.value)} style={{ width: '100%', marginTop: '3px' }}>
                        <option value="UPI">UPI / QR Code</option>
                        <option value="POS_CARD">POS Card Terminal</option>
                        <option value="CASH">Cash Counter</option>
                        <option value="NEFT">NEFT / Bank Transfer</option>
                        <option value="COUNTER">Counter Slip</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Transaction / Receipt Reference #</label>
                      <input type="text" className="input" placeholder="e.g. UPI-UTR-20261102 or POS Slip #" value={walkInPaymentTxRef} onChange={e => setWalkInPaymentTxRef(e.target.value)} style={{ width: '100%', marginTop: '3px' }} />
                    </div>
                  </div>
                </div>

                {/* 6. ON-ROAD IMMEDIATE HANDOVER */}
                <div style={{ border: '1px solid #10b981', padding: '1rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.05)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', color: '#10b981' }}>
                    <input
                      type="checkbox"
                      checked={walkInImmediateHandover}
                      onChange={e => setWalkInImmediateHandover(e.target.checked)}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span>🚗 Immediate On-Road Departure: Release keys and set Trip Active right now</span>
                  </label>
                  {walkInImmediateHandover && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(16, 185, 129, 0.2)' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Current Odometer (km)</label>
                        <input type="number" className="input" value={walkInStartOdo} onChange={e => setWalkInStartOdo(Number(e.target.value))} style={{ width: '100%', marginTop: '3px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Fuel Level (%)</label>
                        <input type="number" className="input" min={10} max={100} value={walkInFuelPercent} onChange={e => setWalkInFuelPercent(Number(e.target.value))} style={{ width: '100%', marginTop: '3px' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* FOOTER */}
              <div
                style={{
                  padding: '1rem 1.5rem',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  background: 'rgba(15, 23, 42, 0.95)',
                }}
              >
                <button type="button" className="btn-secondary button secondary" onClick={() => setWalkInModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="button primary" style={{ background: '#059669', color: '#fff', borderColor: '#059669', fontWeight: 700 }} disabled={actionBusy || Boolean(walkInAvailability[walkInVehicleId] && !walkInAvailability[walkInVehicleId]!.bookable)}>
                  {actionBusy ? 'Processing Booking…' : '⚡ Confirm On-Road Rental Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ONBOARD FLEET CAR (RESPONSIVE SCROLL VIEW & VEHICLE INFO / IMAGES / COMPLIANCE) */}
      {onboardModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="modal-dialog"
            style={{
              maxWidth: '880px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.12)',
              background: 'var(--surface, #0f172a)',
            }}
          >
            {/* FIXED STICKY HEADER */}
            <div
              className="modal-header"
              style={{
                flexShrink: 0,
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div>
                <span className="eyebrow" style={{ color: 'var(--accent, #f59e0b)', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  FLEET ENROLLMENT & SPECIFICATIONS
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text, #f8fafc)' }}>
                  Onboard New Self-Drive Rental Vehicle
                </h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setOnboardModalOpen(false)}
                title="Close"
                style={{ width: '32px', height: '32px', borderRadius: '6px' }}
              >
                <IconCross />
              </button>
            </div>

            {/* FORM CONTAINER WITH INTERNAL SCROLLING BODY */}
            <form onSubmit={handleOnboardSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div
                className="modal-body custom-scrollbar"
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.75rem',
                }}
              >
                {/* PRESET SHORTCUTS BAR */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.875rem 1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ⚡ Quick Fill Popular Model Presets
                    </span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--muted)' }}>
                      Click to auto-populate vehicle specifications & high-res photos
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {Object.keys(MODEL_PRESETS).map(presetKey => (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => applyCarPreset(presetKey)}
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          background: onboardModel.toLowerCase() === MODEL_PRESETS[presetKey]!.model.toLowerCase() ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                          color: onboardModel.toLowerCase() === MODEL_PRESETS[presetKey]!.model.toLowerCase() ? 'var(--accent, #f59e0b)' : 'var(--text, #e2e8f0)',
                          border: onboardModel.toLowerCase() === MODEL_PRESETS[presetKey]!.model.toLowerCase() ? '1px solid var(--accent, #f59e0b)' : '1px solid rgba(255, 255, 255, 0.1)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        🚗 {presetKey}
                      </button>
                    ))}
                  </div>
                </div>

                {/* SECTION 1: VEHICLE IDENTITY & CORE ATTRIBUTES */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--accent, #f59e0b)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      1. Vehicle Basics & Registration
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.875rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Registration Number *</label>
                      <input
                        type="text"
                        className="input font-mono"
                        required
                        placeholder="e.g. KA01MK1234"
                        value={onboardReg}
                        onChange={e => setOnboardReg(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Fleet Number / Unit Code</label>
                      <input
                        type="text"
                        className="input font-mono"
                        placeholder="e.g. VMF-005 (auto if blank)"
                        value={onboardFleetNumber}
                        onChange={e => setOnboardFleetNumber(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>VIN / Chassis Number</label>
                      <input
                        type="text"
                        className="input font-mono"
                        placeholder="Optional or leave blank"
                        value={onboardVin}
                        onChange={e => setOnboardVin(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Make / Manufacturer *</label>
                      <input
                        type="text"
                        className="input"
                        required
                        placeholder="e.g. Hyundai, Tata, Toyota"
                        value={onboardMake}
                        onChange={e => setOnboardMake(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Model *</label>
                      <input
                        type="text"
                        className="input"
                        required
                        placeholder="e.g. Creta, Nexon EV, Innova"
                        value={onboardModel}
                        onChange={e => setOnboardModel(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Variant & Trim</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="e.g. SX(O) AT / Empowered"
                        value={onboardVariant}
                        onChange={e => setOnboardVariant(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Manufacturing Year *</label>
                      <input
                        type="number"
                        className="input"
                        required
                        min={2015}
                        max={CURRENT_YEAR + 1}
                        value={onboardYear}
                        onChange={e => setOnboardYear(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Exterior Color *</label>
                      <input
                        type="text"
                        className="input"
                        required
                        placeholder="e.g. Polar White, Daytona Grey"
                        value={onboardColor}
                        onChange={e => setOnboardColor(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Assigned Operating Hub *</label>
                      <select
                        className="select"
                        required
                        value={onboardHubId}
                        onChange={e => setOnboardHubId(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      >
                        {(hubs.length > 0 ? hubs : branches).map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Transmission *</label>
                      <select
                        className="select"
                        value={onboardTransmission}
                        onChange={e => setOnboardTransmission(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      >
                        <option value="AUTOMATIC">Automatic (AT / IVT / AMT)</option>
                        <option value="MANUAL">Manual (MT)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Fuel / Powertrain *</label>
                      <select
                        className="select"
                        value={onboardFuel}
                        onChange={e => setOnboardFuel(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      >
                        <option value="PETROL">Petrol</option>
                        <option value="DIESEL">Diesel</option>
                        <option value="EV">Electric (EV)</option>
                        <option value="HYBRID">Hybrid</option>
                        <option value="CNG">CNG</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Seating Capacity *</label>
                      <input
                        type="number"
                        className="input"
                        min={2}
                        max={9}
                        value={onboardSeats}
                        onChange={e => setOnboardSeats(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Current Odometer (km)</label>
                      <input
                        type="number"
                        className="input"
                        min={0}
                        value={onboardOdometerKm}
                        onChange={e => setOnboardOdometerKm(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 2: RENTAL PRICING & KM PACKAGES */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--accent, #f59e0b)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      2. Rental Rates & Kilometre Packages
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.875rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Daily Base Rate (₹) *</label>
                      <input
                        type="number"
                        className="input"
                        required
                        min={500}
                        value={onboardDailyRateRupees}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setOnboardDailyRateRupees(val);
                          setOnboardHourlyRateRupees(Math.round(val / 10));
                        }}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Hourly Rate (₹/hr)</label>
                      <input
                        type="number"
                        className="input"
                        min={50}
                        value={onboardHourlyRateRupees}
                        onChange={e => setOnboardHourlyRateRupees(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Refundable Security Deposit (₹) *</label>
                      <input
                        type="number"
                        className="input"
                        required
                        min={0}
                        value={onboardDepositRupees}
                        onChange={e => setOnboardDepositRupees(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Included Daily Km * <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(used only if the hub has no policy)</span></label>
                      <input
                        type="number"
                        className="input"
                        required
                        min={50}
                        value={onboardIncludedKm}
                        onChange={e => setOnboardIncludedKm(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Extra Km Rate (₹/km) * <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(used only if the hub has no policy)</span></label>
                      <input
                        type="number"
                        className="input"
                        required
                        min={1}
                        value={onboardExtraKmRateRupees}
                        onChange={e => setOnboardExtraKmRateRupees(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 3: VEHICLE IMAGES & PHOTO GALLERY */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--accent, #f59e0b)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        3. Vehicle Photos & Visuals
                      </span>
                      <span className="badge badge-info" style={{ fontSize: '0.6875rem' }}>
                        {onboardImages.length} Photo{onboardImages.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      First image serves as the main fleet thumbnail
                    </span>
                  </div>

                  {/* Upload Controls */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
                    <input
                      type="file"
                      id="onboard-photo-file-input"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleImageUpload}
                    />
                    <label
                      htmlFor="onboard-photo-file-input"
                      className="btn-secondary button secondary"
                      style={{
                        cursor: imageUploading ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.8125rem',
                        padding: '0.45rem 0.9rem',
                      }}
                    >
                      {imageUploading ? '⏳ Uploading Photos…' : '📁 Upload Photos from Computer'}
                    </label>

                    <div style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '260px' }}>
                      <input
                        type="url"
                        className="input"
                        placeholder="Or paste external image URL (https://...)"
                        value={imageUrlInput}
                        onChange={e => setImageUrlInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddImageUrl();
                          }
                        }}
                        style={{ flex: 1, fontSize: '0.8125rem' }}
                      />
                      <button
                        type="button"
                        className="btn-secondary button secondary"
                        onClick={handleAddImageUrl}
                        style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}
                      >
                        + Add URL
                      </button>
                    </div>
                  </div>

                  {/* Image Thumbnails Gallery */}
                  {onboardImages.length === 0 && onboardLocalFiles.length === 0 ? (
                    <div
                      style={{
                        padding: '1.5rem',
                        textAlign: 'center',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px dashed var(--border)',
                        borderRadius: '8px',
                        color: 'var(--muted)',
                        fontSize: '0.8125rem',
                      }}
                    >
                      No vehicle photos added yet. Choose photos from device or click one of the quick model presets!
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                        gap: '0.75rem',
                        background: 'rgba(0, 0, 0, 0.2)',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {onboardImages.map((imgUrl, idx) => (
                        <div
                          key={`remote-${idx}`}
                          style={{
                            position: 'relative',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            border: idx === 0 ? '2px solid var(--accent, #f59e0b)' : '1px solid var(--border)',
                            background: '#000',
                            aspectRatio: '4/3',
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          <img
                            src={imgUrl}
                            alt={`Vehicle ${idx + 1}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                            onError={e => {
                              (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80';
                            }}
                          />
                          {idx === 0 ? (
                            <span
                              style={{
                                position: 'absolute',
                                top: '4px',
                                left: '4px',
                                background: 'var(--accent, #f59e0b)',
                                color: '#000',
                                fontSize: '0.625rem',
                                fontWeight: 800,
                                padding: '1px 5px',
                                borderRadius: '3px',
                                textTransform: 'uppercase',
                              }}
                            >
                              ★ Cover
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetCoverImage(idx)}
                              title="Make this photo the primary cover image"
                              style={{
                                position: 'absolute',
                                top: '4px',
                                left: '4px',
                                background: 'rgba(0, 0, 0, 0.65)',
                                color: '#f8fafc',
                                border: 'none',
                                fontSize: '0.625rem',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                cursor: 'pointer',
                              }}
                            >
                              Set Cover
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(idx)}
                            title="Remove this photo"
                            style={{
                              position: 'absolute',
                              top: '4px',
                              right: '4px',
                              background: 'rgba(239, 68, 68, 0.85)',
                              color: '#ffffff',
                              border: 'none',
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              fontSize: '0.625rem',
                              fontWeight: 800,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      {/* Local held files (staged before submit) */}
                      {onboardLocalFiles.map((localItem, lIdx) => (
                        <div
                          key={`local-${lIdx}`}
                          style={{
                            position: 'relative',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            border: '1px dashed #10b981',
                            background: '#000',
                            aspectRatio: '4/3',
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          <img
                            src={localItem.previewUrl}
                            alt={`Local Vehicle ${lIdx + 1}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          />
                          <span
                            style={{
                              position: 'absolute',
                              bottom: '4px',
                              left: '4px',
                              background: 'rgba(16, 185, 129, 0.9)',
                              color: '#fff',
                              fontSize: '0.5625rem',
                              fontWeight: 700,
                              padding: '1px 4px',
                              borderRadius: '3px',
                            }}
                          >
                            Pending Save
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              URL.revokeObjectURL(localItem.previewUrl);
                              setOnboardLocalFiles(prev => prev.filter((_, idx) => idx !== lIdx));
                            }}
                            title="Remove this local file"
                            style={{
                              position: 'absolute',
                              top: '4px',
                              right: '4px',
                              background: 'rgba(239, 68, 68, 0.85)',
                              color: '#ffffff',
                              border: 'none',
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              fontSize: '0.625rem',
                              fontWeight: 800,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SECTION 4: VEHICLE FEATURES & AMENITIES */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--accent, #f59e0b)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        4. Vehicle Features & Amenities
                      </span>
                      <span className="badge badge-info" style={{ fontSize: '0.6875rem' }}>
                        {onboardFeatures.length} Selected
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      Click tags to toggle on/off
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.875rem' }}>
                    {POPULAR_FEATURES.map(feat => {
                      const isSelected = onboardFeatures.includes(feat);
                      return (
                        <button
                          key={feat}
                          type="button"
                          onClick={() => handleToggleFeature(feat)}
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '0.35rem 0.75rem',
                            borderRadius: '999px',
                            background: isSelected ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            color: isSelected ? 'var(--accent, #f59e0b)' : 'var(--muted)',
                            border: isSelected ? '1px solid var(--accent, #f59e0b)' : '1px solid rgba(255, 255, 255, 0.1)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {feat}
                        </button>
                      );
                    })}
                  </div>

                  {/* Add Custom Feature */}
                  <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '420px' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="Add custom feature tag (e.g. 360 Camera, Ventilated Seats)"
                      value={customFeatureInput}
                      onChange={e => setCustomFeatureInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomFeature();
                        }
                      }}
                      style={{ flex: 1, fontSize: '0.8125rem' }}
                    />
                    <button
                      type="button"
                      className="btn-secondary button secondary"
                      onClick={handleAddCustomFeature}
                      style={{ fontSize: '0.8125rem' }}
                    >
                      + Add
                    </button>
                  </div>
                </div>

                {/* SECTION 5: LEGAL & COMMERCIAL COMPLIANCE */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--accent, #f59e0b)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      5. Commercial Compliance & Regulatory Documents
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.875rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Commercial Permit Number</label>
                      <input
                        type="text"
                        className="input font-mono"
                        placeholder="e.g. COMM-KA01MK1234"
                        value={onboardPermitNumber}
                        onChange={e => setOnboardPermitNumber(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Commercial Permit Expiry</label>
                      <input
                        type="date"
                        className="input"
                        value={onboardPermitExpiry}
                        onChange={e => setOnboardPermitExpiry(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Insurance Policy Number</label>
                      <input
                        type="text"
                        className="input font-mono"
                        placeholder="e.g. POL-VM-1234"
                        value={onboardInsurancePolicy}
                        onChange={e => setOnboardInsurancePolicy(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Insurance Expiry Date</label>
                      <input
                        type="date"
                        className="input"
                        value={onboardInsuranceExpiry}
                        onChange={e => setOnboardInsuranceExpiry(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Fitness Certificate Expiry</label>
                      <input
                        type="date"
                        className="input"
                        value={onboardFitnessExpiry}
                        onChange={e => setOnboardFitnessExpiry(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* FIXED STICKY MODAL FOOTER */}
              <div
                className="modal-footer"
                style={{
                  flexShrink: 0,
                  padding: '1rem 1.5rem',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(15, 23, 42, 0.95)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--muted)' }}>
                  <span style={{ color: 'var(--text, #fff)', fontWeight: 600 }}>
                    {onboardMake} {onboardModel}
                  </span>
                  <span>•</span>
                  <span>{onboardReg || 'New Vehicle'}</span>
                  <span>•</span>
                  <span style={{ color: 'var(--accent, #f59e0b)', fontWeight: 700 }}>
                    ₹{onboardDailyRateRupees.toLocaleString('en-IN')}/day
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn-secondary button secondary"
                    onClick={() => setOnboardModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary btn-gold button primary"
                    disabled={actionBusy || imageUploading}
                    style={{ minWidth: '160px' }}
                  >
                    {actionBusy ? 'Enrolling Vehicle…' : '✓ Enroll into Fleet'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD AVAILABILITY BLOCK */}
      {blockModalVehicle && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-dialog" style={{ maxWidth: '500px', width: '95%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="eyebrow">AVAILABILITY BUFFER</span>
                <h3 style={{ margin: 0 }}>Block {blockModalVehicle.make} {blockModalVehicle.model}</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setBlockModalVehicle(null)}>
                <IconCross />
              </button>
            </div>
            <form onSubmit={handleBlockSubmit}>
              <div className="modal-body" style={{ padding: '1.25rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                  Prevent customer rental reservations during this maintenance or detailing period.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Start Date/Time *</label>
                    <input
                      type="datetime-local"
                      className="input"
                      required
                      value={blockStart}
                      onChange={e => setBlockStart(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>End Date/Time *</label>
                    <input
                      type="datetime-local"
                      className="input"
                      required
                      value={blockEnd}
                      onChange={e => setBlockEnd(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Reason for Block *</label>
                  <select
                    className="select"
                    value={blockReason}
                    onChange={e => setBlockReason(e.target.value)}
                    style={{ width: '100%', marginTop: '4px' }}
                  >
                    <option value="MAINTENANCE">Routine Maintenance & Servicing</option>
                    <option value="ACCIDENT_REPAIR">Bodyshop / Accident Repair</option>
                    <option value="CLEANING">Deep Cleaning & Turnaround</option>
                    <option value="OPERATIONAL_RESTRICTION">RTO / Commercial Fitness Inspection</option>
                    <option value="BUFFER">Scheduling Buffer</option>
                  </select>
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Notes</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. 20,000 km oil service scheduled at Bosch Hub"
                    value={blockNotes}
                    onChange={e => setBlockNotes(e.target.value)}
                    style={{ width: '100%', marginTop: '4px' }}
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn-secondary button secondary" onClick={() => setBlockModalVehicle(null)}>Cancel</button>
                <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                  {actionBusy ? 'Saving Block…' : 'Create Availability Block'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MAINTENANCE & BUFFER HISTORY */}
      {historyModalVehicle && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-dialog" style={{ maxWidth: '880px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="eyebrow">VEHICLE SERVICE & MAINTENANCE HISTORY</span>
                <h3 style={{ margin: 0 }}>
                  {historyModalVehicle.make} {historyModalVehicle.model} ({historyModalVehicle.registrationNumber}) — Fleet #{historyModalVehicle.fleetNumber}
                </h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setHistoryModalVehicle(null)}>
                <IconCross />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '1.25rem' }}>
              {/* Active Maintenance Callout Banner */}
              {(historyModalVehicle.status === 'MAINTENANCE' || historyModalVehicle.status === 'CLEANING' || historyModalVehicle.activeBlock) ? (
                <div style={{
                  padding: '1rem 1.25rem',
                  background: 'rgba(247, 181, 3, 0.12)',
                  border: '1px solid rgba(247, 181, 3, 0.45)',
                  borderRadius: '8px',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge badge-warning">● CURRENTLY IN MAINTENANCE</span>
                      <strong style={{ fontSize: '1rem', color: '#fbbf24' }}>
                        {historyModalVehicle.activeBlock?.reason?.replace(/_/g, ' ') || 'Scheduled Service & Maintenance'}
                      </strong>
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '4px' }}>
                      <strong>Started:</strong> {historyModalVehicle.activeBlock ? formatDate(historyModalVehicle.activeBlock.startTime) : 'Active'} · 
                      <strong> Scheduled End:</strong> {historyModalVehicle.activeBlock ? formatDate(historyModalVehicle.activeBlock.endTime) : 'Open-ended'}
                    </div>
                    {historyModalVehicle.activeBlock?.notes && (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text)', marginTop: '4px' }}>
                        <strong>Notes:</strong> {historyModalVehicle.activeBlock.notes}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-primary btn-gold button primary"
                    style={{ background: '#10b981', color: '#061a38', borderColor: '#10b981', fontWeight: 700 }}
                    disabled={actionBusy}
                    onClick={() => void handleReleaseFromMaintenance(historyModalVehicle)}
                  >
                    ✓ Release to Available Now
                  </button>
                </div>
              ) : (
                <div style={{
                  padding: '0.75rem 1rem',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '8px',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge badge-success">● AVAILABLE</span>
                    <span style={{ fontSize: '0.875rem' }}>
                      Vehicle is ready and bookable by customers at <strong>{historyModalVehicle.hub?.name || 'Local Hub'}</strong>.
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {historyModalVehicle.isEligibleForRental ? 'Market Visibility: Live' : 'Market Visibility: Delisted'}
                  </span>
                </div>
              )}

              {/* Maintenance Blocks Table */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                  Maintenance & Scheduling Blocks ({historyModalVehicle.blocks?.length || 0})
                </h4>
                <button
                  type="button"
                  className="btn-secondary btn-sm button secondary small"
                  onClick={() => {
                    const veh = historyModalVehicle;
                    setHistoryModalVehicle(null);
                    setBlockModalVehicle(veh);
                    setBlockStart(new Date().toISOString().slice(0, 16));
                    setBlockEnd(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
                  }}
                >
                  + Add New Block
                </button>
              </div>

              {(!historyModalVehicle.blocks || historyModalVehicle.blocks.length === 0) ? (
                <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                  No maintenance blocks or buffer periods recorded for this vehicle yet. All routine servicing, repairs, and turnaround detailing records will appear here.
                </div>
              ) : (
                <div className="table-responsive" style={{ background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Reason</th>
                        <th>Start Date / Time</th>
                        <th>End Date / Time</th>
                        <th>Notes / Technician Report</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyModalVehicle.blocks.map(block => {
                        const now = new Date();
                        const s = new Date(block.startTime);
                        const e = new Date(block.endTime);
                        const isActive = s <= now && e > now;
                        const isUpcoming = s > now;

                        return (
                          <tr key={block.id}>
                            <td>
                              {isActive ? (
                                <span className="badge badge-warning">● ACTIVE NOW</span>
                              ) : isUpcoming ? (
                                <span className="badge badge-info">● UPCOMING</span>
                              ) : (
                                <span className="badge badge-neutral">✓ COMPLETED</span>
                              )}
                            </td>
                            <td>
                              <strong>{block.reason.replace(/_/g, ' ')}</strong>
                            </td>
                            <td>
                              <div>{formatDate(block.startTime)}</div>
                            </td>
                            <td>
                              <div>{formatDate(block.endTime)}</div>
                            </td>
                            <td style={{ maxWidth: '240px', fontSize: '0.8125rem' }}>
                              {block.notes || <span style={{ color: 'var(--muted)' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                {(isActive || isUpcoming) && (
                                  <button
                                    type="button"
                                    className="btn-sm btn-primary button primary small"
                                    style={{ fontSize: '0.72rem', background: '#10b981', color: '#061a38', borderColor: '#10b981', fontWeight: 700 }}
                                    disabled={actionBusy}
                                    onClick={() => void handleReleaseSpecificBlock(historyModalVehicle, block.id)}
                                    title="End this block now and restore vehicle to AVAILABLE"
                                  >
                                    End & Release
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn-sm btn-danger button danger small"
                                  style={{ fontSize: '0.72rem' }}
                                  disabled={actionBusy}
                                  onClick={() => void handleDeleteSpecificBlock(historyModalVehicle, block.id)}
                                  title="Delete accidental block record"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-danger button danger small"
                disabled={actionBusy}
                onClick={() => void handleDeleteVehicle(historyModalVehicle)}
              >
                🗑 Delete / Retire Fleet Vehicle
              </button>
              <button type="button" className="btn-secondary button secondary" onClick={() => setHistoryModalVehicle(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANAGE RENTAL BOOKING DRAWER */}
      {activeBooking && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-dialog" style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="eyebrow">RENTAL TRIP DISPATCH</span>
                <h3 style={{ margin: 0 }}>
                  Booking #{activeBooking.bookingNumber} — {activeBooking.vehicle?.make} {activeBooking.vehicle?.model}
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {(activeBooking.status === 'CONFIRMED' || activeBooking.status === 'PENDING_PAYMENT') && (
                  <button
                    type="button"
                    className="btn-danger button danger small"
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                    onClick={() => openCancelModal('CUSTOMER_REQUESTED')}
                    title="Cancel booking before dispatch"
                  >
                    🚫 Cancel Booking
                  </button>
                )}
                <button type="button" className="icon-button" onClick={() => setActiveBooking(null)}>
                  <IconCross />
                </button>
              </div>
            </div>

            {/* Sub-Tabs */}
            <div className="stepper-nav">
              {[
                { id: 'overview', label: 'Trip Overview' },
                { id: 'payment', label: `Billing & Ledger (${activeBooking.rentalPaymentStatus || 'NOT_PAID'})` },
                { id: 'kyc', label: `1. Driver KYC (${activeBooking.kycStatus})` },
                { id: 'handover', label: '2. Pickup Handover' },
                { id: 'return', label: '3. Return Inspection' },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`stepper-tab ${bookingDrawerTab === t.id ? 'active' : ''}`}
                  onClick={() => setBookingDrawerTab(t.id as any)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="modal-body" style={{ padding: '1.25rem' }}>
              {/* TAB 1: OVERVIEW */}
              {bookingDrawerTab === 'overview' && (
                <div>
                  {activeBooking.status === 'CANCELLED' && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
                      <div style={{ fontWeight: 800, color: '#ef4444', fontSize: '0.9rem', marginBottom: '4px' }}>
                        🚫 THIS RESERVATION IS CANCELLED
                      </div>
                      <div style={{ fontSize: '0.8125rem' }}>
                        <strong>Cancellation Reason:</strong> {activeBooking.cancellationReason || 'Cancelled by operations / customer'}
                      </div>
                      {activeBooking.cancelledAt && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '4px' }}>
                          Cancelled on: {new Date(activeBooking.cancelledAt).toLocaleString('en-IN')}
                        </div>
                      )}
                    </div>
                  )}

                  {(activeBooking.status === 'TRIP_ACTIVE' || activeBooking.status === 'VEHICLE_COLLECTED') && (
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid #10b981', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>🚗</span>
                        <div>
                          <strong style={{ color: '#10b981', fontSize: '0.875rem', display: 'block' }}>
                            Vehicle Dispatched — Trip Active On Road
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                            Pickup handover has been completed and vehicle keys released. Cancellation is strictly locked.
                          </span>
                        </div>
                      </div>
                      <span className="badge badge-success">DISPATCHED</span>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>CUSTOMER</span>
                      <div><strong>{activeBooking.customer?.displayName || 'Customer'}</strong></div>
                      <div>Phone: {activeBooking.customer?.phone || '—'}</div>
                      <div>Email: {activeBooking.customer?.email || '—'}</div>
                    </div>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>FLEET CAR</span>
                      <div><strong>{activeBooking.vehicle?.make} {activeBooking.vehicle?.model}</strong></div>
                      <div>Plate: <span className="code-pill">{activeBooking.vehicle?.registrationNumber || '—'}</span></div>
                      <div>Hub: {activeBooking.pickupHub?.name || 'Local Hub'}</div>
                    </div>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>RESERVATION STATUS</span>
                      <div>Status: <span className="badge badge-info">{activeBooking.status}</span></div>
                      <div>KYC: <span className={`badge ${activeBooking.kycStatus === 'VERIFIED' ? 'badge-success' : 'badge-warning'}`}>{activeBooking.kycStatus}</span></div>
                      <div>Plan: <strong>{activeBooking.paymentPlanSnapshot?.planName || 'Standard'}</strong></div>
                    </div>
                  </div>

                  {/* PAYMENT & FINANCIAL OBLIGATIONS CARD */}
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.875rem', color: 'var(--text)' }}>
                        💳 PAYMENT & FINANCIAL OBLIGATIONS
                      </span>
                      <span className={`badge ${activeBooking.rentalPaymentStatus === 'PAID_IN_FULL' || Number(activeBooking.outstandingBalancePaise || 0) === 0 ? 'badge-success' : 'badge-warning'}`}>
                        {activeBooking.rentalPaymentStatus || 'NOT_PAID'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div style={{ background: 'var(--surface-secondary)', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>TOTAL RENTAL CHARGE</span>
                        <strong style={{ fontSize: '1rem' }}>{formatRupees(activePaymentSummary?.rentalTotalPaise || (Number(activeBooking.baseFarePaise || 0) + Number(activeBooking.taxPaise || 0)) || activeBooking.totalPayablePaise)}</strong>
                      </div>
                      <div style={{ background: 'var(--surface-secondary)', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>VERIFIED PAID</span>
                        <strong style={{ fontSize: '1rem', color: '#10b981' }}>{formatRupees(activePaymentSummary?.verifiedPaidPaise || activeBooking.verifiedPaidPaise || 0)}</strong>
                      </div>
                      <div style={{ background: 'var(--surface-secondary)', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>OUTSTANDING BALANCE</span>
                        <strong style={{ fontSize: '1rem', color: Number(activePaymentSummary?.outstandingPaise || activeBooking.outstandingBalancePaise || 0) > 0 ? '#ef4444' : '#10b981' }}>
                          {formatRupees(activePaymentSummary?.outstandingPaise || activeBooking.outstandingBalancePaise || 0)}
                        </strong>
                      </div>
                      <div style={{ background: 'var(--surface-secondary)', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>SECURITY DEPOSIT</span>
                        <strong style={{ fontSize: '1rem' }}>{formatRupees(activeBooking.securityDepositPaise)}</strong>
                        <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>({activeBooking.depositStatus || 'NOT_COLLECTED'})</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--muted)', flexWrap: 'wrap', gap: '6px', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                      <div>
                        Balance Deadline: <strong>{formatDate(activePaymentSummary?.balanceDueAt || activeBooking.balanceDueAt)}</strong>
                        {activeBooking.balanceDueAt && Number(activeBooking.outstandingBalancePaise || 0) > 0 && new Date(activeBooking.balanceDueAt).getTime() < Date.now() && (
                          <span style={{ color: '#ef4444', fontWeight: 800, marginLeft: '6px' }}>(OVERDUE)</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn-secondary button secondary"
                          style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem' }}
                          onClick={() => openRecordPaymentModal()}
                        >
                          💳 Record Counter Payment
                        </button>
                        <span>Policy: <strong>{activePaymentSummary?.paymentPlan?.policyVersion || activeBooking.paymentPlanSnapshot?.policyVersion || 'VMR-POL-2026.1'}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* AUTHORITATIVE PICKUP READINESS GATE CHECKLIST */}
                  {(() => {
                    const rawReadiness = (activePaymentSummary?.pickupReadiness || activeBooking.pickupReadiness) as any;
                    const defaultReasons: string[] = [
                      ...(Number(activeBooking.outstandingBalancePaise || 0) > 0 ? [`Rental balance of ${formatRupees(activeBooking.outstandingBalancePaise)} is unpaid`] : []),
                      ...(activeBooking.kycStatus !== 'VERIFIED' ? ['Primary driver KYC is unverified'] : []),
                    ];

                    const isReady: boolean = rawReadiness
                      ? (rawReadiness.isReady ?? rawReadiness.eligible ?? false)
                      : (Number(activeBooking.outstandingBalancePaise || 0) === 0 && activeBooking.kycStatus === 'VERIFIED');

                    const reasons: string[] = (rawReadiness?.reasons || rawReadiness?.blockers || defaultReasons) as string[];

                    const checklist = rawReadiness?.checklist || {
                      bookingConfirmed: activeBooking.status !== 'CANCELLED',
                      rentalPaymentComplete: Number(activeBooking.outstandingBalancePaise || 0) === 0,
                      driverEligible: activeBooking.kycStatus === 'VERIFIED',
                      vehicleReady: true,
                    };

                    return (
                      <div
                        style={{
                          background: isReady ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                          border: `1px solid ${isReady ? '#10b981' : '#ef4444'}`,
                          borderRadius: '8px',
                          padding: '1rem',
                          marginBottom: '1.25rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '6px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.875rem', color: isReady ? '#10b981' : '#ef4444' }}>
                            🛡️ AUTHORITATIVE PICKUP READINESS GATE
                          </span>
                          <span className={`badge ${isReady ? 'badge-success' : 'badge-danger'}`} style={{ fontWeight: 800 }}>
                            {isReady ? '✓ APPROVED FOR HANDOVER' : '⊘ HANDOVER BLOCKED'}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', marginBottom: reasons.length > 0 ? '0.75rem' : '0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                            <span>{checklist.bookingConfirmed ? '✅' : '❌'}</span>
                            <span style={{ color: checklist.bookingConfirmed ? 'var(--text)' : '#ef4444' }}>Booking Confirmed</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                            <span>{checklist.rentalPaymentComplete ? '✅' : '❌'}</span>
                            <span style={{ color: checklist.rentalPaymentComplete ? 'var(--text)' : '#ef4444' }}>Rental Charges Paid in Full</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                            <span>{checklist.driverEligible ? '✅' : '❌'}</span>
                            <span style={{ color: checklist.driverEligible ? 'var(--text)' : '#ef4444' }}>Driver KYC Approved</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                            <span>{checklist.vehicleReady ? '✅' : '❌'}</span>
                            <span style={{ color: checklist.vehicleReady ? 'var(--text)' : '#ef4444' }}>Vehicle Prepared & Assigned</span>
                          </div>
                        </div>

                        {!isReady && reasons.length > 0 && (
                          <div style={{ background: 'var(--surface)', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                              Handover Blocking Reasons:
                            </span>
                            <ul style={{ margin: '0', paddingLeft: '1.2rem', fontSize: '0.78rem', color: 'var(--text)' }}>
                              {reasons.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                    <strong>Trip Duration:</strong>
                    <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>
                      Start: {formatDate(activeBooking.startTime)} → End: {formatDate(activeBooking.endTime)}
                    </div>
                  </div>

                  {/* SETTLEMENT OVERVIEW BANNER (IF TRIP RETURNED OR SETTLED) */}
                  {(activeBooking.status === 'SETTLED' || activeBooking.status === 'RETURN_INSPECTED' || activeBooking.trip?.isSettled || activeBooking.trip?.returnTime) && (
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid #10b981', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontWeight: 800, color: '#10b981', fontSize: '0.875rem' }}>
                          🏁 FINAL SETTLEMENT & DEPOSIT RECONCILIATION
                        </span>
                        <span className={`badge ${activeBooking.trip?.isSettled ? 'badge-success' : 'badge-info'}`}>
                          {activeBooking.trip?.isSettled ? 'SETTLEMENT CLOSED' : 'INSPECTION RECORDED'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>DISTANCE DRIVEN</span>
                          <div style={{ fontWeight: 700 }}>
                            {activeBooking.trip?.returnOdometerKm && activeBooking.trip?.pickupOdometerKm
                              ? `${activeBooking.trip.returnOdometerKm - activeBooking.trip.pickupOdometerKm} km`
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>EXCESS KM</span>
                          <div style={{ fontWeight: 700 }}>{activeBooking.trip?.excessKm || 0} km</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>SECURITY DEPOSIT</span>
                          <div style={{ fontWeight: 700 }}>{formatRupees(activeBooking.securityDepositPaise)}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>EXTRA CHARGES</span>
                          <div style={{ fontWeight: 700, color: '#ef4444' }}>
                            {formatRupees(activeBooking.trip?.totalAdditionalChargesPaise || 0)}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>NET REFUND</span>
                          <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.05rem' }}>
                            {formatRupees(activeBooking.trip?.depositRefundPaise || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: PAYMENT & BILLING LEDGER */}
              {bookingDrawerTab === 'payment' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <h4 style={{ margin: 0 }}>Rental Billing Ledger & Installment Schedule</h4>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', margin: '2px 0 0 0' }}>
                        Real-time verified payments, outstanding balance, and installment settlement audit trail.
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn-primary btn-gold button primary"
                        style={{ fontSize: '0.8125rem', padding: '0.45rem 0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => openRecordPaymentModal()}
                      >
                        <span>💳</span> Record Counter / Offline Payment
                      </button>
                      {loadingPaymentDetails && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Loading financial records…</span>
                      )}
                    </div>
                  </div>

                  {/* Payment Overview Card */}
                  <div style={{ background: 'var(--surface-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>PAYMENT PLAN</span>
                        <div style={{ fontWeight: 800, color: 'var(--accent)' }}>
                          {activePaymentSummary?.paymentPlan?.planName || activeBooking.paymentPlanSnapshot?.planName || 'Full Payment (100%)'}
                        </div>
                        <small style={{ color: 'var(--muted)' }}>Ver: {activePaymentSummary?.paymentPlan?.policyVersion || 'VMR-POL-2026.1'}</small>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>TOTAL CHARGES</span>
                        <div style={{ fontWeight: 800 }}>
                          {formatRupees(activePaymentSummary?.rentalTotalPaise || (Number(activeBooking.baseFarePaise || 0) + Number(activeBooking.taxPaise || 0)) || activeBooking.totalPayablePaise)}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>VERIFIED PAID</span>
                        <div style={{ fontWeight: 800, color: '#10b981' }}>
                          {formatRupees(activePaymentSummary?.verifiedPaidPaise || activeBooking.verifiedPaidPaise || 0)}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>BALANCE REMAINING</span>
                        <div style={{ fontWeight: 800, color: Number(activePaymentSummary?.outstandingPaise || activeBooking.outstandingBalancePaise || 0) > 0 ? '#ef4444' : '#10b981' }}>
                          {formatRupees(activePaymentSummary?.outstandingPaise || activeBooking.outstandingBalancePaise || 0)}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>SECURITY DEPOSIT</span>
                        <div style={{ fontWeight: 800 }}>{formatRupees(activeBooking.securityDepositPaise)}</div>
                        <small style={{ color: 'var(--muted)' }}>{activeBooking.depositStatus || 'NOT_COLLECTED'}</small>
                      </div>
                    </div>
                  </div>

                  {/* Installment Schedule */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h5 style={{ margin: '0 0 0.5rem 0' }}>Installment Schedule</h5>
                    <div className="table-responsive" style={{ background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <table style={{ fontSize: '0.8125rem' }}>
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Share</th>
                            <th>Amount</th>
                            <th>Due Date</th>
                            <th>Status</th>
                            <th>Paid Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activePaymentSchedule?.installments && activePaymentSchedule.installments.length > 0 ? (
                            activePaymentSchedule.installments.map((inst, idx) => {
                              const amount = typeof inst.amountRupees === 'number'
                                ? inst.amountRupees
                                : Math.round(Number(inst.amountPaise || 0) / 100);
                              const typeLabel = inst.type === 'ADVANCE'
                                ? 'Initial Advance'
                                : inst.type === 'FULL'
                                ? 'Full Rental Payment'
                                : 'Remaining Balance';
                              const pctLabel = inst.percentage !== undefined && inst.percentage !== null
                                ? `${inst.percentage}%`
                                : '—';
                              const isPaid = inst.status === 'PAID' || inst.status === 'VERIFIED';
                              const isOverdue = inst.status === 'OVERDUE';
                              return (
                                <tr key={idx}>
                                  <td><strong>{typeLabel}</strong></td>
                                  <td>{pctLabel}</td>
                                  <td className="money"><strong>₹{amount.toLocaleString('en-IN')}</strong></td>
                                  <td>{formatDate(inst.dueAt)}</td>
                                  <td>
                                    <span className={`badge ${isPaid ? 'badge-success' : isOverdue ? 'badge-danger' : 'badge-warning'}`}>
                                      {inst.status}
                                    </span>
                                  </td>
                                  <td>{inst.paidAt ? formatDate(inst.paidAt) : '—'}</td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={6} style={{ textAlign: 'center', padding: '1rem', color: 'var(--muted)' }}>
                                Single payment installment schedule ({formatRupees(activeBooking.totalPayablePaise)}).
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payment Transaction Ledger */}
                  <div>
                    <h5 style={{ margin: '0 0 0.5rem 0' }}>Transaction Audit History</h5>
                    <div className="table-responsive" style={{ background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <table style={{ fontSize: '0.8125rem' }}>
                        <thead>
                          <tr>
                            <th>Transaction ID</th>
                            <th>Installment</th>
                            <th>Gateway</th>
                            <th>Reference / Order ID</th>
                            <th>Status</th>
                            <th>Amount</th>
                            <th>Timestamp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activePaymentHistory && activePaymentHistory.length > 0 ? (
                            activePaymentHistory.map((tx) => {
                              const amount = typeof tx.amountRupees === 'number'
                                ? tx.amountRupees
                                : Math.round(Number(tx.amountPaise || 0) / 100);
                              const isSuccess = tx.status === 'VERIFIED' || tx.status === 'PAID';
                              const isFailed = tx.status === 'FAILED';
                              return (
                                <tr key={tx.id}>
                                  <td><span className="code-pill">{(tx.id || '').slice(0, 8)}…</span></td>
                                  <td><strong>{tx.installmentType || 'PAYMENT'}</strong></td>
                                  <td>{tx.provider || (tx as any).paymentGateway || '—'}</td>
                                  <td><span className="code-pill">{tx.reference || (tx as any).gatewayPaymentId || (tx as any).gatewayOrderId || '—'}</span></td>
                                  <td><span className={`badge ${isSuccess ? 'badge-success' : isFailed ? 'badge-danger' : 'badge-warning'}`}>{tx.status}</span></td>
                                  <td className="money"><strong>₹{amount.toLocaleString('en-IN')}</strong></td>
                                  <td>{formatDate(tx.createdAt)}</td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={7} style={{ textAlign: 'center', padding: '1rem', color: 'var(--muted)' }}>
                                No individual transaction records loaded.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: KYC */}
              {bookingDrawerTab === 'kyc' && (
                <div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                    Verify primary driver government driving license before releasing vehicle keys. Strict KYC is enforced by legal insurance regulations. Both front and back physical license documents are mandatory.
                  </p>

                  {/* VERIFIED SUMMARY VIEW (SHOWN WHEN KYC IS ALREADY VERIFIED) */}
                  {activeBooking.kycStatus === 'VERIFIED' && !editKycDocuments ? (
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid #10b981', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.2rem' }}>✅</span>
                          <div>
                            <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1rem' }}>
                              Driver License KYC Verified & Approved
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                              Compliance verification passed. Customer is legally authorized to take custody of the vehicle.
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="button secondary small"
                          onClick={() => setEditKycDocuments(true)}
                          style={{ fontSize: '0.75rem' }}
                        >
                          ✏️ Update Physical Documents
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', background: 'var(--surface)', padding: '0.875rem', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>LICENSE NUMBER</span>
                          <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{activeBooking.driverVerification?.licenseNumber || 'KA01-VERIFIED'}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>VALIDITY EXPIRY</span>
                          <div style={{ fontWeight: 700 }}>
                            {activeBooking.driverVerification?.licenseExpiry ? new Date(activeBooking.driverVerification.licenseExpiry).toLocaleDateString('en-IN') : '—'}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>DRIVING EXPERIENCE</span>
                          <div style={{ fontWeight: 700 }}>{activeBooking.driverVerification?.drivingExperienceYears ?? 3} Years</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>DATE OF BIRTH</span>
                          <div style={{ fontWeight: 700 }}>
                            {activeBooking.driverVerification?.dateOfBirth ? new Date(activeBooking.driverVerification.dateOfBirth).toLocaleDateString('en-IN') : '—'}
                          </div>
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                          VERIFIED PHYSICAL DOCUMENTS ON FILE
                        </span>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                          {activeBooking.driverVerification?.licenseFrontUrl ? (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '6px', background: 'var(--surface)' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, display: 'block', marginBottom: '4px', color: '#10b981' }}>License Front</span>
                              <img
                                src={activeBooking.driverVerification.licenseFrontUrl}
                                alt="License Front"
                                onClick={() => setLightboxModal({ url: activeBooking.driverVerification?.licenseFrontUrl || '', title: `Driver License Front — ${activeBooking.driverVerification?.licenseNumber || activeBooking.bookingNumber}` })}
                                style={{ width: '180px', height: '110px', objectFit: 'cover', borderRadius: '4px', display: 'block', cursor: 'zoom-in' }}
                              />
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                <button
                                  type="button"
                                  onClick={() => setLightboxModal({ url: activeBooking.driverVerification?.licenseFrontUrl || '', title: `Driver License Front — ${activeBooking.driverVerification?.licenseNumber || activeBooking.bookingNumber}` })}
                                  style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', color: 'var(--accent, #f59e0b)', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  👁️ Preview
                                </button>
                                <a href={activeBooking.driverVerification.licenseFrontUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>↗</a>
                              </div>
                            </div>
                          ) : (
                            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: '6px', fontSize: '0.8rem' }}>
                              ⚠️ Front document missing
                            </div>
                          )}
                          {activeBooking.driverVerification?.licenseBackUrl ? (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '6px', background: 'var(--surface)' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, display: 'block', marginBottom: '4px', color: '#10b981' }}>License Back</span>
                              <img
                                src={activeBooking.driverVerification.licenseBackUrl}
                                alt="License Back"
                                onClick={() => setLightboxModal({ url: activeBooking.driverVerification?.licenseBackUrl || '', title: `Driver License Back — ${activeBooking.driverVerification?.licenseNumber || activeBooking.bookingNumber}` })}
                                style={{ width: '180px', height: '110px', objectFit: 'cover', borderRadius: '4px', display: 'block', cursor: 'zoom-in' }}
                              />
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                <button
                                  type="button"
                                  onClick={() => setLightboxModal({ url: activeBooking.driverVerification?.licenseBackUrl || '', title: `Driver License Back — ${activeBooking.driverVerification?.licenseNumber || activeBooking.bookingNumber}` })}
                                  style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', color: 'var(--accent, #f59e0b)', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  👁️ Preview
                                </button>
                                <a href={activeBooking.driverVerification.licenseBackUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>↗</a>
                              </div>
                            </div>
                          ) : (
                            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: '6px', fontSize: '0.8rem' }}>
                              ⚠️ Back document missing
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* PENDING REVIEW / RE-UPLOAD FORM */
                    <>
                      {activeBooking.driverVerification ? (
                        <>
                        <div style={{ background: 'var(--surface-secondary)', padding: '1rem', borderRadius: '6px', marginBottom: '1.25rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>LICENSE NUMBER</span>
                              <div><strong>{activeBooking.driverVerification.licenseNumber}</strong></div>
                            </div>
                            <div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>VALIDITY EXPIRY</span>
                              <div><strong>{activeBooking.driverVerification.licenseExpiry ? new Date(activeBooking.driverVerification.licenseExpiry).toLocaleDateString() : '—'}</strong></div>
                            </div>
                            <div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>DATE OF BIRTH</span>
                              <div><strong>{activeBooking.driverVerification.dateOfBirth ? new Date(activeBooking.driverVerification.dateOfBirth).toLocaleDateString() : '—'}</strong></div>
                            </div>
                            <div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>DRIVING EXPERIENCE</span>
                              <div><strong>{activeBooking.driverVerification.drivingExperienceYears} Years</strong></div>
                            </div>
                          </div>

                          {/* Document Previews */}
                          <div style={{ marginBottom: '1rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>MANDATORY LICENSE DOCUMENTS</span>
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                              {activeBooking.driverVerification.licenseFrontUrl ? (
                                <div style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '6px', background: 'var(--surface)' }}>
                                  <img
                                    src={activeBooking.driverVerification.licenseFrontUrl}
                                    alt="License Front"
                                    onClick={() => setLightboxModal({ url: activeBooking.driverVerification?.licenseFrontUrl || '', title: `Driver License Front — ${activeBooking.driverVerification?.licenseNumber || activeBooking.bookingNumber}` })}
                                    style={{ width: '150px', height: '95px', objectFit: 'cover', borderRadius: '4px', display: 'block', cursor: 'zoom-in' }}
                                  />
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                    <button
                                      type="button"
                                      onClick={() => setLightboxModal({ url: activeBooking.driverVerification?.licenseFrontUrl || '', title: `Driver License Front — ${activeBooking.driverVerification?.licenseNumber || activeBooking.bookingNumber}` })}
                                      style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', color: 'var(--accent, #f59e0b)', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                      👁️ Preview
                                    </button>
                                    <a href={activeBooking.driverVerification.licenseFrontUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>↗</a>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: '6px', fontSize: '0.8rem' }}>
                                  ⚠️ Front document missing
                                </div>
                              )}
                              {activeBooking.driverVerification.licenseBackUrl ? (
                                <div style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '6px', background: 'var(--surface)' }}>
                                  <img
                                    src={activeBooking.driverVerification.licenseBackUrl}
                                    alt="License Back"
                                    onClick={() => setLightboxModal({ url: activeBooking.driverVerification?.licenseBackUrl || '', title: `Driver License Back — ${activeBooking.driverVerification?.licenseNumber || activeBooking.bookingNumber}` })}
                                    style={{ width: '150px', height: '95px', objectFit: 'cover', borderRadius: '4px', display: 'block', cursor: 'zoom-in' }}
                                  />
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                    <button
                                      type="button"
                                      onClick={() => setLightboxModal({ url: activeBooking.driverVerification?.licenseBackUrl || '', title: `Driver License Back — ${activeBooking.driverVerification?.licenseNumber || activeBooking.bookingNumber}` })}
                                      style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', color: 'var(--accent, #f59e0b)', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                      👁️ Preview
                                    </button>
                                    <a href={activeBooking.driverVerification.licenseBackUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>↗</a>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: '6px', fontSize: '0.8rem' }}>
                                  ⚠️ Back document missing
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                            <div style={{ marginBottom: '0.75rem' }}>
                              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)' }}>
                                KYC Rejection Reason (Required if rejecting customer documents):
                              </label>
                              <input
                                type="text"
                                className="input"
                                placeholder="e.g. License image is blurry, expired card, name mismatch"
                                value={kycRejectionReason}
                                onChange={e => setKycRejectionReason(e.target.value)}
                                style={{ width: '100%', marginTop: '4px' }}
                              />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                Current Status: <span className={`badge ${activeBooking.kycStatus === 'VERIFIED' ? 'badge-success' : 'badge-warning'}`}>{activeBooking.kycStatus}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  type="button"
                                  className="btn-danger button danger small"
                                  disabled={actionBusy}
                                  onClick={() => {
                                    let reason = kycRejectionReason.trim();
                                    if (!reason) {
                                      const prompted = window.prompt('Please enter the reason for rejecting this driver license KYC:');
                                      if (prompted && prompted.trim()) {
                                        reason = prompted.trim();
                                        setKycRejectionReason(reason);
                                      }
                                    }
                                    if (!reason) {
                                      onError('Please provide a specific rejection reason for the customer.');
                                      return;
                                    }
                                    void handleKycReview('REJECTED', reason);
                                  }}
                                >
                                  Reject KYC
                                </button>
                                <button
                                  type="button"
                                  className="btn-primary btn-gold button primary small"
                                  disabled={actionBusy || activeBooking.kycStatus === 'VERIFIED' || !activeBooking.driverVerification.licenseFrontUrl || !activeBooking.driverVerification.licenseBackUrl}
                                  onClick={() => void handleKycReview('VERIFIED')}
                                >
                                  {actionBusy ? 'Verifying…' : 'Approve Driver KYC ✓'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* PROMINENT REJECTED KYC CANCELLATION ACTION */}
                        {activeBooking.kycStatus === 'REJECTED' && (activeBooking.status === 'CONFIRMED' || activeBooking.status === 'PENDING_PAYMENT') && (
                          <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid #ef4444', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.875rem' }}>
                                ⚠️ Driver KYC Is Marked Rejected
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '2px' }}>
                                If customer has not submitted valid document corrections within the required review window, or requests to cancel:
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn-danger button danger small"
                              style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                              onClick={() => openCancelModal('KYC_CORRECTION_TIMEOUT')}
                            >
                              🚫 Cancel Booking (KYC Timeout / No Correction)
                            </button>
                          </div>
                        )}
                        </>
                      ) : (
                        <div style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--surface-secondary)', borderRadius: '6px', color: 'var(--muted)', marginBottom: '1.25rem' }}>
                          Customer has not yet submitted driving license KYC online. Please inspect the original card and attach documents below.
                        </div>
                      )}

                      {/* Hub Staff Physical License Document Upload Form */}
                      <div style={{ marginTop: '1.25rem', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                            {activeBooking.driverVerification ? 'Update Physical License Documents at Hub' : 'Attach Customer Physical License at Hub'}
                          </h4>
                          {editKycDocuments && (
                            <button type="button" className="button secondary small" onClick={() => setEditKycDocuments(false)}>
                              Cancel Update
                            </button>
                          )}
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 1rem 0' }}>
                          Inspect the physical card at the counter. Select photos from device (staged locally until you click Attach).
                        </p>
                        <form onSubmit={handleHubKycUploadSubmit}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <div>
                              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>License Number *</label>
                              <input
                                type="text"
                                className="input font-mono"
                                required
                                placeholder="e.g. KA0120220045892"
                                value={hubKycLicenseNumber}
                                onChange={e => setHubKycLicenseNumber(e.target.value)}
                                style={{ width: '100%', marginTop: '3px' }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Validity Expiry *</label>
                              <input
                                type="date"
                                className="input"
                                required
                                value={hubKycExpiry}
                                onChange={e => setHubKycExpiry(e.target.value)}
                                style={{ width: '100%', marginTop: '3px' }}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>License Front Photo *</label>
                                <label
                                  htmlFor="hub-kyc-front-file"
                                  className="button secondary small"
                                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer' }}
                                >
                                  📁 Choose Photo
                                </label>
                                <input
                                  id="hub-kyc-front-file"
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setHubKycFrontLocal({ file, previewUrl: URL.createObjectURL(file) });
                                    if (e.target) e.target.value = '';
                                  }}
                                />
                              </div>
                              {(hubKycFrontLocal || hubKycFrontUrl) ? (
                                <div style={{ position: 'relative', marginTop: '4px', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px', background: 'var(--surface-secondary)' }}>
                                  <img
                                    src={hubKycFrontLocal ? hubKycFrontLocal.previewUrl : hubKycFrontUrl}
                                    alt="Front preview"
                                    style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '3px', display: 'block' }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (hubKycFrontLocal) URL.revokeObjectURL(hubKycFrontLocal.previewUrl);
                                      setHubKycFrontLocal(null);
                                      setHubKycFrontUrl('');
                                    }}
                                    style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(239, 68, 68, 0.9)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '0.625rem', cursor: 'pointer' }}
                                    title="Remove photo"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  className="input"
                                  required
                                  placeholder="Choose photo above or paste URL"
                                  value={hubKycFrontUrl}
                                  onChange={e => setHubKycFrontUrl(e.target.value)}
                                  style={{ width: '100%', marginTop: '3px' }}
                                />
                              )}
                            </div>

                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>License Back Photo *</label>
                                <label
                                  htmlFor="hub-kyc-back-file"
                                  className="button secondary small"
                                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer' }}
                                >
                                  📁 Choose Photo
                                </label>
                                <input
                                  id="hub-kyc-back-file"
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setHubKycBackLocal({ file, previewUrl: URL.createObjectURL(file) });
                                    if (e.target) e.target.value = '';
                                  }}
                                />
                              </div>
                              {(hubKycBackLocal || hubKycBackUrl) ? (
                                <div style={{ position: 'relative', marginTop: '4px', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px', background: 'var(--surface-secondary)' }}>
                                  <img
                                    src={hubKycBackLocal ? hubKycBackLocal.previewUrl : hubKycBackUrl}
                                    alt="Back preview"
                                    style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '3px', display: 'block' }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (hubKycBackLocal) URL.revokeObjectURL(hubKycBackLocal.previewUrl);
                                      setHubKycBackLocal(null);
                                      setHubKycBackUrl('');
                                    }}
                                    style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(239, 68, 68, 0.9)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '0.625rem', cursor: 'pointer' }}
                                    title="Remove photo"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  className="input"
                                  required
                                  placeholder="Choose photo above or paste URL"
                                  value={hubKycBackUrl}
                                  onChange={e => setHubKycBackUrl(e.target.value)}
                                  style={{ width: '100%', marginTop: '3px' }}
                                />
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button type="submit" className="button primary small" disabled={actionBusy}>
                              {actionBusy ? 'Attaching & Uploading…' : 'Attach License Documents'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 3: HANDOVER */}
              {bookingDrawerTab === 'handover' && (
                <div>
                  {(activeBooking.status === 'TRIP_ACTIVE' || activeBooking.status === 'RETURN_INSPECTED' || activeBooking.status === 'SETTLED' || activeBooking.trip?.pickupTime != null) && !editHandover ? (
                    /* COMPLETED HANDOVER CARD */
                    <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid #3b82f6', borderRadius: '8px', padding: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.2rem' }}>🚗</span>
                          <div>
                            <div style={{ fontWeight: 800, color: '#3b82f6', fontSize: '1rem' }}>
                              Vehicle Handed Over & Trip Dispatched
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                              Physical vehicle keys and documents have been handed over to verified driver.
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="button secondary small"
                          onClick={() => setEditHandover(true)}
                          style={{ fontSize: '0.75rem' }}
                        >
                          ✏️ Amend Handover Telemetry
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', background: 'var(--surface)', padding: '0.875rem', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>START ODOMETER</span>
                          <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{activeBooking.trip?.pickupOdometerKm ?? handoverOdometer} km</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>START FUEL LEVEL</span>
                          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#10b981' }}>{activeBooking.trip?.pickupFuelPercent ?? handoverFuel}%</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>KEY RELEASED</span>
                          <div style={{ fontWeight: 700, color: '#10b981' }}>Yes (Customer Signed)</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>DISPATCH TIME</span>
                          <div style={{ fontWeight: 700 }}>
                            {activeBooking.trip?.pickupTime ? formatDate(activeBooking.trip.pickupTime) : 'At Departure'}
                          </div>
                        </div>
                      </div>

                      {/* Condition Notes */}
                      <div style={{ background: 'var(--surface)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block', marginBottom: '2px' }}>HANDOVER CONDITION NOTES</span>
                        <div style={{ fontSize: '0.85rem' }}>{activeBooking.trip?.pickupNotes || handoverNotes}</div>
                      </div>

                      {/* Dispatch Inspection Photos */}
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                          DISPATCH INSPECTION PHOTOS ({Array.isArray(activeBooking.trip?.pickupPhotos) ? activeBooking.trip.pickupPhotos.length : 0})
                        </span>
                        {Array.isArray(activeBooking.trip?.pickupPhotos) && activeBooking.trip.pickupPhotos.length > 0 ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
                            {activeBooking.trip.pickupPhotos.map((photoUrl: string, idx: number) => (
                              <div key={idx} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                <img
                                  src={photoUrl}
                                  alt={`Dispatch ${idx + 1}`}
                                  onClick={() => setLightboxModal({ url: photoUrl, title: `Dispatch Inspection Photo #${idx + 1}` })}
                                  style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setLightboxModal({ url: photoUrl, title: `Dispatch Inspection Photo #${idx + 1}` })}
                                  style={{ position: 'absolute', bottom: '2px', right: '2px', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: '0.625rem', padding: '1px 5px', borderRadius: '3px', border: 'none', cursor: 'pointer' }}
                                >
                                  Enlarge 🔍
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                            Primary fleet vehicle photo linked on file.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* HANDOVER FORM */
                    <form onSubmit={handleHandoverSubmit}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', margin: 0 }}>
                          Vehicle Key Release. Confirm start odometer, fuel level, and condition before key handover.
                        </p>
                        {editHandover && (
                          <button type="button" className="button secondary small" onClick={() => setEditHandover(false)}>
                            Cancel
                          </button>
                        )}
                      </div>

                      {activeBooking.kycStatus !== 'VERIFIED' && (
                        <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: '6px', marginBottom: '1rem', borderLeft: '3px solid var(--danger)' }}>
                          <strong>KYC Gate Locked:</strong> Driver KYC must be VERIFIED before physical vehicle keys can be released.
                        </div>
                      )}

                      {(() => {
                        const outstanding = Number(activePaymentSummary?.outstandingPaise || activeBooking.outstandingBalancePaise || 0);
                        if (outstanding > 0) {
                          return (
                            <div style={{ padding: '0.85rem 1rem', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #ef4444' }}>
                              <div style={{ fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                ⚠️ VEHICLE HANDOVER STRICTLY BLOCKED — OUTSTANDING RENTAL BALANCE
                              </div>
                              <div style={{ fontSize: '0.8rem', marginTop: '4px', color: 'var(--text)' }}>
                                Customer has an unpaid rental balance of <strong>{formatRupees(outstanding)}</strong>.
                                Company policy strictly forbids handing over keys until 100% of rental charges are paid in full.
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Start Odometer (km) *</label>
                          <input
                            type="number"
                            className="input"
                            required
                            value={handoverOdometer}
                            onChange={e => setHandoverOdometer(Number(e.target.value))}
                            style={{ width: '100%', marginTop: '4px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Start Fuel Level (%) *</label>
                          <input
                            type="number"
                            className="input"
                            min={0}
                            max={100}
                            required
                            value={handoverFuel}
                            onChange={e => setHandoverFuel(Number(e.target.value))}
                            style={{ width: '100%', marginTop: '4px' }}
                          />
                        </div>
                      </div>

                      {/* DISPATCH INSPECTION PHOTOS (HELD LOCALLY UNTIL SUBMIT) */}
                      <div style={{ marginTop: '1rem', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.875rem', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '4px' }}>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text)' }}>
                            Trip Dispatch Vehicle Photos *
                          </label>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                            Capture odometer, fuel meter, and vehicle body condition (staged locally until save)
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <label
                            htmlFor="handover-photo-upload"
                            className="button secondary small"
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            📷 Choose Dispatch Photos
                          </label>
                          <input
                            id="handover-photo-upload"
                            type="file"
                            multiple
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={e => {
                              if (!e.target.files || e.target.files.length === 0) return;
                              const files = Array.from(e.target.files);
                              const items = files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }));
                              setHandoverLocalFiles(prev => [...prev, ...items]);
                              if (e.target) e.target.value = '';
                            }}
                          />
                          <span style={{ fontSize: '0.75rem', color: (handoverPhotos.length + handoverLocalFiles.length) > 0 ? '#10b981' : 'var(--muted)' }}>
                            {(handoverPhotos.length + handoverLocalFiles.length) > 0
                              ? `✓ ${handoverPhotos.length + handoverLocalFiles.length} photo(s) attached (${handoverLocalFiles.length} staged locally)`
                              : 'Upload photos or primary vehicle photo will be linked'}
                          </span>
                        </div>

                        {/* Photos Grid */}
                        {(handoverPhotos.length > 0 || handoverLocalFiles.length > 0) && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
                            {handoverPhotos.map((photoUrl, pIdx) => (
                              <div key={`remote-${pIdx}`} style={{ position: 'relative', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                <img src={photoUrl} alt={`Dispatch photo ${pIdx + 1}`} style={{ width: '100%', height: '75px', objectFit: 'cover', display: 'block' }} />
                                <button
                                  type="button"
                                  onClick={() => setHandoverPhotos(prev => prev.filter((_, i) => i !== pIdx))}
                                  title="Remove photo"
                                  style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    background: 'rgba(239, 68, 68, 0.9)',
                                    color: '#fff',
                                    border: 'none',
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: '0.625rem',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            {handoverLocalFiles.map((item, lIdx) => (
                              <div key={`local-${lIdx}`} style={{ position: 'relative', borderRadius: '4px', overflow: 'hidden', border: '1px dashed #10b981' }}>
                                <img src={item.previewUrl} alt={`Local Dispatch ${lIdx + 1}`} style={{ width: '100%', height: '75px', objectFit: 'cover', display: 'block' }} />
                                <span style={{ position: 'absolute', bottom: '2px', left: '2px', background: 'rgba(16, 185, 129, 0.9)', color: '#fff', fontSize: '0.5rem', padding: '1px 3px', borderRadius: '2px', fontWeight: 700 }}>Staged</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    URL.revokeObjectURL(item.previewUrl);
                                    setHandoverLocalFiles(prev => prev.filter((_, i) => i !== lIdx));
                                  }}
                                  title="Remove photo"
                                  style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    background: 'rgba(239, 68, 68, 0.9)',
                                    color: '#fff',
                                    border: 'none',
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: '0.625rem',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={handoverKeyReleased}
                            onChange={e => setHandoverKeyReleased(e.target.checked)}
                          />
                          <span style={{ fontWeight: 600 }}>Physical key and vehicle documents handed over to verified driver</span>
                        </label>
                      </div>

                      <div style={{ marginTop: '1rem' }}>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Handover Condition Notes</label>
                        <textarea
                          className="input"
                          rows={2}
                          value={handoverNotes}
                          onChange={e => setHandoverNotes(e.target.value)}
                          style={{ width: '100%', marginTop: '4px' }}
                        />
                      </div>

                      {(() => {
                        const outstanding = Number(activePaymentSummary?.outstandingPaise || activeBooking.outstandingBalancePaise || 0);
                        const isHandoverBlocked = actionBusy || activeBooking.kycStatus !== 'VERIFIED' || outstanding > 0;

                        return (
                          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button type="button" className="btn-secondary button secondary" onClick={() => setActiveBooking(null)}>Cancel</button>
                            <button
                              type="submit"
                              className="btn-primary btn-gold button primary"
                              disabled={isHandoverBlocked}
                              title={outstanding > 0 ? 'Vehicle release blocked: outstanding rental balance must be settled.' : undefined}
                            >
                              {outstanding > 0
                                ? 'Handover Blocked: Unpaid Balance'
                                : (actionBusy ? 'Uploading Photos & Confirming…' : 'Confirm Handover & Start Trip')}
                            </button>
                          </div>
                        );
                      })()}
                    </form>
                  )}
                </div>
              )}

              {/* TAB 4: RETURN */}
              {bookingDrawerTab === 'return' && (
                <div>
                  {(activeBooking.status === 'SETTLED' || activeBooking.status === 'RETURN_INSPECTED' || activeBooking.trip?.isSettled || activeBooking.trip?.returnOdometerKm != null) && !editReturnSettlement ? (
                    /* COMPLETED SETTLEMENT VIEW (SHOWS FINAL CALCULATED AMOUNT & REFUND INSTEAD OF UPLOAD WORKFLOW) */
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid #10b981', borderRadius: '8px', padding: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.25rem' }}>🏁</span>
                          <div>
                            <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.05rem' }}>
                              {activeBooking.trip?.isSettled ? 'Final Trip Settlement Completed & Closed' : 'Vehicle Return Inspected — Settlement Reconciled'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                              Post-trip inspection recorded. Deposit refund and extra charges calculated accurately.
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="button secondary small"
                          onClick={() => setEditReturnSettlement(true)}
                          style={{ fontSize: '0.75rem' }}
                        >
                          ✏️ Re-inspect / Amend Settlement
                        </button>
                      </div>

                      {/* Section 1: Telemetry & Odometer Audit */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', background: 'var(--surface)', padding: '0.875rem', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>START ODOMETER</span>
                          <div style={{ fontWeight: 700 }}>{activeBooking.trip?.pickupOdometerKm ?? '—'} km</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>RETURN ODOMETER</span>
                          <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{activeBooking.trip?.returnOdometerKm ?? returnOdometer} km</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>DISTANCE DRIVEN</span>
                          <div style={{ fontWeight: 800, color: '#f59e0b' }}>
                            {activeBooking.trip?.returnOdometerKm && activeBooking.trip?.pickupOdometerKm
                              ? `${activeBooking.trip.returnOdometerKm - activeBooking.trip.pickupOdometerKm} km`
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>EXCESS KILOMETRES</span>
                          <div style={{ fontWeight: 700, color: (activeBooking.trip?.excessKm || 0) > 0 ? '#ef4444' : '#10b981' }}>
                            {activeBooking.trip?.excessKm || 0} km
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>RETURN FUEL LEVEL</span>
                          <div style={{ fontWeight: 700, color: '#10b981' }}>{activeBooking.trip?.returnFuelPercent ?? returnFuel}%</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>KEYS RECEIVED</span>
                          <div style={{ fontWeight: 700, color: '#10b981' }}>Yes (Customer Signed)</div>
                        </div>
                      </div>

                      {/* Section 2: Financial Reconciliation Breakdown */}
                      <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                          Financial Reconciliation & Deductions Breakdown
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                          <div style={{ padding: '0.5rem', background: 'var(--surface-secondary)', borderRadius: '4px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>SECURITY DEPOSIT COLLECTED</span>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{formatRupees(activeBooking.securityDepositPaise)}</div>
                          </div>
                          <div style={{ padding: '0.5rem', background: 'var(--surface-secondary)', borderRadius: '4px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>EXCESS KM CHARGE</span>
                            <div style={{ fontWeight: 700, color: Number(activeBooking.trip?.excessKmChargePaise || 0) > 0 ? '#ef4444' : 'var(--text)' }}>
                              {formatRupees(activeBooking.trip?.excessKmChargePaise || 0)}
                            </div>
                          </div>
                          <div style={{ padding: '0.5rem', background: 'var(--surface-secondary)', borderRadius: '4px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>FUEL REFILL CHARGE</span>
                            <div style={{ fontWeight: 700, color: Number(activeBooking.trip?.fuelRefillChargePaise || 0) > 0 ? '#ef4444' : 'var(--text)' }}>
                              {formatRupees(activeBooking.trip?.fuelRefillChargePaise || 0)}
                            </div>
                          </div>
                          <div style={{ padding: '0.5rem', background: 'var(--surface-secondary)', borderRadius: '4px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>DAMAGE CLAIM CHARGE</span>
                            <div style={{ fontWeight: 700, color: Number(activeBooking.trip?.damageChargePaise || 0) > 0 ? '#ef4444' : 'var(--text)' }}>
                              {formatRupees(activeBooking.trip?.damageChargePaise || 0)}
                            </div>
                          </div>
                          <div style={{ padding: '0.5rem', background: 'var(--surface-secondary)', borderRadius: '4px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>TOTAL EXTRA DEDUCTIONS</span>
                            <div style={{ fontWeight: 800, color: '#ef4444', fontSize: '1rem' }}>
                              {formatRupees(activeBooking.trip?.totalAdditionalChargesPaise || 0)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Final Refund Box */}
                      {(() => {
                        const depositRupees = Number(activeBooking.securityDepositPaise) / 100;
                        const totalExtraRupees = Number(activeBooking.trip?.totalAdditionalChargesPaise || 0) / 100;
                        const refundRupees = activeBooking.trip?.depositRefundPaise != null
                          ? Number(activeBooking.trip.depositRefundPaise) / 100
                          : Math.max(0, depositRupees - totalExtraRupees);
                        const isExtraDue = totalExtraRupees > depositRupees;

                        return (
                          <div style={{
                            padding: '1rem 1.25rem',
                            borderRadius: '8px',
                            background: isExtraDue ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.15)',
                            border: isExtraDue ? '1px solid #ef4444' : '1px solid #10b981',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '12px',
                            marginBottom: '1rem',
                          }}>
                            <div>
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: isExtraDue ? '#ef4444' : '#10b981', letterSpacing: '0.05em' }}>
                                {isExtraDue ? '⚠️ ADDITIONAL BALANCE DUE FROM CUSTOMER' : 'FINAL CALCULATED SECURITY DEPOSIT REFUND'}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '2px' }}>
                                {isExtraDue
                                  ? `Extra charges exceed the ₹${depositRupees.toLocaleString('en-IN')} security deposit.`
                                  : `Security deposit of ₹${depositRupees.toLocaleString('en-IN')} minus ₹${totalExtraRupees.toLocaleString('en-IN')} deductions.`}
                              </div>
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: isExtraDue ? '#ef4444' : '#10b981' }}>
                              ₹{isExtraDue ? (totalExtraRupees - depositRupees).toLocaleString('en-IN') : refundRupees.toLocaleString('en-IN')}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Section 4: Condition Notes */}
                      <div style={{ background: 'var(--surface)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block', marginBottom: '2px' }}>RETURN INSPECTION CONDITION NOTES</span>
                        <div style={{ fontSize: '0.85rem' }}>{activeBooking.trip?.returnNotes || returnNotes}</div>
                      </div>

                      {/* Section 5: Return Inspection Photos */}
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                          RETURN INSPECTION PHOTOS ({Array.isArray(activeBooking.trip?.returnPhotos) ? activeBooking.trip.returnPhotos.length : 0})
                        </span>
                        {Array.isArray(activeBooking.trip?.returnPhotos) && activeBooking.trip.returnPhotos.length > 0 ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
                            {activeBooking.trip.returnPhotos.map((photoUrl: string, idx: number) => (
                              <div key={idx} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                <img
                                  src={photoUrl}
                                  alt={`Return ${idx + 1}`}
                                  onClick={() => setLightboxModal({ url: photoUrl, title: `Return Inspection Photo #${idx + 1}` })}
                                  style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setLightboxModal({ url: photoUrl, title: `Return Inspection Photo #${idx + 1}` })}
                                  style={{ position: 'absolute', bottom: '2px', right: '2px', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: '0.625rem', padding: '1px 5px', borderRadius: '3px', border: 'none', cursor: 'pointer' }}
                                >
                                  Enlarge 🔍
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                            Primary fleet vehicle photo linked on return file.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* RETURN FORM (FOR RECORDING RETURN) */
                    <form onSubmit={handleReturnSubmit}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', margin: 0 }}>
                          Post-trip inspection. Document return odometer, fuel refill charges, and any new damage for deposit reconciliation.
                        </p>
                        {editReturnSettlement && (
                          <button type="button" className="button secondary small" onClick={() => setEditReturnSettlement(false)}>
                            Cancel
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Return Odometer (km) *</label>
                          <input
                            type="number"
                            className="input"
                            required
                            value={returnOdometer}
                            onChange={e => setReturnOdometer(Number(e.target.value))}
                            style={{ width: '100%', marginTop: '4px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Return Fuel Level (%) *</label>
                          <input
                            type="number"
                            className="input"
                            min={0}
                            max={100}
                            required
                            value={returnFuel}
                            onChange={e => setReturnFuel(Number(e.target.value))}
                            style={{ width: '100%', marginTop: '4px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Excess Kilometres</label>
                          <input
                            type="number"
                            className="input"
                            min={0}
                            value={returnExcessKm}
                            onChange={e => {
                              const km = Number(e.target.value);
                              setReturnExcessKm(km);
                              setReturnExcessKmChargeRupees(km * 12);
                            }}
                            style={{ width: '100%', marginTop: '4px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Excess Km Charge (₹)</label>
                          <input
                            type="number"
                            className="input"
                            min={0}
                            value={returnExcessKmChargeRupees}
                            onChange={e => setReturnExcessKmChargeRupees(Number(e.target.value))}
                            style={{ width: '100%', marginTop: '4px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Damage Claim Charge (₹)</label>
                          <input
                            type="number"
                            className="input"
                            min={0}
                            value={returnDamageChargeRupees}
                            onChange={e => setReturnDamageChargeRupees(Number(e.target.value))}
                            style={{ width: '100%', marginTop: '4px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '1.75rem' }}>
                            <input
                              type="checkbox"
                              checked={returnKeyReceived}
                              onChange={e => setReturnKeyReceived(e.target.checked)}
                            />
                            <span style={{ fontWeight: 600 }}>Physical keys & vehicle documents received back</span>
                          </label>
                        </div>
                      </div>

                      {/* LIVE SETTLEMENT CALCULATION PREVIEW */}
                      {(() => {
                        const deposit = Number(activeBooking.securityDepositPaise) / 100;
                        const deductions = returnExcessKmChargeRupees + returnDamageChargeRupees;
                        const estRefund = Math.max(0, deposit - deductions);
                        return (
                          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--surface-secondary)', border: '1px solid var(--border)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ fontSize: '0.8125rem' }}>
                              Security Deposit: <strong>₹{deposit.toLocaleString('en-IN')}</strong> − Deductions: <strong style={{ color: '#ef4444' }}>₹{deductions.toLocaleString('en-IN')}</strong>
                            </div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#10b981' }}>
                              Estimated Net Refund: ₹{estRefund.toLocaleString('en-IN')}
                            </div>
                          </div>
                        );
                      })()}

                      {/* RETURN INSPECTION PHOTOS (HELD LOCALLY UNTIL SUBMIT) */}
                      <div style={{ marginTop: '1rem', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.875rem', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '4px' }}>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text)' }}>
                            Return Inspection Photos *
                          </label>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                            Capture return odometer, fuel meter, and body condition (staged locally until save)
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <label
                            htmlFor="return-photo-upload"
                            className="button secondary small"
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            📷 Choose Return Photos
                          </label>
                          <input
                            id="return-photo-upload"
                            type="file"
                            multiple
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={e => {
                              if (!e.target.files || e.target.files.length === 0) return;
                              const files = Array.from(e.target.files);
                              const items = files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }));
                              setReturnLocalFiles(prev => [...prev, ...items]);
                              if (e.target) e.target.value = '';
                            }}
                          />
                          <span style={{ fontSize: '0.75rem', color: (returnPhotos.length + returnLocalFiles.length) > 0 ? '#10b981' : 'var(--muted)' }}>
                            {(returnPhotos.length + returnLocalFiles.length) > 0
                              ? `✓ ${returnPhotos.length + returnLocalFiles.length} photo(s) attached (${returnLocalFiles.length} staged locally)`
                              : 'Upload photos or primary vehicle photo will be linked'}
                          </span>
                        </div>

                        {/* Return Photos Grid */}
                        {(returnPhotos.length > 0 || returnLocalFiles.length > 0) && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
                            {returnPhotos.map((photoUrl, pIdx) => (
                              <div key={`remote-${pIdx}`} style={{ position: 'relative', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                <img src={photoUrl} alt={`Return photo ${pIdx + 1}`} style={{ width: '100%', height: '75px', objectFit: 'cover', display: 'block' }} />
                                <button
                                  type="button"
                                  onClick={() => setReturnPhotos(prev => prev.filter((_, i) => i !== pIdx))}
                                  title="Remove photo"
                                  style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    background: 'rgba(239, 68, 68, 0.9)',
                                    color: '#fff',
                                    border: 'none',
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: '0.625rem',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            {returnLocalFiles.map((item, lIdx) => (
                              <div key={`local-${lIdx}`} style={{ position: 'relative', borderRadius: '4px', overflow: 'hidden', border: '1px dashed #10b981' }}>
                                <img src={item.previewUrl} alt={`Local Return ${lIdx + 1}`} style={{ width: '100%', height: '75px', objectFit: 'cover', display: 'block' }} />
                                <span style={{ position: 'absolute', bottom: '2px', left: '2px', background: 'rgba(16, 185, 129, 0.9)', color: '#fff', fontSize: '0.5rem', padding: '1px 3px', borderRadius: '2px', fontWeight: 700 }}>Staged</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    URL.revokeObjectURL(item.previewUrl);
                                    setReturnLocalFiles(prev => prev.filter((_, i) => i !== lIdx));
                                  }}
                                  title="Remove photo"
                                  style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    background: 'rgba(239, 68, 68, 0.9)',
                                    color: '#fff',
                                    border: 'none',
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: '0.625rem',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: '1rem' }}>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Return Condition & Damage Notes</label>
                        <textarea
                          className="input"
                          rows={2}
                          value={returnNotes}
                          onChange={e => setReturnNotes(e.target.value)}
                          style={{ width: '100%', marginTop: '4px' }}
                        />
                      </div>

                      <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <button type="button" className="btn-secondary button secondary" onClick={() => setActiveBooking(null)}>Cancel</button>
                        <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                          {actionBusy ? 'Uploading Photos & Calculating…' : 'Confirm Return & Calculate Settlement'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RECORD COUNTER / OFFLINE PAYMENT MODAL */}
      {recordPaymentModalOpen && activeBooking && (
        <div className="modal-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="modal-dialog" style={{ maxWidth: '520px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="eyebrow">COUNTER / OFFLINE PAYMENT</span>
                <h3 style={{ margin: 0 }}>Record Rental Payment</h3>
                <small style={{ color: 'var(--muted)' }}>Booking #{activeBooking.bookingNumber} • {activeBooking.customer?.displayName || 'Customer'}</small>
              </div>
              <button type="button" className="icon-button" onClick={() => setRecordPaymentModalOpen(false)}>
                <IconCross />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '1.25rem' }}>
              {/* Financial Status Quick Card */}
              <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>OUTSTANDING BALANCE</span>
                  <strong style={{ fontSize: '1.05rem', color: Number(activePaymentSummary?.outstandingPaise || activeBooking.outstandingBalancePaise || 0) > 0 ? '#ef4444' : '#10b981' }}>
                    {formatRupees(activePaymentSummary?.outstandingPaise || activeBooking.outstandingBalancePaise || 0)}
                  </strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>SECURITY DEPOSIT</span>
                  <strong style={{ fontSize: '1.05rem' }}>{formatRupees(activeBooking.securityDepositPaise)}</strong>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>({activeBooking.depositStatus || 'NOT_COLLECTED'})</div>
                </div>
              </div>

              <form onSubmit={handleRecordPaymentSubmit}>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Installment / Payment Type *
                  </label>
                  <select
                    className="input select"
                    value={recordPaymentType}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setRecordPaymentType(val);
                      if (val === 'BALANCE') {
                        const bal = Number(activePaymentSummary?.outstandingPaise || activeBooking.outstandingBalancePaise || 0) / 100;
                        if (bal > 0) setRecordPaymentAmount(bal.toString());
                      } else if (val === 'DEPOSIT') {
                        const dep = Number(activeBooking.securityDepositPaise || 0) / 100;
                        setRecordPaymentAmount(dep.toString());
                      }
                    }}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                  >
                    <option value="BALANCE">Remaining Balance Payment</option>
                    <option value="DEPOSIT">Refundable Security Deposit</option>
                    <option value="ADVANCE">Initial Advance Payment</option>
                    <option value="FULL">Full Rental Fare</option>
                    <option value="ADDITIONAL">Additional / Extension / Penalty Charges</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600, margin: 0 }}>
                      Amount (₹) *
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {Number(activePaymentSummary?.outstandingPaise || activeBooking.outstandingBalancePaise || 0) > 0 && (
                        <button
                          type="button"
                          style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent)', border: '1px solid rgba(245, 158, 11, 0.3)', cursor: 'pointer' }}
                          onClick={() => {
                            setRecordPaymentType('BALANCE');
                            setRecordPaymentAmount((Number(activePaymentSummary?.outstandingPaise || activeBooking.outstandingBalancePaise || 0) / 100).toString());
                          }}
                        >
                          Fill Balance
                        </button>
                      )}
                      {Number(activeBooking.securityDepositPaise || 0) > 0 && (
                        <button
                          type="button"
                          style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'var(--surface-secondary)', border: '1px solid var(--border)', cursor: 'pointer' }}
                          onClick={() => {
                            setRecordPaymentType('DEPOSIT');
                            setRecordPaymentAmount((Number(activeBooking.securityDepositPaise || 0) / 100).toString());
                          }}
                        >
                          Fill Deposit
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="input"
                    required
                    value={recordPaymentAmount}
                    onChange={(e) => setRecordPaymentAmount(e.target.value)}
                    placeholder="e.g. 5000"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Payment Method / Channel *
                  </label>
                  <select
                    className="input select"
                    value={recordPaymentMethod}
                    onChange={(e) => setRecordPaymentMethod(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                  >
                    <option value="CASH">Cash at Hub Counter</option>
                    <option value="UPI_QR">UPI QR Code (Counter Scanner)</option>
                    <option value="POS_CARD">POS Terminal Card Swipe / Tap</option>
                    <option value="BANK_TRANSFER">Direct Bank Transfer (NEFT / IMPS / RTGS)</option>
                    <option value="CHEQUE">Cheque / Demand Draft</option>
                    <option value="OTHER">Other Offline Channel</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Receipt / Transaction Reference (Optional)
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={recordPaymentReference}
                    onChange={(e) => setRecordPaymentReference(e.target.value)}
                    placeholder="e.g. CASH-RCP-1049, UPI-TXN-984129, POS-AUTH-4412"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Staff Remarks / Notes (Optional)
                  </label>
                  <textarea
                    className="input textarea"
                    rows={2}
                    value={recordPaymentNotes}
                    onChange={(e) => setRecordPaymentNotes(e.target.value)}
                    placeholder="e.g. Received counter payment from customer during vehicle handover."
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn-secondary button secondary"
                    onClick={() => setRecordPaymentModalOpen(false)}
                    disabled={recordingPayment}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary btn-gold button primary"
                    disabled={recordingPayment}
                  >
                    {recordingPayment ? 'Recording...' : '✓ Confirm & Record Payment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* OPERATIONS MANUAL CANCEL BOOKING MODAL */}
      {cancelModalOpen && activeBooking && (
        <div className="modal-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="modal-dialog" style={{ maxWidth: '520px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="eyebrow" style={{ color: '#ef4444' }}>OPERATIONS CANCELLATION</span>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                  Cancel Booking #{activeBooking.bookingNumber}
                </h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setCancelModalOpen(false)}
                disabled={cancellingBooking}
              >
                <IconCross />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '1.25rem' }}>
              <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--muted)' }}>Customer:</span>
                  <strong>{activeBooking.customer?.displayName || 'Customer'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--muted)' }}>Vehicle:</span>
                  <strong>{activeBooking.vehicle?.make} {activeBooking.vehicle?.model} ({activeBooking.vehicle?.registrationNumber || 'Fleet'})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--muted)' }}>Current Status:</span>
                  <span className="badge badge-warning">{activeBooking.status}</span>
                </div>
              </div>

              <form onSubmit={handleCancelBookingSubmit}>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Cancellation Reason Category *
                  </label>
                  <select
                    className="input select"
                    value={cancelCategory}
                    onChange={(e) => {
                      const cat = e.target.value as any;
                      setCancelCategory(cat);
                      if (cat === 'KYC_CORRECTION_TIMEOUT') {
                        setCancelReason('Customer did not submit corrected KYC documents within the required verification window.');
                      } else if (cat === 'CUSTOMER_REQUESTED') {
                        setCancelReason('Customer contacted operations requesting to cancel this rental booking.');
                      } else if (cat === 'NO_SHOW') {
                        setCancelReason('Customer did not arrive at pickup hub to collect vehicle.');
                      } else if (cat === 'VEHICLE_UNAVAILABLE') {
                        setCancelReason('Assigned vehicle is undergoing unscheduled maintenance/repairs.');
                      } else if (cat === 'PAYMENT_FAILED_OR_OVERDUE') {
                        setCancelReason('Rental payment schedule is overdue and unpaid.');
                      } else {
                        setCancelReason('Cancelled per operations review.');
                      }
                    }}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                  >
                    <option value="KYC_CORRECTION_TIMEOUT">📄 No KYC Correction Received / Document Timeout</option>
                    <option value="CUSTOMER_REQUESTED">📞 Customer Requested Cancellation (Phone / Support)</option>
                    <option value="NO_SHOW">⏱️ Customer No-Show at Pickup Hub</option>
                    <option value="PAYMENT_FAILED_OR_OVERDUE">💳 Overdue / Failed Rental Payment</option>
                    <option value="VEHICLE_UNAVAILABLE">🚗 Vehicle Mechanical Issue / Unavailable</option>
                    <option value="OPERATIONS_DISCRETION">⚙️ Operations Management Discretion / Other</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Reason / Details (Shown to Customer in Notification) *
                  </label>
                  <textarea
                    className="input textarea"
                    rows={3}
                    required
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Describe why this booking is being cancelled..."
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', resize: 'vertical' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={cancelWaiveFee}
                      onChange={(e) => setCancelWaiveFee(e.target.checked)}
                    />
                    Waive cancellation penalty & refund eligible amount (if any)
                  </label>
                  <small style={{ color: 'var(--muted)', display: 'block', marginTop: '2px', marginLeft: '22px' }}>
                    Also immediately releases vehicle {activeBooking.vehicle?.registrationNumber || ''} back to <strong>AVAILABLE</strong> in fleet.
                  </small>
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Internal Staff Notes (Optional - for audit trail)
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={cancelInternalNotes}
                    onChange={(e) => setCancelInternalNotes(e.target.value)}
                    placeholder="e.g. Spoke with customer Rohan over phone; confirmed refund initiated."
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn-secondary button secondary"
                    onClick={() => setCancelModalOpen(false)}
                    disabled={cancellingBooking}
                  >
                    Keep Booking
                  </button>
                  <button
                    type="submit"
                    className="btn-danger button danger"
                    disabled={cancellingBooking}
                  >
                    {cancellingBooking ? 'Cancelling...' : 'Confirm & Cancel Booking'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX DOCUMENT & PHOTO PREVIEW MODAL */}
      {lightboxModal && (
        <div
          className="modal-overlay"
          onClick={() => setLightboxModal(null)}
          style={{
            zIndex: 2500,
            background: 'rgba(2, 6, 23, 0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '920px',
              width: '100%',
              maxHeight: '92vh',
              background: '#0f172a',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)',
            }}
          >
            <div
              style={{
                padding: '0.875rem 1.25rem',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#091a33',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc' }}>
                {lightboxModal.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <a
                  href={lightboxModal.url}
                  target="_blank"
                  rel="noreferrer"
                  className="button secondary small"
                  style={{ fontSize: '0.75rem', textDecoration: 'none' }}
                >
                  Open in New Tab ↗
                </a>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setLightboxModal(null)}
                  title="Close"
                  style={{ width: '30px', height: '30px', borderRadius: '6px' }}
                >
                  <IconCross />
                </button>
              </div>
            </div>
            <div
              style={{
                flex: 1,
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#020617',
                overflow: 'auto',
              }}
            >
              <img
                src={lightboxModal.url}
                alt={lightboxModal.title}
                style={{
                  maxWidth: '100%',
                  maxHeight: '75vh',
                  objectFit: 'contain',
                  borderRadius: '6px',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
