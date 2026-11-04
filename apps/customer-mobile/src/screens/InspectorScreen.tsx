import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useKeyboard } from '../components/ui';
import {
  ArrowUpDown,
  Bell,
  Calendar,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CloudOff,
  Eye,
  Filter,
  Gauge,
  Images,
  Info,
  LogOut,
  MapPin,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  Tag,
  Trash2,
  User,
  UserCheck,
  X,
} from 'lucide-react-native';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../auth/AuthProvider';
import { api, resolveRequestUrl } from '../api';
import { color, radius, space, useAppTheme } from '../theme';
import { registerForPushNotificationsAsync, type InAppNotification } from '../services/notifications';
import {
  cachedJobsKey,
  cachedTemplateKey,
  enqueueDraft,
  enqueueMedia,
  flushDrafts,
  flushMedia,
  queuedDraftCount,
  queuedMediaCount,
  uriToBase64,
  type DraftPayload,
} from '../services/inspector-sync';

type Assignment = {
  id: string;
  status: string;
  scheduledAt: string | null;
  locationType: string;
  address: string | null;
  instructions: string | null;
  completedAt?: string | null;
  reports?: Array<{
    id: string;
    status: string;
    revision: number;
    submittedAt?: string | null;
    reviewedAt?: string | null;
  }>;
  request: {
    id: string;
    status: string;
    branchId?: string | null;
    lead: {
      id: string;
      referenceCode: string;
      registrationNumber?: string | null;
      sellerName: string;
      sellerPhone: string;
      city: string;
      make: string;
      model: string;
      variant?: string | null;
      manufacturingYear: number;
      fuelType: string;
      transmission: string;
      odometerKm: number;
      inspectionAddress?: string | null;
    };
  };
};

type EvidencePhoto = {
  id: string;
  slotId: string;
  uri: string;
  base64?: string;
  time: string;
  uploaded?: boolean;
};

type Report = {
  id: string;
  assignmentId: string;
  status: string;
  recordVersion: number;
  templateKey: string;
  templateVersion: number;
  identity: Record<string, unknown>;
  answers: Array<{ itemKey: string; status: string; value?: unknown; notes?: string }>;
  defects: Array<{ category: string; severity: string; description: string; location?: string; photoUrl?: string }>;
  media?: Array<{ id: string; logicalMediaId: string; storageKey: string; mimeType: string; capturedAt?: string }>;
  parentReport?: {
    id: string;
    revision: number;
    status: string;
    reviewDecision?: { decision: string; reason?: string | null; createdAt: string };
  };
};

type ChecklistSection = {
  key: string;
  title: string;
  description: string;
  requiredSections?: string[];
};

type ChecklistItem = {
  key: string;
  section: string;
  label: string;
  category?: string;
  critical?: boolean;
  required?: boolean;
  applicableFuel?: string[];
  requiresPhoto?: boolean;
  inputType?: string;
  unit?: string;
};

type Template = {
  sections: ChecklistSection[];
  items: ChecklistItem[];
};

// 16 Standard Guided Photo Slots
const standardPhotoSlots = [
  { id: 'odometer_proof', label: 'Cluster & Odometer', desc: 'Corroborate mileage' },
  { id: 'vin_plate', label: 'Stamped VIN / Chassis Plate', desc: 'Door jamb or engine firewall' },
  { id: 'front_full', label: 'Front Exterior (Full)', desc: 'Bumper, hood, headlamps' },
  { id: 'front_right_45', label: 'Front Right 45° Angle', desc: 'Quarter panel, alloy, tyre profile' },
  { id: 'rear_full', label: 'Rear Exterior (Full)', desc: 'Tailgate, bumper, tail lamps' },
  { id: 'rear_left_45', label: 'Rear Left 45° Angle', desc: 'Quarter panel, boot line, tyre' },
  { id: 'engine_bay', label: 'Engine Compartment', desc: 'Belts, fluid reservoirs, apron welds' },
  { id: 'underbody_front', label: 'Front Underbody & Suspension', desc: 'Tie rods, steering rack, oil sump' },
  { id: 'underbody_rear', label: 'Rear Underbody & Exhaust', desc: 'Silencer, axle, spare tyre well' },
  { id: 'cockpit_dashboard', label: 'Dashboard & Cockpit', desc: 'Steering wheel, AC vents, cluster' },
  { id: 'driver_seat', label: 'Driver Seat & Controls', desc: 'Pedals, seat bolsters, door pads' },
  { id: 'rear_seats', label: 'Rear Cabin & Headliner', desc: 'Seat upholstery, roof lining' },
  { id: 'boot_trunk', label: 'Trunk & Spare Tyre Floor', desc: 'Check for rear-end collision repairs' },
  { id: 'tyre_front_right', label: 'Front Right Tyre Tread', desc: 'Check depth, uneven wear' },
  { id: 'tyre_front_left', label: 'Front Left Tyre Tread', desc: 'Check depth, sidewall cracks' },
  { id: 'rc_smartcard', label: 'Registration Certificate (RC)', desc: 'Physical card or mParivahan record' },
];

type DefectSeverityInfo = { label: string; color: string; bg: string; border: string };
const defaultSeverityInfo: DefectSeverityInfo = { label: 'MINOR', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.14)', border: 'rgba(56, 189, 248, 0.35)' };

const defectSeverityConfig: Record<string, DefectSeverityInfo> = {
  CRITICAL: { label: 'CRITICAL', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.14)', border: 'rgba(239, 68, 68, 0.35)' },
  MAJOR: { label: 'MAJOR', color: '#F97316', bg: 'rgba(249, 115, 22, 0.14)', border: 'rgba(249, 115, 22, 0.35)' },
  MODERATE: { label: 'MODERATE', color: '#EAB308', bg: 'rgba(234, 179, 8, 0.14)', border: 'rgba(234, 179, 8, 0.35)' },
  MINOR: defaultSeverityInfo,
};

function getSeverityConfig(sev: string): DefectSeverityInfo {
  return defectSeverityConfig[sev] ?? defaultSeverityInfo;
}

function formatRefCode(code: string | null | undefined): string {
  if (!code) return 'N/A';
  if (code.length > 12) {
    return code.slice(0, 8).toUpperCase();
  }
  return code.toUpperCase();
}

export function isInvalidRegNumberOrUuid(val: unknown): boolean {
  if (!val || typeof val !== 'string') return true;
  const s = val.trim();
  if (!s) return true;
  // Standard UUID (8-4-4-4-12 hex format)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  // Compact 32-hex UUID
  if (/^[0-9a-f]{32}$/i.test(s)) return true;
  // System internal reference codes (e.g., SL-..., VM-..., REF-..., LEAD-...)
  if (/^(SL-|VM-|REF-|LEAD-)/i.test(s)) return true;
  // Registration numbers in India are max 14 characters and never have 3+ hyphens
  if (s.length > 14 || (s.match(/-/g) || []).length >= 3) return true;
  return false;
}

function formatScheduleDate(dateString: string | null | undefined): string {
  if (!dateString) return 'Appointment Pending';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'Appointment Pending';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = dayNames[d.getDay()];
    const dateNum = d.getDate();
    const monthName = monthNames[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${dayName}, ${dateNum} ${monthName} ${year} · ${hours}:${minutes} ${ampm}`;
  } catch {
    return 'Appointment Pending';
  }
}

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '';
  try {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(dateString).toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function getStatusTheme(status: string) {
  switch (status?.toUpperCase()) {
    case 'ASSIGNED':
      return {
        bg: 'rgba(247, 181, 3, 0.14)',
        border: 'rgba(247, 181, 3, 0.4)',
        text: '#F7B503',
        label: 'ASSIGNED',
      };
    case 'CONFIRMED':
      return {
        bg: 'rgba(52, 211, 153, 0.14)',
        border: 'rgba(52, 211, 153, 0.4)',
        text: '#10B981',
        label: 'CONFIRMED',
      };
    case 'IN_PROGRESS':
      return {
        bg: 'rgba(56, 189, 248, 0.14)',
        border: 'rgba(56, 189, 248, 0.4)',
        text: '#38BDF8',
        label: 'IN PROGRESS',
      };
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return {
        bg: 'rgba(56, 189, 248, 0.14)',
        border: 'rgba(56, 189, 248, 0.4)',
        text: '#38BDF8',
        label: 'IN REVIEW',
      };
    case 'APPROVED':
      return {
        bg: 'rgba(34, 197, 94, 0.14)',
        border: 'rgba(34, 197, 94, 0.4)',
        text: '#10B981',
        label: 'APPROVED',
      };
    case 'COMPLETED':
      return {
        bg: 'rgba(34, 197, 94, 0.14)',
        border: 'rgba(34, 197, 94, 0.4)',
        text: '#10B981',
        label: 'COMPLETED',
      };
    case 'REWORK_REQUIRED':
      return {
        bg: 'rgba(239, 68, 68, 0.14)',
        border: 'rgba(239, 68, 68, 0.4)',
        text: '#EF4444',
        label: 'REWORK REQUIRED',
      };
    case 'RESCHEDULED':
      return {
        bg: 'rgba(251, 146, 60, 0.14)',
        border: 'rgba(251, 146, 60, 0.4)',
        text: '#FB923C',
        label: 'RESCHEDULED',
      };
    default:
      return {
        bg: 'rgba(130, 146, 174, 0.14)',
        border: 'rgba(130, 146, 174, 0.3)',
        text: '#64748B',
        label: (status || 'UNKNOWN').replace(/_/g, ' '),
      };
  }
}

function getLocationTypeTheme(locationType: string | null | undefined) {
  const isHub = locationType?.toUpperCase() === 'HUB';
  return {
    label: isHub ? 'HUB VISIT' : 'DOORSTEP VISIT',
    bg: isHub ? 'rgba(99, 102, 241, 0.14)' : 'rgba(236, 72, 153, 0.14)',
    border: isHub ? 'rgba(99, 102, 241, 0.35)' : 'rgba(236, 72, 153, 0.35)',
    text: isHub ? '#A5B4FC' : '#F472B6',
  };
}

export function InspectorScreen() {
  const insets = useSafeAreaInsets();
  const { theme, mode, setMode, isDark } = useAppTheme();
  const c = theme.colors;

  const color = useMemo(() => ({
    canvas: c.background,
    navy: c.brandNavy,
    headerBg: c.surface,
    surface: c.surface,
    card: c.card,
    raised: c.surfaceSecondary,
    border: c.border,
    input: c.inputBackground,
    yellow: c.brandAccent,
    yellowPressed: c.brandAccentPressed,
    white: isDark ? '#FFFFFF' : c.textPrimary,
    text: c.textPrimary,
    textSecondary: c.textSecondary,
    muted: c.textMuted,
    success: c.success,
    danger: c.error,
    overlay: c.overlay,
  }), [c, isDark]);

  const styles = useMemo(() => createStyles(color, isDark), [color, isDark]);
  const { height: windowHeight } = useWindowDimensions();
  const { isKeyboardVisible, keyboardHeight } = useKeyboard();
  const defectScrollRef = useRef<ScrollView>(null);

  const availableDefectModalHeight = useMemo(() => {
    if (!isKeyboardVisible) {
      return Math.round(windowHeight * 0.85);
    }
    const safeTop = Platform.OS === 'ios' ? insets.top + 16 : 32;
    const computed = windowHeight - keyboardHeight - safeTop;
    return Math.max(computed, 260);
  }, [windowHeight, isKeyboardVisible, keyboardHeight, insets.top]);

  const { user, signOut, setActiveMode } = useAuth();
  const [jobs, setJobs] = useState<Assignment[]>([]);
  const [activeJob, setActiveJob] = useState<Assignment | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [template, setTemplate] = useState<Template>({ sections: [], items: [] });
  const [activeTab, setActiveTab] = useState<'identity' | 'photos' | 'checklist' | 'defects' | 'road_test' | 'review'>('identity');

  // Form State
  const [regNumber, setRegNumber] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [vinChassis, setVinChassis] = useState('');
  const [engineNumber, setEngineNumber] = useState('');
  const [rcVerified, setRcVerified] = useState(false);
  const [insuranceVerified, setInsuranceVerified] = useState(false);
  const [hypothecationDeclared, setHypothecationDeclared] = useState(false);
  const [answers, setAnswers] = useState<Record<string, { status: string; notes?: string }>>({});
  const [defects, setDefects] = useState<Array<{ category: string; severity: string; description: string; location?: string; photoUrl?: string }>>([]);
  const [capturedPhotos, setCapturedPhotos] = useState<Record<string, EvidencePhoto[]>>({});
  const [photoPickerSlot, setPhotoPickerSlot] = useState<string | null>(null);
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);
  const [uploadingPhotoSlot, setUploadingPhotoSlot] = useState<string | null>(null);
  const [roadTestPerformed, setRoadTestPerformed] = useState<'YES' | 'NO'>('YES');
  const [roadTestReason, setRoadTestReason] = useState('');
  const [roadTestNotes, setRoadTestNotes] = useState('');
  const [declaration, setDeclaration] = useState(false);

  // Status & Sync State
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState(0);
  const [pendingPhotos, setPendingPhotos] = useState(0);

  // Defect Modal State
  const [defectModalVisible, setDefectModalVisible] = useState(false);
  const [newDefectCat, setNewDefectCat] = useState('Exterior Body');
  const [newDefectSev, setNewDefectSev] = useState<'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL'>('MINOR');
  const [newDefectDesc, setNewDefectDesc] = useState('');
  const [newDefectLoc, setNewDefectLoc] = useState('');
  const [newDefectPhotoUri, setNewDefectPhotoUri] = useState<string | null>(null);
  const [newDefectPhotoBase64, setNewDefectPhotoBase64] = useState<string | null>(null);
  const [newDefectUploading, setNewDefectUploading] = useState(false);

  // Total Evidence Photos & Completed Slots
  const totalPhotosCount = useMemo(() => {
    return Object.values(capturedPhotos).reduce((acc, list) => acc + (list?.length || 0), 0);
  }, [capturedPhotos]);

  const slotsWithPhotosCount = useMemo(() => {
    return standardPhotoSlots.filter(s => (capturedPhotos[s.id]?.length || 0) > 0).length;
  }, [capturedPhotos]);

  // Inspector Filters & Sorting
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ASSIGNED' | 'IN_PROGRESS' | 'REWORK_REQUIRED' | 'COMPLETED'>('ALL');
  const [sortOrder, setSortOrder] = useState<'newest_assigned' | 'appointment_asc'>('newest_assigned');

  // Inspector In-App Notifications
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);

  // 1. Initial Load of Assigned Jobs, Queue Counts & Notifications
  useEffect(() => {
    void refreshQueueCounts();
    void loadJobs(statusFilter, sortOrder);
    void loadNotifications();
    void registerForPushNotificationsAsync('INSPECTOR');
  }, [user]);

  async function loadNotifications() {
    if (!user) return;
    try {
      const res = await api<{ items: InAppNotification[]; unreadCount: number }>('/api/v2/notifications?limit=30');
      setNotifications(res.items || []);
      setUnreadNotifsCount(res.unreadCount || 0);
    } catch {
      // Offline fallback
    }
  }

  async function markNotificationAsRead(id: string) {
    try {
      await api(`/api/v2/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadNotifsCount(prev => Math.max(0, prev - 1));
    } catch {
      // offline
    }
  }

  async function markAllNotificationsAsRead() {
    try {
      await api('/api/v2/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadNotifsCount(0);
    } catch {
      // offline
    }
  }

  function applyFilter(f: typeof statusFilter) {
    setStatusFilter(f);
    void loadJobs(f, sortOrder);
  }

  function applySort(s: typeof sortOrder) {
    setSortOrder(s);
    void loadJobs(statusFilter, s);
  }

  async function refreshQueueCounts() {
    if (!user) return;
    try {
      const d = await queuedDraftCount(user.id);
      const m = await queuedMediaCount(user.id);
      setPendingDrafts(d);
      setPendingPhotos(m);
    } catch {
      // ignore
    }
  }

  async function loadJobs(filter = statusFilter, sort = sortOrder) {
    if (!user) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (filter && filter !== 'ALL') params.set('status', filter);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const live = await api<Assignment[]>(`/api/v2/inspector/assignments${qs}`);
      setJobs(live);
      try {
        await AsyncStorage.setItem(cachedJobsKey(user.id), JSON.stringify(live));
      } catch (e: any) {
        if (String(e?.message).includes('CursorWindow')) {
          await AsyncStorage.removeItem(cachedJobsKey(user.id)).catch(() => {});
        }
      }
    } catch (err: any) {
      console.warn('[LOAD_ASSIGNMENTS_ERROR]', err?.status, err?.code, err?.message);
      try {
        const cached = await AsyncStorage.getItem(cachedJobsKey(user.id));
        if (cached) {
          setJobs(JSON.parse(cached) as Assignment[]);
          setStatusMessage('Offline Mode · Using cached inspection assignments');
        } else if (err?.code === 'INSPECTION_ACCESS_DENIED' || err?.status === 403) {
          setStatusMessage('Access Denied: Your account does not have Inspector privileges.');
        } else if (err?.code === 'NETWORK_UNREACHABLE' || err?.status === 0) {
          setStatusMessage('Unable to reach server. Please check your internet or host connection.');
        } else {
          setStatusMessage(`Unable to load assignments (${err?.code || err?.message || 'Server error'}).`);
        }
      } catch (storageErr: any) {
        if (String(storageErr?.message).includes('CursorWindow')) {
          await AsyncStorage.removeItem(cachedJobsKey(user.id)).catch(() => {});
        }
        setStatusMessage(`Connection Error (${err?.code || err?.message || 'Server error'}).`);
      }
    } finally {
      setBusy(false);
    }
  }

  // 2. Start / Open Inspection
  async function startInspection(job: Assignment) {
    setActiveJob(job);
    setBusy(true);
    setStatusMessage(null);
    try {
      const startRes = await api<any>(
        `/api/v2/inspector/assignments/${job.id}/start`,
        { method: 'POST' }
      );
      const activeReport: Report = (startRes && (startRes.report || startRes)) as Report;
      setReport(activeReport);

      // Hydrate template if present or fetch it from API
      let activeTemplate: Template = startRes?.template;
      if (!activeTemplate?.sections?.length) {
        const tKey = activeReport.templateKey || 'vehicle-standard';
        const tVer = activeReport.templateVersion || 2;
        try {
          activeTemplate = await api<Template>(`/api/v2/inspector/templates/${tKey}/${tVer}`);
        } catch {
          // ignore
        }
      }
      if (activeTemplate?.sections?.length) {
        setTemplate(activeTemplate);
      }

      // Hydrate existing answers / fields
      const iden = (activeReport.identity || {}) as Record<string, unknown>;
      const rawReportReg = typeof iden.registrationNumber === 'string' ? iden.registrationNumber.trim() : '';
      const rawLeadReg = typeof job.request.lead.registrationNumber === 'string' ? job.request.lead.registrationNumber.trim() : '';

      // Strict fix: Use genuine registrationNumber only. Filter out UUIDs or reference codes!
      const reportReg = !isInvalidRegNumberOrUuid(rawReportReg) ? rawReportReg : '';
      const leadReg = !isInvalidRegNumberOrUuid(rawLeadReg) ? rawLeadReg : '';

      const existingReg = reportReg || leadReg || '';
      setRegNumber(existingReg);
      setOdometerKm(String(iden.odometerKm || job.request.lead.odometerKm || ''));
      setVinChassis(String(iden.vinChassis || ''));
      setEngineNumber(String(iden.engineNumber || ''));
      setRcVerified(Boolean(iden.rcVerified));
      setInsuranceVerified(Boolean(iden.insuranceVerified));
      setHypothecationDeclared(Boolean(iden.hypothecationDeclared));

      const ansMap: Record<string, { status: string; notes?: string }> = {};
      (activeReport.answers || []).forEach(a => {
        ansMap[a.itemKey] = { status: a.status, notes: a.notes };
      });
      setAnswers(ansMap);
      const defectPhotos = (iden.defectPhotos as Record<string, string>) || {};
      setDefects((activeReport.defects || []).map((d: any, idx: number) => ({
        ...d,
        photoUrl: d.photoUrl || defectPhotos[String(idx)] || defectPhotos[d.id] || '',
      })));

      // Hydrate existing media photos into slot collections
      if (Array.isArray(activeReport.media) && activeReport.media.length > 0) {
        const photoMap: Record<string, EvidencePhoto[]> = {};
        activeReport.media.forEach((m: any) => {
          const slot = standardPhotoSlots.find(
            s => m.logicalMediaId === s.id || m.logicalMediaId.startsWith(s.id + '_')
          );
          const slotId = slot ? slot.id : standardPhotoSlots[0]?.id || 'front_full';
          if (!photoMap[slotId]) photoMap[slotId] = [];
          const imageUri = m.storageKey?.startsWith('http')
            ? m.storageKey
            : resolveRequestUrl(`/api/v2/inspector/reports/${activeReport.id}/media/${m.id}/content`);
          photoMap[slotId].push({
            id: m.logicalMediaId || m.id,
            slotId,
            uri: imageUri,
            time: m.capturedAt || new Date().toISOString(),
            uploaded: true,
          });
        });
        setCapturedPhotos(photoMap);
      } else {
        setCapturedPhotos({});
      }
    } catch (err: any) {
      console.warn('[START_INSPECTION_ERROR]', err?.status, err?.code, err?.message);
      Alert.alert('Inspection Error', `Could not start or load evaluation workspace: ${err?.message || err?.code || 'Please check your connection'}`);
    } finally {
      setBusy(false);
    }
  }

  // Navigation-Aware Notification Handler
  async function handleNotificationNavigation(n: InAppNotification) {
    if (!n.read) {
      void markNotificationAsRead(n.id);
    }
    setNotificationsOpen(false);

    const targetId = n.entityId || (n.deepLink ? n.deepLink.match(/([0-9a-fA-F-]{36}|[0-9a-zA-Z_-]+)$/)?.[1] : null);
    if (!targetId) return;

    // 1. Search in current loaded jobs
    let target = jobs.find(j => j.id === targetId || (j.request && (j.request as any).id === targetId));

    // 2. If not found in current filtered subset, reload all assignments
    if (!target && user) {
      try {
        setBusy(true);
        const live = await api<Assignment[]>('/api/v2/inspector/assignments');
        setJobs(live);
        setStatusFilter('ALL');
        target = live.find(j => j.id === targetId || (j.request && (j.request as any).id === targetId));
      } catch (err) {
        console.warn('[NAVIGATE_NOTIFICATION_ERROR]', err);
      } finally {
        setBusy(false);
      }
    }

    if (target) {
      void startInspection(target);
    } else {
      Alert.alert(n.title, n.body, [{ text: 'OK' }]);
    }
  }

  // 3. Save Draft (Local First + Cloud Sync)
  async function saveDraft(silent = false, answersOverride?: Record<string, { status: string; notes?: string }>): Promise<Report | null> {
    if (!activeJob || !report || !user) return null;
    if (!silent) setBusy(true);

    const mergedAnswers = { ...(answersOverride || answers) };

    // Auto-link verified identity checks so standard template requirements are satisfied
    if (regNumber.trim() && !mergedAnswers['identity.registration']) {
      mergedAnswers['identity.registration'] = { status: 'PASS' };
    }
    if (odometerKm.trim() && !mergedAnswers['identity.odometer']) {
      mergedAnswers['identity.odometer'] = { status: 'PASS' };
    }
    if ((vinChassis.trim() || (capturedPhotos['vin_plate']?.length ?? 0) > 0) && !mergedAnswers['identity.vin']) {
      mergedAnswers['identity.vin'] = { status: 'PASS' };
    }
    if ((rcVerified || (capturedPhotos['rc_smartcard']?.length ?? 0) > 0) && !mergedAnswers['identity.rc_document']) {
      mergedAnswers['identity.rc_document'] = { status: 'PASS' };
    }
    if (insuranceVerified && !mergedAnswers['identity.insurance']) {
      mergedAnswers['identity.insurance'] = { status: 'PASS' };
    }
    if (!mergedAnswers['identity.hypothecation']) {
      mergedAnswers['identity.hypothecation'] = { status: 'PASS' };
    }
    if (!mergedAnswers['identity.discrepancy_flag']) {
      mergedAnswers['identity.discrepancy_flag'] = { status: 'PASS' };
    }

    const payload: DraftPayload = {
      identity: {
        registrationNumber: isInvalidRegNumberOrUuid(regNumber) ? '' : regNumber.trim(),
        odometerKm: Number(odometerKm) || 0,
        vinChassis: vinChassis.trim() || undefined,
        engineNumber: engineNumber.trim() || undefined,
        rcVerified,
        insuranceVerified,
        hypothecationDeclared,
        declarationConfirmed: declaration,
        defectPhotos: defects.reduce((acc, d, i) => {
          if (d.photoUrl) acc[String(i)] = d.photoUrl;
          return acc;
        }, {} as Record<string, string>),
      },
      answers: Object.entries(mergedAnswers).map(([itemKey, val]) => ({
        itemKey,
        status: val.status,
        notes: val.notes ? val.notes.trim() : undefined,
      })),
      defects: defects.map(d => ({
        category: d.category,
        severity: d.severity,
        description: d.description.trim(),
        location: d.location ? d.location.trim() : undefined,
        photoUrl: d.photoUrl,
      })),
    };

    try {
      const updated = await api<Report>(`/api/v2/inspector/reports/${report.id}/draft`, {
        method: 'PUT',
        body: JSON.stringify({
          recordVersion: report.recordVersion,
          ...payload,
        }),
      });
      setReport(updated);
      if (answersOverride) setAnswers(mergedAnswers);
      if (!silent) {
        Alert.alert('Draft Saved', 'Evaluation saved to V MOTIV Cloud successfully.');
      }
      return updated;
    } catch (err: any) {
      await enqueueDraft(user.id, report.id, report.recordVersion, payload);
      await refreshQueueCounts();
      if (!silent) {
        Alert.alert('Saved Offline', 'Draft queued locally on device. Will sync automatically when online.');
      }
      if (silent) {
        throw err;
      }
      return null;
    } finally {
      if (!silent) setBusy(false);
    }
  }

  function passAllUnsetChecks() {
    if (!template?.items?.length) return;
    const fuelType = activeJob?.request?.lead?.fuelType;
    setAnswers(prev => {
      const next = { ...prev };
      template.items.forEach(it => {
        if (it.applicableFuel && fuelType && !it.applicableFuel.includes(fuelType as any)) {
          return;
        }
        if (!next[it.key]) {
          next[it.key] = { status: 'PASS' };
        }
      });
      return next;
    });
    Alert.alert('Quick Pass Applied', 'All unset checklist items have been marked as PASS.');
  }

  // 4. Real Photo Capture with Device Camera
  async function takePhotoWithCamera(slotId: string) {
    if (!activeJob || !report || !user) return;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera Permission Required',
          'Please enable camera permissions in device settings to take vehicle inspection photos.'
        );
        return;
      }

      setUploadingPhotoSlot(slotId);
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.65,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await processAndUploadAssets(slotId, result.assets);
      }
    } catch (err: any) {
      console.warn('[CAMERA_CAPTURE_ERROR]', err);
      Alert.alert('Camera Error', err?.message || 'Unable to launch device camera.');
    } finally {
      setUploadingPhotoSlot(null);
      setPhotoPickerSlot(null);
    }
  }

  // 5. Pick Multiple Real Photos from Device Gallery / Storage
  async function pickPhotosFromGallery(slotId: string) {
    if (!activeJob || !report || !user) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo Library Permission Required',
          'Please enable photo library permissions in device settings to attach inspection evidence.'
        );
        return;
      }

      setUploadingPhotoSlot(slotId);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.65,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await processAndUploadAssets(slotId, result.assets);
      }
    } catch (err: any) {
      console.warn('[GALLERY_PICK_ERROR]', err);
      Alert.alert('Gallery Error', err?.message || 'Unable to open photo gallery.');
    } finally {
      setUploadingPhotoSlot(null);
      setPhotoPickerSlot(null);
    }
  }

  // 6. Process Assets, Append to Slot Array, and Upload to Cloudinary / Server
  async function processAndUploadAssets(slotId: string, assets: ImagePicker.ImagePickerAsset[]) {
    if (!activeJob || !report || !user) return;

    const newPhotos: EvidencePhoto[] = assets.map((asset, idx) => ({
      id: `${slotId}_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      slotId,
      uri: asset.uri,
      base64: asset.base64 || undefined,
      time: new Date().toISOString(),
      uploaded: false,
    }));

    // Update state immediately with local URIs for responsive UI preview
    setCapturedPhotos(prev => ({
      ...prev,
      [slotId]: [...(prev[slotId] || []), ...newPhotos],
    }));

    // Upload each photo to the Cloudinary-backed API
    for (const photo of newPhotos) {
      let base64Payload = photo.base64;
      if (!base64Payload && photo.uri) {
        try {
          base64Payload = await uriToBase64(photo.uri);
        } catch (e) {
          console.warn('[CONVERT_URI_TO_BASE64_ERROR]', e);
        }
      }
      if (!base64Payload) continue;

      try {
        await api(`/api/v2/inspector/reports/${report.id}/media/upload-json`, {
          method: 'POST',
          body: JSON.stringify({
            slotId,
            logicalMediaId: photo.id,
            base64Data: base64Payload,
            mimeType: photo.uri.endsWith('.png') ? 'image/png' : 'image/jpeg',
            capturedAt: photo.time,
          }),
        });

        // Mark as uploaded in state and drop base64 to save RAM
        setCapturedPhotos(prev => ({
          ...prev,
          [slotId]: (prev[slotId] || []).map(p => (p.id === photo.id ? { ...p, uploaded: true, base64: undefined } : p)),
        }));
      } catch (err: any) {
        console.warn('[PHOTO_UPLOAD_FAILED]', photo.id, err);
        // PASS PHOTO.URI (NOT BASE64!) TO ENQUEUE MEDIA TO NEVER EXCEED SQLITE 2MB CURSORWINDOW LIMIT!
        await enqueueMedia(user.id, report.id, photo.id, photo.uri, 'image/jpeg');
        await refreshQueueCounts();
      }
    }
  }

  // 7. Delete Photo from Slot
  function deletePhoto(slotId: string, photoId: string) {
    Alert.alert('Remove Evidence Photo', 'Are you sure you want to remove this photo from this checkpoint?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setCapturedPhotos(prev => ({
            ...prev,
            [slotId]: (prev[slotId] || []).filter(p => p.id !== photoId),
          }));
        },
      },
    ]);
  }

  // 7b. Pick or Capture Photo specifically for a Defect finding
  async function pickDefectPhoto(mode: 'camera' | 'library') {
    try {
      setNewDefectUploading(true);
      if (mode === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera Permission Required', 'Please enable camera permissions in settings to take defect photos.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.65,
          base64: true,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          if (asset) {
            setNewDefectPhotoUri(asset.uri);
            setNewDefectPhotoBase64(asset.base64 || null);
          }
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Photo Library Access Required', 'Please enable photo library access in settings to attach a defect photo.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: false,
          quality: 0.65,
          base64: true,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          if (asset) {
            setNewDefectPhotoUri(asset.uri);
            setNewDefectPhotoBase64(asset.base64 || null);
          }
        }
      }
    } catch (e: any) {
      console.warn('[PICK_DEFECT_PHOTO_ERROR]', e);
    } finally {
      setNewDefectUploading(false);
    }
  }

  // 8. Submit Completed Report
  async function submitReport() {
    if (!activeJob || !report) return;
    if (!declaration) {
      Alert.alert('Declaration Required', 'You must sign the truthfulness declaration before submitting.');
      return;
    }
    if (!regNumber.trim() || isInvalidRegNumberOrUuid(regNumber) || !odometerKm.trim()) {
      Alert.alert(
        'Missing Identity Data',
        'Valid physical registration plate number (e.g. KA01MJ1234) and odometer reading are required to submit evaluation.'
      );
      setActiveTab('identity');
      return;
    }

    if (slotsWithPhotosCount < standardPhotoSlots.length) {
      const missing = standardPhotoSlots.filter(s => ((capturedPhotos[s.id]?.length ?? 0) === 0));
      Alert.alert(
        'Incomplete Photographic Proof',
        `All 16 mandatory angles require photographic evidence before submission. Missing (${missing.length}):\n• ${missing.slice(0, 3).map(s => s.label).join('\n• ')}${missing.length > 3 ? `\n...and ${missing.length - 3} more` : ''}`
      );
      return;
    }

    // Check for any unanswered required template items
    const fuelType = activeJob.request.lead.fuelType;
    const applicableRequired = (template?.items || []).filter(
      it => it.required && (!it.applicableFuel || !fuelType || it.applicableFuel.includes(fuelType as any))
    );
    const currentAnswered = { ...answers };
    if (regNumber.trim() && !currentAnswered['identity.registration']) currentAnswered['identity.registration'] = { status: 'PASS' };
    if (odometerKm.trim() && !currentAnswered['identity.odometer']) currentAnswered['identity.odometer'] = { status: 'PASS' };
    if ((vinChassis.trim() || (capturedPhotos['vin_plate']?.length ?? 0) > 0) && !currentAnswered['identity.vin']) currentAnswered['identity.vin'] = { status: 'PASS' };
    if ((rcVerified || (capturedPhotos['rc_smartcard']?.length ?? 0) > 0) && !currentAnswered['identity.rc_document']) currentAnswered['identity.rc_document'] = { status: 'PASS' };
    if (insuranceVerified && !currentAnswered['identity.insurance']) currentAnswered['identity.insurance'] = { status: 'PASS' };
    if (!currentAnswered['identity.hypothecation']) currentAnswered['identity.hypothecation'] = { status: 'PASS' };
    if (!currentAnswered['identity.discrepancy_flag']) currentAnswered['identity.discrepancy_flag'] = { status: 'PASS' };

    const missingItems = applicableRequired.filter(it => !currentAnswered[it.key]);
    if (missingItems.length > 0) {
      Alert.alert(
        'Unanswered Checkpoints',
        `There are ${missingItems.length} checklist items that haven't been evaluated yet. Would you like to mark all remaining items as PASS and proceed with submission?`,
        [
          { text: 'Review Checklist', style: 'cancel' },
          {
            text: 'Pass Remaining & Submit',
            onPress: () => {
              const merged = { ...currentAnswered };
              missingItems.forEach(it => {
                merged[it.key] = { status: 'PASS' };
              });
              setAnswers(merged);
              void executeSubmit(merged);
            },
          },
        ]
      );
      return;
    }

    await executeSubmit(currentAnswered);
  }

  async function executeSubmit(answersToSubmit?: Record<string, { status: string; notes?: string }>) {
    if (!activeJob || !report) return;
    setBusy(true);
    try {
      const updated = await saveDraft(true, answersToSubmit);
      const targetVersion = updated?.recordVersion ?? report.recordVersion;
      await api(`/api/v2/inspector/reports/${report.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ recordVersion: targetVersion }),
      });
      Alert.alert(
        'Inspection Submitted',
        'Your evaluation report and evidence have been sealed and forwarded to the Independent Quality Review team.',
        [{ text: 'OK', onPress: () => { setActiveJob(null); void loadJobs(); } }]
      );
    } catch (err: any) {
      let message = err?.message || 'Unable to submit report. Ensure all checks are complete.';
      if (err?.code === 'INVALID_INPUT' || message === 'INVALID_INPUT') {
        message = 'Some report details are incomplete or invalid. Please review identity and checklist entries.';
      } else if (message.startsWith('MISSING_REQUIRED_CHECK:')) {
        const checkKey = message.split(':')[1] || '';
        message = `Mandatory check "${checkKey.replace(/[._]/g, ' ')}" must be evaluated.`;
      } else if (message.startsWith('REASON_REQUIRED_FOR_UNTESTED:')) {
        const checkKey = message.split(':')[1] || '';
        message = `Documented reason is required for untested/N.A. item: "${checkKey.replace(/[._]/g, ' ')}".`;
      } else if (message === 'INSPECTION_IDENTITY_INCOMPLETE') {
        message = 'Valid registration number and odometer reading are required.';
      } else if (message === 'INSPECTION_REPORT_VERSION_CONFLICT') {
        message = 'Report was updated on another session. Please reopen and try again.';
      }
      Alert.alert('Submission Error', message);
    } finally {
      setBusy(false);
    }
  }

  // 6. Sync All Pending Queues
  async function syncAllPending() {
    if (!user) return;
    setBusy(true);
    try {
      await flushDrafts(user.id, async item => {
        await api(`/api/v2/inspector/reports/${item.reportId}/draft`, {
          method: 'PUT',
          body: JSON.stringify({ recordVersion: item.recordVersion, ...item.payload }),
        });
      });
      await flushMedia(user.id, async item => {
        await api(`/api/v2/inspector/reports/${item.reportId}/media/upload-json`, {
          method: 'POST',
          body: JSON.stringify({
            slotId: item.logicalMediaId,
            logicalMediaId: item.logicalMediaId,
            base64Data: item.base64Data,
            mimeType: item.mimeType,
            capturedAt: item.createdAt,
          }),
        });
      });
      await refreshQueueCounts();
      Alert.alert('Sync Complete', 'All offline drafts and photographic evidence successfully uploaded.');
    } catch {
      Alert.alert('Sync Paused', 'Some evidence remains queued. Network might be unstable.');
    } finally {
      setBusy(false);
    }
  }

  // --- WORKSPACE VIEW (Active Inspection) ---
  if (activeJob && report) {
    const isReadOnly = ['SUBMITTED', 'APPROVED', 'REJECTED'].includes(report.status);

    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Workspace Top Bar */}
        <View style={[styles.workspaceHeader, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <Pressable style={styles.backButton} onPress={() => setActiveJob(null)}>
            <Text style={styles.backButtonText}>‹ Jobs</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.workspaceKicker} numberOfLines={1} ellipsizeMode="tail">
              EVALUATION · #{formatRefCode(activeJob.request.lead.referenceCode)}
            </Text>
            <Text style={[styles.workspaceVehicle, { color: c.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
              {activeJob.request.lead.manufacturingYear} {activeJob.request.lead.make} {activeJob.request.lead.model}
            </Text>
          </View>
          {isReadOnly ? (
            <View style={{ paddingHorizontal: space.sm, paddingVertical: 4, backgroundColor: color.card, borderRadius: radius.sm, borderWidth: 1, borderColor: color.border }}>
              <Text style={{ color: color.yellow, fontSize: 11, fontWeight: '700' }}>{report.status}</Text>
            </View>
          ) : (
            <Pressable style={styles.btnSmallYellow} onPress={() => void saveDraft()} disabled={busy}>
              <Text style={styles.btnSmallYellowText}>{busy ? '…' : 'Save Draft'}</Text>
            </Pressable>
          )}
        </View>

        {isReadOnly && (
          <View style={{ backgroundColor: color.raised, paddingVertical: space.xs, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: 1, borderColor: color.border }}>
            <CheckCircle2 size={16} color={color.yellow} />
            <Text style={{ color: color.white, fontSize: 12, fontWeight: '600', flex: 1 }}>
              Report {report.status} · Read-only audit view
            </Text>
          </View>
        )}

        {report.parentReport?.reviewDecision?.reason && (
          <View style={{ backgroundColor: 'rgba(234, 179, 8, 0.12)', borderBottomWidth: 1, borderColor: 'rgba(234, 179, 8, 0.35)', paddingVertical: space.sm, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
            <Info size={16} color={color.yellow} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: color.yellow, fontSize: 12, fontWeight: '700' }}>Reviewer Correction Instructions</Text>
              <Text style={{ color: color.white, fontSize: 12, marginTop: 2 }}>{report.parentReport.reviewDecision.reason}</Text>
            </View>
          </View>
        )}

        {/* Tab Navigation Strip */}
        <View style={[styles.tabsContainer, { backgroundColor: c.surface, borderColor: c.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {[
              { id: 'identity', label: '1. Identity' },
              { id: 'photos', label: `2. Photos (${slotsWithPhotosCount}/16)` },
              { id: 'checklist', label: '3. 16-Checks' },
              { id: 'defects', label: `4. Defects (${defects.length})` },
              { id: 'road_test', label: '5. Road Test' },
              { id: 'review', label: '6. Review & Submit' },
            ].map(t => (
              <Pressable
                key={t.id}
                style={[styles.tabButton, activeTab === t.id && styles.tabButtonActive]}
                onPress={() => setActiveTab(t.id as any)}
              >
                <Text style={[styles.tabButtonText, activeTab === t.id && styles.tabButtonTextActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Tab Content */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'position'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.contentScroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
          {/* TAB 1: IDENTITY */}
          {activeTab === 'identity' && (
            <View style={styles.formSection}>
              <Text style={styles.sectionHeader}>Vehicle Identity & Verification</Text>
              <Text style={styles.sectionSub}>Verify physical markings on the car against customer declared data.</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Observed Registration Plate *</Text>
                <TextInput
                  style={styles.textInput}
                  value={regNumber}
                  onChangeText={txt => setRegNumber(txt.toUpperCase().replace(/\s+/g, ''))}
                  placeholder="e.g. KA01MJ1234"
                  placeholderTextColor={color.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                {activeJob.request.lead.registrationNumber && !isInvalidRegNumberOrUuid(activeJob.request.lead.registrationNumber) ? (
                  <Text style={styles.inputHint} numberOfLines={1} ellipsizeMode="tail">
                    Declared at enquiry: {activeJob.request.lead.registrationNumber} (Seller: {activeJob.request.lead.sellerName})
                  </Text>
                ) : (
                  <Text style={styles.inputHint} numberOfLines={1} ellipsizeMode="tail">
                    Physical number plate on car (e.g. KA01MJ1234) · Seller: {activeJob.request.lead.sellerName}
                  </Text>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Observed Odometer Reading (km) *</Text>
                <TextInput
                  style={styles.textInput}
                  value={odometerKm}
                  onChangeText={setOdometerKm}
                  keyboardType="numeric"
                  placeholder="e.g. 42500"
                  placeholderTextColor={color.muted}
                />
                <Text style={styles.inputHint}>Declared at enquiry: {activeJob.request.lead.odometerKm} km</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>VIN / Chassis Number</Text>
                <TextInput
                  style={styles.textInput}
                  value={vinChassis}
                  onChangeText={setVinChassis}
                  placeholder="17-character VIN stamped on firewall"
                  placeholderTextColor={color.muted}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Engine Number</Text>
                <TextInput
                  style={styles.textInput}
                  value={engineNumber}
                  onChangeText={setEngineNumber}
                  placeholder="Engine block stamped code"
                  placeholderTextColor={color.muted}
                  autoCapitalize="characters"
                />
              </View>

              <Text style={[styles.sectionHeader, { marginTop: 16 }]}>Document Verification</Text>
              {[
                { label: 'Original Registration Certificate (RC) inspected', val: rcVerified, set: setRcVerified },
                { label: 'Active Insurance Policy inspected', val: insuranceVerified, set: setInsuranceVerified },
                { label: 'Bank Hypothecation declared / checked', val: hypothecationDeclared, set: setHypothecationDeclared },
              ].map((doc, idx) => (
                <Pressable
                  key={idx}
                  style={styles.checkCard}
                  onPress={() => doc.set(!doc.val)}
                >
                  <View style={[styles.checkbox, doc.val && styles.checkboxActive]}>
                    {doc.val ? <Check color={color.navy} size={16} /> : null}
                  </View>
                  <Text style={styles.checkCardLabel}>{doc.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* TAB 2: PHOTOS */}
          {activeTab === 'photos' && (
            <View style={styles.formSection}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sectionHeader}>Guided Photographic Proof</Text>
                  <Text style={styles.sectionSub}>
                    {slotsWithPhotosCount} of 16 mandatory angles completed · {totalPhotosCount} total photos
                  </Text>
                </View>
              </View>

              {standardPhotoSlots.map(slot => {
                const photos = capturedPhotos[slot.id] || [];
                const isCaptured = photos.length > 0;
                const isUploading = uploadingPhotoSlot === slot.id;

                return (
                  <View key={slot.id} style={styles.photoSlotCard}>
                    {/* Slot Header */}
                    <View style={styles.photoSlotHeader}>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={styles.photoSlotTitle} numberOfLines={1} ellipsizeMode="tail">
                          {slot.label}
                        </Text>
                        <Text style={styles.photoSlotDesc} numberOfLines={2} ellipsizeMode="tail">
                          {slot.desc}
                        </Text>
                      </View>

                      {/* Quick Action Buttons */}
                      <View style={styles.photoSlotActions}>
                        <Pressable
                          style={styles.cameraBtn}
                          onPress={() => void takePhotoWithCamera(slot.id)}
                          disabled={isUploading || busy}
                        >
                          <Camera color={color.navy} size={14} />
                          <Text style={styles.cameraBtnText}>Camera</Text>
                        </Pressable>

                        <Pressable
                          style={styles.galleryBtn}
                          onPress={() => void pickPhotosFromGallery(slot.id)}
                          disabled={isUploading || busy}
                        >
                          <Images color={color.yellow} size={14} />
                          <Text style={styles.galleryBtnText}>Gallery</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* Status Row */}
                    <View style={styles.photoStatusRow}>
                      {isUploading ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <ActivityIndicator size="small" color={color.yellow} />
                          <Text style={styles.photoPendingText}>Uploading evidence to cloud...</Text>
                        </View>
                      ) : isCaptured ? (
                        <View style={styles.photoStatusTag}>
                          <CheckCircle2 color={color.success} size={13} />
                          <Text style={styles.photoStatusText}>
                            {photos.length} photo{photos.length > 1 ? 's' : ''} captured
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.photoPendingText}>• Mandatory photo required</Text>
                      )}
                    </View>

                    {/* Thumbnails Gallery Strip */}
                    {photos.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.thumbnailStrip}
                      >
                        {photos.map((item, idx) => (
                          <View key={item.id} style={styles.thumbnailWrap}>
                            <Pressable onPress={() => setPreviewPhotoUri(item.uri)}>
                              <Image source={{ uri: item.uri }} style={styles.thumbnailImg} resizeMode="cover" />
                              <View style={styles.thumbIndexBadge}>
                                <Text style={styles.thumbIndexText}>#{idx + 1}</Text>
                              </View>
                            </Pressable>

                            <Pressable
                              style={styles.thumbDeleteBtn}
                              onPress={() => deletePhoto(slot.id, item.id)}
                              hitSlop={8}
                            >
                              <X color={color.white} size={11} />
                            </Pressable>
                          </View>
                        ))}

                        <Pressable
                          style={styles.addMoreThumbBtn}
                          onPress={() => setPhotoPickerSlot(slot.id)}
                        >
                          <Plus color={color.yellow} size={18} />
                          <Text style={styles.addMoreThumbText}>Add</Text>
                        </Pressable>
                      </ScrollView>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* TAB 3: CHECKLIST */}
          {activeTab === 'checklist' && (
            <View style={styles.formSection}>
              <Text style={styles.sectionHeader}>16-Section Physical Evaluation</Text>
              <Text style={styles.sectionSub}>
                Propulsion: {activeJob.request.lead.fuelType} · Touch finding to evaluate.
              </Text>

              <View style={{ flexDirection: 'row', gap: space.sm, marginVertical: space.sm }}>
                <Pressable
                  style={[styles.btnSmallYellow, { paddingHorizontal: space.md, paddingVertical: space.sm }]}
                  onPress={passAllUnsetChecks}
                >
                  <CheckCircle2 size={15} color={color.navy} />
                  <Text style={[styles.btnSmallYellowText, { fontWeight: '700' }]}>Quick Pass Remaining Checks</Text>
                </Pressable>
              </View>

              {template.sections.map(sec => {
                const secItems = template.items.filter(it => it.section === sec.key);
                if (!secItems.length) return null;

                return (
                  <View key={sec.key} style={styles.checklistSectionCard}>
                    <Text style={styles.secCardTitle} numberOfLines={2}>{sec.title}</Text>
                    <Text style={styles.secCardDesc} numberOfLines={3}>{sec.description}</Text>

                    {secItems.map(item => {
                      const currentAns = answers[item.key]?.status;
                      const notes = answers[item.key]?.notes || '';

                      return (
                        <View key={item.key} style={styles.itemRow}>
                          <Text style={styles.itemLabel} numberOfLines={2} ellipsizeMode="tail">{item.label}</Text>

                          <View style={styles.btnGroup}>
                            {['PASS', 'ISSUE', 'NOT_TESTED', 'NOT_APPLICABLE'].map(s => {
                              const active = currentAns === s;
                              return (
                                <Pressable
                                  key={s}
                                  style={[
                                    styles.statusChoiceBtn,
                                    active && s === 'PASS' && styles.statusPass,
                                    active && s === 'ISSUE' && styles.statusIssue,
                                    active && s === 'NOT_TESTED' && styles.statusUntested,
                                    active && s === 'NOT_APPLICABLE' && styles.statusNA,
                                  ]}
                                  onPress={() => {
                                    setAnswers(prev => ({
                                      ...prev,
                                      [item.key]: { status: s, notes },
                                    }));
                                  }}
                                >
                                  <Text style={[styles.statusChoiceText, active && styles.statusChoiceTextActive]}>
                                    {s === 'NOT_APPLICABLE' ? 'N/A' : s.replace('_', ' ')}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          {(currentAns === 'ISSUE' || currentAns === 'NOT_TESTED' || currentAns === 'NOT_APPLICABLE') && (
                            <TextInput
                              style={styles.itemNotesInput}
                              placeholder="Document reason (mandatory for issue/untested)…"
                              placeholderTextColor={color.muted}
                              value={notes}
                              onChangeText={txt => {
                                setAnswers(prev => ({
                                  ...prev,
                                  [item.key]: { status: currentAns || 'NOT_TESTED', notes: txt },
                                }));
                              }}
                            />
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          )}

          {/* TAB 4: DEFECTS */}
          {activeTab === 'defects' && (
            <View style={styles.formSection}>
              <View style={styles.defectHeaderRow}>
                <View style={styles.defectHeaderTitleCol}>
                  <View style={styles.defectHeaderTitleRow}>
                    <Text style={styles.sectionHeader} numberOfLines={1}>Defect Register</Text>
                    <View style={styles.defectCountBadge}>
                      <Text style={styles.defectCountText}>{defects.length}</Text>
                    </View>
                  </View>
                  <Text style={styles.sectionSub} numberOfLines={2}>
                    Log body scratches, structural damages, leaks, or wear.
                  </Text>
                </View>
                <Pressable
                  style={styles.btnSmallYellow}
                  onPress={() => setDefectModalVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Add Defect"
                >
                  <Plus size={14} color={color.navy} />
                  <Text style={styles.btnSmallYellowText}>Add Defect</Text>
                </Pressable>
              </View>

              {defects.length ? (
                defects.map((d, idx) => {
                  const cfg = getSeverityConfig(d.severity);
                  return (
                    <View key={idx} style={[styles.defectCard, { borderLeftColor: cfg.color }]}>
                      {/* Top Row: Index, Severity, Category, and Delete Button */}
                      <View style={styles.defectCardTopRow}>
                        <View style={styles.defectBadgesRow}>
                          <View style={styles.defectIndexPill}>
                            <Text style={styles.defectIndexText}>#{idx + 1}</Text>
                          </View>
                          <View style={[styles.defectSevBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                            <Text style={[styles.defectSevText, { color: cfg.color }]}>
                              {cfg.label}
                            </Text>
                          </View>
                          <View style={styles.defectCatBadge}>
                            <Text style={styles.defectCatText} numberOfLines={1} ellipsizeMode="tail">
                              {d.category}
                            </Text>
                          </View>
                        </View>
                        <Pressable
                          style={styles.defectDeleteBtn}
                          onPress={() => {
                            Alert.alert(
                              'Delete Defect?',
                              `Remove defect #${idx + 1} (${d.category} - ${d.severity}) from report?`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Delete',
                                  style: 'destructive',
                                  onPress: () => setDefects(prev => prev.filter((_, i) => i !== idx)),
                                },
                              ]
                            );
                          }}
                          hitSlop={6}
                          accessibilityLabel={`Delete defect #${idx + 1}`}
                        >
                          <Trash2 color={color.danger} size={15} />
                        </Pressable>
                      </View>

                      {/* Middle: Defect Description + Photo */}
                      <View style={styles.defectCardBodyRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.defectCardDesc}>
                            {d.description}
                          </Text>

                          {/* Bottom: Defect Location (if present) */}
                          {d.location ? (
                            <View style={styles.defectLocationRow}>
                              <MapPin size={12} color={color.yellow} />
                              <Text style={styles.defectCardLoc} numberOfLines={2} ellipsizeMode="tail">
                                Location: {d.location}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        {d.photoUrl ? (
                          <Pressable
                            style={styles.defectCardPhotoWrap}
                            onPress={() => setPreviewPhotoUri(d.photoUrl || null)}
                            accessibilityLabel="View defect photo"
                          >
                            <Image source={{ uri: d.photoUrl }} style={styles.defectCardPhoto} />
                            <View style={styles.defectCardPhotoPill}>
                              <Eye size={10} color="#FFFFFF" />
                            </View>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyDefectsCard}>
                  <View style={styles.emptyDefectsIconWrap}>
                    <CheckCircle2 color={color.success} size={30} />
                  </View>
                  <Text style={styles.emptyDefectsText}>No Defects Logged</Text>
                  <Text style={styles.emptyDefectsSub}>
                    No physical damages, body scratches, or mechanical issues recorded yet for this vehicle.
                  </Text>
                  <Pressable
                    style={styles.emptyDefectAddBtn}
                    onPress={() => setDefectModalVisible(true)}
                  >
                    <Plus size={14} color={color.navy} />
                    <Text style={styles.emptyDefectAddText}>Log First Defect</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* TAB 5: ROAD TEST */}
          {activeTab === 'road_test' && (
            <View style={styles.formSection}>
              <Text style={styles.sectionHeader}>Dynamic Road Test</Text>
              <Text style={styles.sectionSub}>Evaluate steering alignment, braking straightness, acceleration, and cabin rattles.</Text>

              <Text style={styles.label}>Was Road Test Performed?</Text>
              <View style={styles.roadTestChoiceRow}>
                <Pressable
                  style={[styles.roadTestChoice, roadTestPerformed === 'YES' && styles.roadTestChoiceActive]}
                  onPress={() => setRoadTestPerformed('YES')}
                >
                  <Text style={[styles.roadTestChoiceText, roadTestPerformed === 'YES' && styles.roadTestChoiceTextActive]}>
                    YES · Performed Safely
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.roadTestChoice, roadTestPerformed === 'NO' && styles.roadTestChoiceActive]}
                  onPress={() => setRoadTestPerformed('NO')}
                >
                  <Text style={[styles.roadTestChoiceText, roadTestPerformed === 'NO' && styles.roadTestChoiceTextActive]}>
                    NO · Not Performed
                  </Text>
                </Pressable>
              </View>

              {roadTestPerformed === 'NO' ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Documented Reason Not Performed *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Customer declined, heavy traffic, safety hazard"
                    placeholderTextColor={color.muted}
                    value={roadTestReason}
                    onChangeText={setRoadTestReason}
                  />
                </View>
              ) : (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Road Test Dynamic Observations</Text>
                  <TextInput
                    style={[styles.textInput, { minHeight: 80 }]}
                    placeholder="e.g. Smooth gear shift, straight braking, no wheel bearing noise"
                    placeholderTextColor={color.muted}
                    multiline
                    value={roadTestNotes}
                    onChangeText={setRoadTestNotes}
                  />
                </View>
              )}
            </View>
          )}

          {/* TAB 6: REVIEW & SUBMIT */}
          {activeTab === 'review' && (
            <View style={styles.formSection}>
              <Text style={styles.sectionHeader}>Final Completeness Audit</Text>
              <Text style={styles.sectionSub}>Verify all recorded findings and seal the inspection report.</Text>

              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey} numberOfLines={1}>Registration Plate</Text>
                  <Text style={styles.summaryVal} numberOfLines={1} ellipsizeMode="tail">
                    {regNumber && !isInvalidRegNumberOrUuid(regNumber) ? regNumber : 'Missing'}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey} numberOfLines={1}>Observed Odometer</Text>
                  <Text style={styles.summaryVal} numberOfLines={1} ellipsizeMode="tail">{odometerKm ? `${odometerKm} km` : 'Missing'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey} numberOfLines={1}>Checklist Answered</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Text style={styles.summaryVal} numberOfLines={1} ellipsizeMode="tail">{Object.keys(answers).length} items</Text>
                    {Object.keys(answers).length < (template?.items?.length || 75) && (
                      <Pressable
                        style={[styles.btnSmallYellow, { paddingHorizontal: space.sm, paddingVertical: 3 }]}
                        onPress={passAllUnsetChecks}
                      >
                        <Text style={[styles.btnSmallYellowText, { fontSize: 11 }]}>Pass All</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey} numberOfLines={1}>Defects Logged</Text>
                  <Text style={styles.summaryVal} numberOfLines={1} ellipsizeMode="tail">{defects.length} defects</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey} numberOfLines={1}>Photographic Proof</Text>
                  <Text style={styles.summaryVal} numberOfLines={1} ellipsizeMode="tail">
                    {totalPhotosCount} photos ({slotsWithPhotosCount}/16 angles)
                  </Text>
                </View>
              </View>

              {/* Inspector Declaration */}
              <Pressable
                style={[styles.declarationCard, declaration && styles.declarationCardActive]}
                onPress={() => setDeclaration(!declaration)}
              >
                <View style={[styles.checkbox, declaration && styles.checkboxActive]}>
                  {declaration ? <Check color={color.navy} size={16} /> : null}
                </View>
                <Text style={styles.declarationText}>
                  "I confirm that the recorded observations reflect the physical checks actually performed on this vehicle, and all exceptions and defects have been truthfully documented."
                </Text>
              </Pressable>

              {isReadOnly ? (
                <View style={{ backgroundColor: color.raised, padding: space.md, borderRadius: radius.md, alignItems: 'center', marginTop: space.lg, borderWidth: 1, borderColor: color.border }}>
                  <CheckCircle2 size={24} color={color.yellow} style={{ marginBottom: space.xs }} />
                  <Text style={{ color: color.white, fontWeight: '700', fontSize: 15 }}>Evaluation Sealed</Text>
                  <Text style={{ color: color.muted, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                    This report has been submitted to Independent Quality Review and is locked against further modifications.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: space.md, marginTop: space.lg }}>
                  <Pressable
                    style={[styles.btnPrimary, { backgroundColor: color.raised, borderColor: color.border }]}
                    onPress={() => void saveDraft()}
                    disabled={busy}
                  >
                    <Text style={[styles.btnPrimaryText, { color: color.yellow }]}>
                      {busy ? 'Saving...' : 'Save Local / Cloud Draft'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.btnPrimary, (!declaration || !regNumber.trim() || !odometerKm.trim()) && { opacity: 0.5 }]}
                    onPress={() => void submitReport()}
                    disabled={busy || !declaration || !regNumber.trim() || !odometerKm.trim()}
                  >
                    <Text style={styles.btnPrimaryText}>Submit for Independent Review</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>

        {/* Modal: Add Defect */}
        <Modal
          visible={defectModalVisible}
          transparent
          animationType="slide"
          statusBarTranslucent={true}
          onRequestClose={() => {
            Keyboard.dismiss();
            setDefectModalVisible(false);
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'position'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            style={[
              styles.modalBackdrop,
              Platform.OS === 'android' && isKeyboardVisible ? { paddingBottom: keyboardHeight } : null,
            ]}
          >
            {/* Backdrop Dismiss Area */}
            <TouchableWithoutFeedback
              onPress={() => {
                if (isKeyboardVisible) {
                  Keyboard.dismiss();
                } else {
                  setDefectModalVisible(false);
                }
              }}
            >
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.defectModalSheet, { maxHeight: availableDefectModalHeight }]}>
              {/* Modal Header */}
              <View style={styles.defectModalHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>Add Vehicle Defect</Text>
                  <Text style={styles.modalSub} numberOfLines={1}>Record exception, damage, or wear found</Text>
                </View>
                <Pressable
                  style={styles.modalCloseBtn}
                  onPress={() => {
                    Keyboard.dismiss();
                    setDefectModalVisible(false);
                  }}
                  hitSlop={8}
                >
                  <X color={color.textSecondary} size={20} />
                </Pressable>
              </View>

              {/* Scrollable Form Content */}
              <ScrollView
                ref={defectScrollRef}
                style={styles.defectModalScroll}
                contentContainerStyle={styles.defectModalScrollBody}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.label}>Defect Category</Text>
                <View style={styles.catPickerRow}>
                  {[
                    'Exterior Body',
                    'Structural / Frame',
                    'Engine / Gearbox',
                    'Suspension / Steering',
                    'Interior / Controls',
                    'Electrical / AC',
                  ].map(c => (
                    <Pressable
                      key={c}
                      style={[styles.pickerChip, newDefectCat === c && styles.pickerChipActive]}
                      onPress={() => setNewDefectCat(c)}
                    >
                      <Text style={[styles.pickerChipText, newDefectCat === c && styles.pickerChipTextActive]}>
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.label, { marginTop: 6 }]}>Severity Level</Text>
                <View style={styles.catPickerRow}>
                  {(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] as const).map(s => {
                    const active = newDefectSev === s;
                    const cfg = getSeverityConfig(s);
                    return (
                      <Pressable
                        key={s}
                        style={[
                          styles.sevChip,
                          active && { backgroundColor: cfg.bg, borderColor: cfg.color },
                        ]}
                        onPress={() => setNewDefectSev(s)}
                      >
                        <View style={[styles.sevDot, { backgroundColor: cfg.color }]} />
                        <Text style={[styles.sevChipText, active && { color: cfg.color, fontWeight: '800' }]}>
                          {s}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.label, { marginTop: 6 }]}>Location / Component Part</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Front Right Fender, Radiator Support"
                  placeholderTextColor={color.muted}
                  value={newDefectLoc}
                  onChangeText={setNewDefectLoc}
                  onFocus={() => {
                    setTimeout(() => {
                      defectScrollRef.current?.scrollTo({ y: 120, animated: true });
                    }, 120);
                  }}
                  returnKeyType="next"
                />

                <Text style={[styles.label, { marginTop: 6 }]}>Description of Finding *</Text>
                <TextInput
                  style={[styles.textInput, styles.defectDescInput]}
                  placeholder="Describe observed scratch, deep dent, tear, leak, or rust"
                  placeholderTextColor={color.muted}
                  multiline
                  textAlignVertical="top"
                  value={newDefectDesc}
                  onChangeText={setNewDefectDesc}
                  onFocus={() => {
                    setTimeout(() => {
                      defectScrollRef.current?.scrollToEnd({ animated: true });
                    }, 120);
                  }}
                />

                <Text style={[styles.label, { marginTop: 10 }]}>Defect Evidence Photograph</Text>
                {newDefectPhotoUri ? (
                  <View style={styles.defectPhotoPreviewCard}>
                    <Pressable
                      style={styles.defectPhotoThumbWrap}
                      onPress={() => setPreviewPhotoUri(newDefectPhotoUri)}
                    >
                      <Image source={{ uri: newDefectPhotoUri }} style={styles.defectPhotoThumb} />
                      <View style={styles.defectPhotoZoomPill}>
                        <Eye size={12} color="#FFFFFF" />
                        <Text style={styles.defectPhotoZoomText}>Zoom</Text>
                      </View>
                    </Pressable>
                    <View style={styles.defectPhotoActions}>
                      <Text style={styles.defectPhotoAttachedText}>✓ Evidence Attached</Text>
                      <Pressable
                        style={styles.defectPhotoRemoveBtn}
                        onPress={() => {
                          setNewDefectPhotoUri(null);
                          setNewDefectPhotoBase64(null);
                        }}
                      >
                        <Trash2 size={13} color={color.danger} />
                        <Text style={styles.defectPhotoRemoveText}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.defectPhotoPickerRow}>
                    <Pressable
                      style={styles.defectPhotoPickerBtn}
                      onPress={() => void pickDefectPhoto('camera')}
                      disabled={newDefectUploading}
                    >
                      <Camera size={18} color={color.yellow} />
                      <Text style={styles.defectPhotoPickerBtnText}>Take Photo</Text>
                    </Pressable>
                    <Pressable
                      style={styles.defectPhotoPickerBtn}
                      onPress={() => void pickDefectPhoto('library')}
                      disabled={newDefectUploading}
                    >
                      <Images size={18} color={color.yellow} />
                      <Text style={styles.defectPhotoPickerBtnText}>From Gallery</Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>

              {/* Modal Footer CTA */}
              <View style={[styles.defectModalFooter, { paddingBottom: isKeyboardVisible ? 10 : Math.max(insets.bottom, Platform.OS === 'android' ? 20 : 14) + space.xs }]}>
                <Pressable
                  style={styles.defectCancelBtn}
                  onPress={() => {
                    Keyboard.dismiss();
                    setNewDefectPhotoUri(null);
                    setNewDefectPhotoBase64(null);
                    setDefectModalVisible(false);
                  }}
                >
                  <Text style={styles.defectCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.defectSubmitBtn, (!newDefectDesc.trim() || newDefectUploading) && styles.btnDisabled]}
                  onPress={async () => {
                    if (!newDefectDesc.trim() || newDefectUploading) return;
                    Keyboard.dismiss();
                    let finalPhotoUrl = newDefectPhotoUri || undefined;
                    if (newDefectPhotoBase64 && report) {
                      try {
                        setNewDefectUploading(true);
                        const uploadRes = await api<{ storageKey?: string; url?: string }>(
                          `/api/v2/inspector/reports/${report.id}/media/upload-json`,
                          {
                            method: 'POST',
                            body: JSON.stringify({
                              slotId: 'defects',
                              logicalMediaId: `defect_${Date.now()}`,
                              base64Data: newDefectPhotoBase64,
                              mimeType: newDefectPhotoUri?.endsWith('.png') ? 'image/png' : 'image/jpeg',
                              capturedAt: new Date().toISOString(),
                            }),
                          }
                        );
                        if (uploadRes?.storageKey || uploadRes?.url) {
                          finalPhotoUrl = uploadRes.storageKey || uploadRes.url;
                        }
                      } catch (err) {
                        console.warn('[DEFECT_PHOTO_UPLOAD_FAILED]', err);
                      } finally {
                        setNewDefectUploading(false);
                      }
                    }

                    setDefects(prev => [
                      ...prev,
                      {
                        category: newDefectCat,
                        severity: newDefectSev,
                        description: newDefectDesc.trim(),
                        location: newDefectLoc.trim() || undefined,
                        photoUrl: finalPhotoUrl,
                      },
                    ]);
                    setNewDefectDesc('');
                    setNewDefectLoc('');
                    setNewDefectPhotoUri(null);
                    setNewDefectPhotoBase64(null);
                    setDefectModalVisible(false);
                  }}
                  disabled={!newDefectDesc.trim() || newDefectUploading}
                >
                  <Check size={16} color={color.navy} />
                  <Text style={styles.defectSubmitText}>
                    {newDefectUploading ? 'Uploading Photo...' : 'Add to Report'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Fullscreen Photo Zoom Preview Modal */}
        <Modal
          visible={Boolean(previewPhotoUri)}
          transparent
          animationType="fade"
          statusBarTranslucent={true}
          onRequestClose={() => setPreviewPhotoUri(null)}
        >
          <View style={styles.previewBackdrop}>
            <View style={[styles.previewHeader, { top: Math.max(insets.top, 24) + space.xs }]}>
              <Text style={styles.previewTitle}>Evidence Photo</Text>
              <Pressable
                style={styles.previewCloseBtn}
                onPress={() => setPreviewPhotoUri(null)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close photo preview"
              >
                <X color={color.white} size={20} />
              </Pressable>
            </View>
            {previewPhotoUri && (
              <Image source={{ uri: previewPhotoUri }} style={styles.previewFullImg} resizeMode="contain" />
            )}
          </View>
        </Modal>

        {/* Photo Source Action Sheet Modal (Navigation-Bar Aware & Auto-Resizing) */}
        <Modal
          visible={Boolean(photoPickerSlot)}
          transparent
          animationType="slide"
          statusBarTranslucent={true}
          onRequestClose={() => setPhotoPickerSlot(null)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setPhotoPickerSlot(null)}>
            <Pressable
              style={[
                styles.modalContent,
                styles.photoModalContent,
                { paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 20 : 16) + space.lg },
              ]}
              onPress={e => e.stopPropagation()}
            >
              {/* Sheet Drag Handle */}
              <View style={styles.sheetHandle} />

              <View style={styles.rowBetween}>
                <Text style={styles.modalTitle}>Add Evidence Photos</Text>
                <Pressable
                  onPress={() => setPhotoPickerSlot(null)}
                  hitSlop={8}
                  style={styles.modalCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close photo picker"
                >
                  <X color={color.textSecondary} size={18} />
                </Pressable>
              </View>
              <Text style={styles.sectionSub}>Choose real-time camera capture or select multiple photos from device storage.</Text>

              <View style={{ gap: space.md, marginTop: space.sm }}>
                <Pressable
                  style={styles.photoChoiceBtn}
                  onPress={() => photoPickerSlot && void takePhotoWithCamera(photoPickerSlot)}
                  accessibilityRole="button"
                  accessibilityLabel="Take Photo with Camera"
                >
                  <Camera color={color.navy} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.photoChoiceTitle}>Take Photo with Camera</Text>
                    <Text style={styles.photoChoiceSub}>Snap real-time photo using device camera</Text>
                  </View>
                  <ChevronRight color={color.navy} size={18} />
                </Pressable>

                <Pressable
                  style={[styles.photoChoiceBtn, { backgroundColor: color.input, borderColor: color.border }]}
                  onPress={() => photoPickerSlot && void pickPhotosFromGallery(photoPickerSlot)}
                  accessibilityRole="button"
                  accessibilityLabel="Upload from Gallery or Files"
                >
                  <Images color={color.yellow} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.photoChoiceTitle, { color: color.text }]}>Upload from Gallery / Files</Text>
                    <Text style={styles.photoChoiceSub}>Select multiple photos from device storage</Text>
                  </View>
                  <ChevronRight color={color.yellow} size={18} />
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.photoCancelBtn,
                    pressed && { opacity: 0.75, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0' },
                  ]}
                  onPress={() => setPhotoPickerSlot(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel photo picker"
                >
                  <Text style={styles.photoCancelBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // --- ASSIGNMENTS LIST VIEW ---
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={[styles.mainHeader, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={styles.headerBrandRow}>
          <BrandLogo variant="horizontal" size={24} bodyColor={isDark ? '#FFFFFF' : c.brandNavy} />
          <View style={styles.badgePill}>
            <Text style={styles.badgePillText}>INSPECTOR</Text>
          </View>
        </View>

        <View style={styles.headerRightActions}>
          <Pressable
            style={styles.iconCircle}
            onPress={() => void setMode(isDark ? 'light' : 'dark')}
            accessibilityRole="button"
            accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun color={color.yellow} size={18} /> : <Moon color={color.yellow} size={18} />}
          </Pressable>

          <Pressable style={styles.iconCircle} onPress={() => setNotificationsOpen(true)}>
            <Bell color={unreadNotifsCount > 0 ? color.yellow : color.textSecondary} size={18} />
            {unreadNotifsCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadNotifsCount > 9 ? '9+' : unreadNotifsCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable style={styles.modeSwitchBtn} onPress={() => setActiveMode('customer')}>
            <UserCheck color={color.yellow} size={14} />
            <Text style={styles.modeSwitchText} numberOfLines={1}>Customer</Text>
          </Pressable>

          <Pressable style={styles.iconCircle} onPress={() => void signOut()}>
            <LogOut color={color.textSecondary} size={18} />
          </Pressable>
        </View>
      </View>

      {/* Sync Banner */}
      {(pendingDrafts > 0 || pendingPhotos > 0) && (
        <View style={styles.syncBanner}>
          <View style={styles.syncBannerContent}>
            <CloudOff color={color.yellow} size={16} />
            <Text style={styles.syncBannerText} numberOfLines={1} ellipsizeMode="tail">
              {pendingDrafts} draft(s), {pendingPhotos} photo(s) awaiting cloud sync
            </Text>
          </View>
          <Pressable style={styles.btnSync} onPress={() => void syncAllPending()} disabled={busy}>
            <Text style={styles.btnSyncText}>{busy ? 'Syncing...' : 'Sync Now'}</Text>
          </Pressable>
        </View>
      )}

      {/* Actions Bar */}
      <View style={styles.actionsBar}>
        <View style={styles.actionsBarTitleGroup}>
          <Text style={styles.actionsBarTitle} numberOfLines={1}>Assigned Inspections</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{jobs.length}</Text>
          </View>
        </View>
        <Pressable style={styles.refreshBtn} onPress={() => void loadJobs(statusFilter, sortOrder)} disabled={busy} hitSlop={8}>
          <RefreshCw color={color.yellow} size={14} />
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      </View>

      {/* Filter Section */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScrollView}
          contentContainerStyle={styles.filterPillsScroll}
        >
          {[
            { key: 'ALL', label: 'All' },
            { key: 'ASSIGNED', label: 'Assigned' },
            { key: 'IN_PROGRESS', label: 'In Progress' },
            { key: 'REWORK_REQUIRED', label: 'Rework' },
            { key: 'COMPLETED', label: 'Completed' },
          ].map(tab => {
            const active = statusFilter === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => applyFilter(tab.key as any)}
              >
                <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Sort Selector Bar */}
      <View style={styles.sortSelectorRow}>
        <View style={styles.sortHeader}>
          <ArrowUpDown color={color.muted} size={13} />
          <Text style={styles.sortLabel}>Sort</Text>
        </View>
        <View style={styles.sortSegmentedGroup}>
          <Pressable
            style={[styles.sortSegment, sortOrder === 'newest_assigned' && styles.sortSegmentActive]}
            onPress={() => applySort('newest_assigned')}
          >
            <Text
              style={[styles.sortSegmentText, sortOrder === 'newest_assigned' && styles.sortSegmentTextActive]}
              numberOfLines={1}
            >
              Newest First
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortSegment, sortOrder === 'appointment_asc' && styles.sortSegmentActive]}
            onPress={() => applySort('appointment_asc')}
          >
            <Text
              style={[styles.sortSegmentText, sortOrder === 'appointment_asc' && styles.sortSegmentTextActive]}
              numberOfLines={1}
            >
              Appointment
            </Text>
          </Pressable>
        </View>
      </View>

      {statusMessage ? <Text style={styles.statusToast}>{statusMessage}</Text> : null}

      <ScrollView contentContainerStyle={[styles.jobsListScroll, { paddingBottom: Math.max(insets.bottom, 16) + 40 }]}>
        {busy && <ActivityIndicator color={color.yellow} size="small" style={{ marginVertical: space.md }} />}

        {jobs.length ? (
          jobs.map(job => {
            const latestReport = job.reports?.[0];
            const effectiveStatus = latestReport?.status === 'APPROVED'
              ? 'APPROVED'
              : latestReport?.status === 'SUBMITTED'
              ? 'UNDER_REVIEW'
              : latestReport?.status === 'REWORK_REQUIRED'
              ? 'REWORK_REQUIRED'
              : job.status;
            const statusTheme = getStatusTheme(effectiveStatus);
            const locTheme = getLocationTypeTheme(job.locationType);
            const refFormatted = formatRefCode(job.request.lead.referenceCode);
            const scheduleFormatted = formatScheduleDate(job.scheduledAt);
            const addressText = job.address || job.request.lead.inspectionAddress || job.request.lead.city;

            return (
              <Pressable
                key={job.id}
                style={({ pressed }) => [
                  styles.jobCard,
                  pressed && styles.jobCardPressed,
                ]}
                onPress={() => void startInspection(job)}
              >
                {/* Header Row: Status Badge, Type Badge, and Truncated Reference Tag */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardHeaderBadges}>
                    <View style={[styles.statusBadge, { backgroundColor: statusTheme.bg, borderColor: statusTheme.border }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusTheme.text }]} />
                      <Text style={[styles.statusBadgeText, { color: statusTheme.text }]} numberOfLines={1}>
                        {statusTheme.label}
                      </Text>
                    </View>

                    <View style={[styles.locationBadge, { backgroundColor: locTheme.bg, borderColor: locTheme.border }]}>
                      <Text style={[styles.locationBadgeText, { color: locTheme.text }]} numberOfLines={1}>
                        {locTheme.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.refTagContainer}>
                    <Tag color={color.yellow} size={11} />
                    <Text style={styles.refTagText} numberOfLines={1} ellipsizeMode="tail">
                      JOB #{refFormatted}
                    </Text>
                  </View>
                </View>

                {/* Vehicle Headline */}
                <View style={styles.vehicleTitleBlock}>
                  <Text style={styles.jobVehicle} numberOfLines={2} ellipsizeMode="tail">
                    {job.request.lead.manufacturingYear} {job.request.lead.make} {job.request.lead.model}
                    {job.request.lead.variant ? ` · ${job.request.lead.variant}` : ''}
                  </Text>
                </View>

                {/* Spec Pills (Registration Plate, Fuel, Transmission, Odometer) */}
                <View style={styles.specPillsRow}>
                  {job.request.lead.registrationNumber && !isInvalidRegNumberOrUuid(job.request.lead.registrationNumber) ? (
                    <View style={[styles.specChip, styles.regPlateChip]}>
                      <Tag color={color.yellow} size={11} />
                      <Text style={styles.regPlateChipText} numberOfLines={1}>
                        {job.request.lead.registrationNumber}
                      </Text>
                    </View>
                  ) : null}

                  {(job.request.lead.fuelType || job.request.lead.transmission) ? (
                    <View style={styles.specChip}>
                      <Car color={color.muted} size={12} />
                      <Text style={styles.specChipText} numberOfLines={1}>
                        {[job.request.lead.fuelType, job.request.lead.transmission].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  ) : null}

                  {job.request.lead.odometerKm != null ? (
                    <View style={styles.specChip}>
                      <Gauge color={color.muted} size={12} />
                      <Text style={styles.specChipText} numberOfLines={1}>
                        {job.request.lead.odometerKm.toLocaleString()} km
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Meta Detail Grid */}
                <View style={styles.cardMetaGrid}>
                  {/* Seller Row */}
                  <View style={styles.metaRow}>
                    <View style={styles.metaIconCol}>
                      <User color={color.muted} size={14} />
                    </View>
                    <View style={styles.metaContentCol}>
                      <Text style={styles.metaLabel} numberOfLines={1}>Customer / Seller</Text>
                      <Text style={styles.metaValue} numberOfLines={1} ellipsizeMode="tail">
                        {job.request.lead.sellerName}
                        {job.request.lead.sellerPhone ? ` · ${job.request.lead.sellerPhone}` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Location Row */}
                  <View style={styles.metaRow}>
                    <View style={styles.metaIconCol}>
                      <MapPin color={color.muted} size={14} />
                    </View>
                    <View style={styles.metaContentCol}>
                      <Text style={styles.metaLabel} numberOfLines={1}>Inspection Location</Text>
                      <Text style={styles.metaValue} numberOfLines={2} ellipsizeMode="tail">
                        {addressText}
                      </Text>
                    </View>
                  </View>

                  {/* Schedule Row */}
                  <View style={styles.metaRow}>
                    <View style={styles.metaIconCol}>
                      <Calendar color={color.muted} size={14} />
                    </View>
                    <View style={styles.metaContentCol}>
                      <Text style={styles.metaLabel} numberOfLines={1}>Appointment Schedule</Text>
                      <Text style={styles.metaValueHighlight} numberOfLines={1}>
                        {scheduleFormatted}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Special Instructions Callout */}
                {job.instructions ? (
                  <View style={styles.instructionsCallout}>
                    <View style={styles.instructionsHeaderRow}>
                      <Info color={color.yellow} size={13} />
                      <Text style={styles.instructionsTitle}>Special Instructions</Text>
                    </View>
                    <Text style={styles.instructionsText} numberOfLines={3} ellipsizeMode="tail">
                      {job.instructions}
                    </Text>
                  </View>
                ) : null}

                {/* Card Action Footer */}
                <View style={styles.jobCardFooter}>
                  <Text style={styles.cardFooterHint} numberOfLines={1} ellipsizeMode="tail">
                    {job.status === 'IN_PROGRESS' ? 'Evaluation in progress' : 'Ready to inspect'}
                  </Text>

                  <View style={styles.startBtnPill}>
                    <Text style={styles.startBtnText}>
                      {job.status === 'IN_PROGRESS' ? 'Resume' : 'Start Inspection'}
                    </Text>
                    <ChevronRight color={color.navy} size={15} />
                  </View>
                </View>
              </Pressable>
            );
          })
        ) : !busy ? (
          <View style={styles.emptyJobsCard}>
            <ClipboardCheck color={color.muted} size={48} />
            <Text style={styles.emptyJobsTitle}>No Assigned Inspections</Text>
            <Text style={styles.emptyJobsSub}>
              Inspections will appear when Operations assigns vehicle evaluation appointments to your account.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* In-App Notifications Bottom Sheet (Navigation-Aware & Safe Area Padded) */}
      <Modal visible={notificationsOpen} transparent animationType="slide" onRequestClose={() => setNotificationsOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setNotificationsOpen(false)}>
          <Pressable
            style={[
              styles.modalContent,
              styles.notifModalContent,
              { paddingBottom: Math.max(insets.bottom, 16) + space.md },
            ]}
            onPress={e => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.notifSheetHeader}>
              <View style={styles.notifSheetHeaderLeft}>
                <View style={styles.notifIconWrap}>
                  <Bell color={color.yellow} size={16} />
                </View>
                <View style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.notifSheetTitle}>Notifications</Text>
                    {unreadNotifsCount > 0 && (
                      <View style={styles.notifCountBadge}>
                        <Text style={styles.notifCountBadgeText}>{unreadNotifsCount} new</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.notifSheetSub}>Inspection dispatch and review updates</Text>
                </View>
              </View>

              <View style={styles.notifSheetHeaderRight}>
                {unreadNotifsCount > 0 && (
                  <Pressable onPress={() => void markAllNotificationsAsRead()} hitSlop={8}>
                    <Text style={styles.markReadText}>Mark all read</Text>
                  </Pressable>
                )}
                <Pressable style={styles.sheetCloseBtn} onPress={() => setNotificationsOpen(false)} hitSlop={8}>
                  <X color={color.muted} size={18} />
                </Pressable>
              </View>
            </View>

            {/* Notifications List */}
            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ paddingBottom: space.sm }}
              showsVerticalScrollIndicator={false}
            >
              {notifications.length === 0 ? (
                <View style={styles.notifEmptyWrap}>
                  <Bell color={color.muted} size={32} />
                  <Text style={styles.notifEmptyTitle}>No notifications yet</Text>
                  <Text style={styles.notifEmptySub}>
                    Real-time assignment alerts, rework notes, and approval updates will appear here.
                  </Text>
                </View>
              ) : (
                notifications.map(n => {
                  const hasTarget = Boolean(n.entityId || n.deepLink);
                  return (
                    <Pressable
                      key={n.id}
                      style={({ pressed }) => [
                        styles.notifItemCard,
                        !n.read && styles.notifItemCardUnread,
                        pressed && styles.notifItemCardPressed,
                      ]}
                      onPress={() => void handleNotificationNavigation(n)}
                    >
                      <View style={styles.notifItemTop}>
                        <View style={styles.notifBadgeRow}>
                          {!n.read && <View style={styles.unreadDot} />}
                          <View style={styles.notifCategoryTag}>
                            <Text style={styles.notifCategoryTagText}>
                              {n.category || 'INSPECTION'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.notifTimeText}>
                          {formatRelativeTime(n.createdAt)}
                        </Text>
                      </View>

                      <Text style={[styles.notifTitle, !n.read && styles.notifTitleUnread]}>
                        {n.title}
                      </Text>

                      <Text style={styles.notifBody} numberOfLines={3} ellipsizeMode="tail">
                        {n.body}
                      </Text>

                      {hasTarget && (
                        <View style={styles.notifActionRow}>
                          <View style={styles.notifNavPill}>
                            <Text style={styles.notifNavPillText}>Open Inspection</Text>
                            <ChevronRight size={13} color={color.yellow} />
                          </View>
                        </View>
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (color: any, isDark: boolean) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },

  // Header
  mainHeader: {
    backgroundColor: color.headerBg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: color.border,
    gap: space.xs,
  },
  headerBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  badgePill: {
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    borderWidth: 1,
    borderColor: color.yellow,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  badgePillText: { color: color.yellow, fontWeight: '800', fontSize: 10, letterSpacing: 0.5 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  modeSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.md,
    flexShrink: 0,
  },
  modeSwitchText: { color: color.textSecondary, fontSize: 11, fontWeight: '700' },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  filterSection: {
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  filterScrollView: {
    flexGrow: 0,
  },
  filterPillsScroll: {
    paddingHorizontal: space.lg,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : color.border,
    flexShrink: 0,
  },
  filterPillActive: {
    backgroundColor: 'rgba(247, 181, 3, 0.16)',
    borderColor: color.yellow,
  },
  filterPillText: {
    color: color.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: color.yellow,
    fontWeight: '800',
  },
  sortSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: 7,
    backgroundColor: isDark ? 'rgba(2, 11, 24, 0.45)' : color.raised,
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  sortHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  sortLabel: {
    color: color.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  sortSegmentedGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : color.surface,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: color.border,
    flex: 1,
    maxWidth: 240,
    marginLeft: space.sm,
  },
  sortSegment: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortSegmentActive: {
    backgroundColor: 'rgba(247, 181, 3, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.5)',
  },
  sortSegmentText: {
    color: color.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  sortSegmentTextActive: {
    color: color.yellow,
    fontWeight: '800',
  },

  // In-App Notifications Bottom Sheet Styles
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
    alignSelf: 'center',
    marginBottom: space.sm,
  },
  notifModalContent: {
    padding: space.lg,
    gap: space.sm,
  },
  notifSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  notifSheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  notifIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifSheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: color.text,
  },
  notifSheetSub: {
    fontSize: 11,
    color: color.muted,
  },
  notifCountBadge: {
    backgroundColor: color.yellow,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  notifCountBadgeText: {
    color: color.navy,
    fontSize: 10,
    fontWeight: '800',
  },
  notifSheetHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  markReadText: {
    color: color.yellow,
    fontSize: 12,
    fontWeight: '700',
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifEmptyWrap: {
    paddingVertical: 36,
    alignItems: 'center',
    gap: space.xs,
  },
  notifEmptyTitle: {
    color: color.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: space.sm,
  },
  notifEmptySub: {
    color: color.muted,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: space.lg,
  },
  notifItemCard: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : color.surface,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.sm,
    gap: 6,
  },
  notifItemCardUnread: {
    backgroundColor: 'rgba(247, 181, 3, 0.06)',
    borderColor: 'rgba(247, 181, 3, 0.35)',
  },
  notifItemCardPressed: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : color.raised,
  },
  notifItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notifBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: color.yellow,
  },
  notifCategoryTag: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  notifCategoryTagText: {
    color: color.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  notifTimeText: {
    color: color.muted,
    fontSize: 11,
  },
  notifTitle: {
    color: color.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  notifTitleUnread: {
    color: color.yellow,
    fontWeight: '800',
  },
  notifBody: {
    color: color.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  notifActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  notifNavPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  notifNavPillText: {
    color: color.yellow,
    fontSize: 11,
    fontWeight: '700',
  },

  // Sync Banner
  syncBanner: {
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    borderColor: 'rgba(247, 181, 3, 0.3)',
    borderBottomWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  syncBannerContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  syncBannerText: { color: color.yellow, fontSize: 12, fontWeight: '700', flex: 1 },
  btnSync: { backgroundColor: color.yellow, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm },
  btnSyncText: { color: color.navy, fontSize: 11, fontWeight: '800' },

  // Actions Bar
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  actionsBarTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  actionsBarTitle: { fontSize: 16, fontWeight: '800', color: color.text },
  countBadge: {
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.3)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexShrink: 0,
  },
  countBadgeText: {
    color: color.yellow,
    fontSize: 11,
    fontWeight: '800',
  },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
  refreshBtnText: { color: color.yellow, fontWeight: '700', fontSize: 13 },
  statusToast: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(147, 197, 253, 0.12)',
    color: '#93C5FD',
    fontSize: 12,
  },

  // Jobs List & Cards
  jobsListScroll: { paddingHorizontal: space.lg, paddingBottom: 40, gap: space.md },
  jobCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
    gap: space.md,
  },
  jobCardPressed: {
    backgroundColor: color.raised,
    borderColor: 'rgba(247, 181, 3, 0.45)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  cardHeaderBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  locationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  locationBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  refTagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(247, 181, 3, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  refTagText: {
    color: color.yellow,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  vehicleTitleBlock: {
    gap: 2,
  },
  jobVehicle: {
    fontSize: 16,
    fontWeight: '800',
    color: color.text,
    lineHeight: 22,
  },
  specPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  specChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : color.raised,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  specChipText: {
    color: color.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  cardMetaGrid: {
    backgroundColor: isDark ? 'rgba(2, 11, 24, 0.35)' : color.raised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md,
    gap: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  metaIconCol: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  metaContentCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: color.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 13,
    color: color.textSecondary,
    lineHeight: 18,
    fontWeight: '500',
  },
  metaValueHighlight: {
    fontSize: 13,
    color: isDark ? '#FEF08A' : '#B45309',
    lineHeight: 18,
    fontWeight: '700',
  },
  instructionsCallout: {
    backgroundColor: 'rgba(247, 181, 3, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: color.yellow,
    borderRadius: radius.sm,
    padding: space.sm + 2,
    gap: 4,
  },
  instructionsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  instructionsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: isDark ? color.yellow : '#B45309',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  instructionsText: {
    fontSize: 12,
    color: isDark ? '#FDE68A' : '#92400E',
    lineHeight: 17,
    fontStyle: 'italic',
  },
  jobCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderColor: color.border,
    gap: space.sm,
  },
  cardFooterHint: {
    fontSize: 11,
    color: color.muted,
    fontWeight: '600',
    flex: 1,
    minWidth: 0,
  },
  startBtnPill: {
    backgroundColor: color.yellow,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  startBtnText: {
    color: color.navy,
    fontWeight: '800',
    fontSize: 12,
  },

  emptyJobsCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: 36,
    alignItems: 'center',
    gap: space.md,
    marginTop: 30,
  },
  emptyJobsTitle: { fontSize: 17, fontWeight: '800', color: color.text },
  emptyJobsSub: { fontSize: 13, color: color.muted, textAlign: 'center', lineHeight: 18 },

  // Workspace
  workspaceHeader: {
    backgroundColor: color.headerBg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  backButton: { paddingRight: space.xs },
  backButtonText: { color: color.yellow, fontWeight: '800', fontSize: 16 },
  workspaceKicker: { color: color.yellow, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  workspaceVehicle: { color: color.text, fontSize: 16, fontWeight: '800' },
  btnSmallYellow: {
    backgroundColor: color.yellow,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnSmallYellowText: { color: color.navy, fontWeight: '800', fontSize: 13 },

  tabsContainer: { backgroundColor: color.headerBg, borderBottomWidth: 1, borderColor: color.border },
  tabsScroll: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
  },
  tabButtonActive: { backgroundColor: color.yellow },
  tabButtonText: { color: color.muted, fontWeight: '700', fontSize: 12 },
  tabButtonTextActive: { color: '#061A38', fontWeight: '800' },

  contentScroll: { padding: space.lg, paddingBottom: 50 },
  formSection: { gap: space.lg },
  sectionHeader: { fontSize: 18, fontWeight: '800', color: color.yellow },
  sectionSub: { fontSize: 13, color: color.muted, marginTop: -space.sm, marginBottom: space.xs },

  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: color.text },
  inputHint: { fontSize: 11, color: color.muted },
  textInput: {
    backgroundColor: color.input,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    fontSize: 14,
    color: color.text,
  },

  checkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md,
    borderRadius: radius.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: color.yellow, borderColor: color.yellow },
  checkCardLabel: { fontSize: 14, fontWeight: '600', color: color.text, flex: 1 },

  // Photos
  photoSlotCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  photoSlotHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  photoSlotTitle: { fontSize: 14, fontWeight: '700', color: color.text },
  photoSlotDesc: { fontSize: 12, color: color.muted, marginTop: 1 },
  photoSlotActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  cameraBtn: {
    backgroundColor: color.yellow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  cameraBtnText: { color: color.navy, fontWeight: '800', fontSize: 11 },
  galleryBtn: {
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  galleryBtnText: { color: color.yellow, fontWeight: '800', fontSize: 11 },
  photoStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoStatusTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  photoStatusText: { fontSize: 11, color: color.success, fontWeight: '700' },
  photoPendingText: { fontSize: 11, color: color.yellow, fontWeight: '600' },
  thumbnailStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.xs,
  },
  thumbnailWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: color.input,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  thumbnailImg: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
  },
  thumbIndexBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    backgroundColor: 'rgba(2, 11, 24, 0.85)',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  thumbIndexText: {
    color: color.white,
    fontSize: 9,
    fontWeight: '800',
  },
  thumbDeleteBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(248, 113, 113, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreThumbBtn: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.4)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(247, 181, 3, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addMoreThumbText: {
    color: color.yellow,
    fontSize: 10,
    fontWeight: '800',
  },
  regPlateChip: {
    borderColor: 'rgba(247, 181, 3, 0.45)',
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
  },
  regPlateChipText: {
    color: color.yellow,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Fullscreen Preview Modal
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.md,
  },
  previewHeader: {
    position: 'absolute',
    top: 50,
    left: space.md,
    right: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  previewTitle: {
    color: color.white,
    fontSize: 15,
    fontWeight: '700',
  },
  previewCloseBtn: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
  },
  previewFullImg: {
    width: '100%',
    height: '75%',
  },
  photoChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.yellow,
    borderWidth: 1,
    borderColor: color.yellow,
    padding: space.md,
    borderRadius: radius.md,
  },
  photoChoiceTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: color.navy,
  },
  photoChoiceSub: {
    fontSize: 11,
    color: color.muted,
    marginTop: 2,
  },
  photoModalContent: {
    paddingTop: space.md,
    paddingHorizontal: space.xl,
  },
  photoCancelBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xs,
  },
  photoCancelBtnText: {
    color: color.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },

  // Checklist
  checklistSectionCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  secCardTitle: { fontSize: 15, fontWeight: '800', color: color.yellow },
  secCardDesc: { fontSize: 12, color: color.muted, marginTop: -space.xs },
  itemRow: { borderTopWidth: 1, borderColor: color.border, paddingTop: space.md, gap: space.sm },
  itemLabel: { fontSize: 14, fontWeight: '600', color: color.text },
  btnGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChoiceBtn: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: color.input,
  },
  statusChoiceText: { fontSize: 11, fontWeight: '700', color: color.muted },
  statusChoiceTextActive: { color: color.white },
  statusPass: { backgroundColor: color.success, borderColor: color.success },
  statusIssue: { backgroundColor: color.danger, borderColor: color.danger },
  statusUntested: { backgroundColor: color.yellow, borderColor: color.yellow },
  statusNA: { backgroundColor: color.muted, borderColor: color.muted },
  itemNotesInput: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.sm,
    padding: space.sm,
    fontSize: 12,
    color: color.text,
    backgroundColor: color.input,
  },

  // Defects
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  defectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: space.xs,
  },
  defectHeaderTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  defectHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  defectCountBadge: {
    backgroundColor: 'rgba(247, 181, 3, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.35)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  defectCountText: {
    color: color.yellow,
    fontSize: 11,
    fontWeight: '800',
  },
  defectCard: {
    backgroundColor: color.surface,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  defectCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  defectBadgesRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  defectIndexPill: {
    backgroundColor: color.raised,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  defectIndexText: {
    color: color.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  defectSevBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  defectSevText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  defectCatBadge: {
    backgroundColor: color.input,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    maxWidth: 160,
  },
  defectCatText: {
    color: color.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  defectDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  defectCardDesc: {
    fontSize: 13.5,
    color: color.white,
    lineHeight: 19,
    flexShrink: 1,
  },
  defectLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  defectCardLoc: {
    fontSize: 11.5,
    color: color.textSecondary,
    fontWeight: '600',
    flexShrink: 1,
  },
  defectCardBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  defectCardPhotoWrap: {
    position: 'relative',
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.border,
  },
  defectCardPhoto: {
    width: 62,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: color.raised,
  },
  defectCardPhotoPill: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 4,
    padding: 2,
  },
  defectPhotoPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    backgroundColor: color.input,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
  },
  defectPhotoThumbWrap: {
    position: 'relative',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  defectPhotoThumb: {
    width: 80,
    height: 60,
    borderRadius: radius.sm,
    backgroundColor: color.raised,
  },
  defectPhotoZoomPill: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  defectPhotoZoomText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  defectPhotoActions: {
    flex: 1,
    gap: 6,
  },
  defectPhotoAttachedText: {
    color: color.success,
    fontSize: 12,
    fontWeight: '700',
  },
  defectPhotoRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  defectPhotoRemoveText: {
    color: color.danger,
    fontSize: 11.5,
    fontWeight: '700',
  },
  defectPhotoPickerRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  defectPhotoPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: color.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  defectPhotoPickerBtnText: {
    color: color.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  emptyDefectsCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: space.xl,
    alignItems: 'center',
    gap: space.sm,
  },
  emptyDefectsIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyDefectsText: {
    fontSize: 15,
    fontWeight: '800',
    color: color.white,
  },
  emptyDefectsSub: {
    fontSize: 12.5,
    color: color.muted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyDefectAddBtn: {
    marginTop: space.sm,
    backgroundColor: color.yellow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  emptyDefectAddText: {
    color: color.navy,
    fontSize: 13,
    fontWeight: '800',
  },

  // Road test
  roadTestChoiceRow: { flexDirection: 'row', gap: space.md },
  roadTestChoice: {
    flex: 1,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    alignItems: 'center',
  },
  roadTestChoiceActive: { backgroundColor: color.yellow, borderColor: color.yellow },
  roadTestChoiceText: { fontSize: 13, fontWeight: '700', color: color.muted },
  roadTestChoiceTextActive: { color: '#061A38' },

  // Review
  summaryCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  summaryKey: { fontSize: 13, color: color.muted, flex: 1 },
  summaryVal: { fontSize: 13, fontWeight: '700', color: color.yellow, flexShrink: 1, textAlign: 'right' },
  declarationCard: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: 'rgba(247, 181, 3, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.35)',
    borderRadius: radius.md,
    padding: space.md,
    alignItems: 'flex-start',
  },
  declarationCardActive: { borderColor: color.yellow },
  declarationText: { fontSize: 12, lineHeight: 18, color: isDark ? '#FDE68A' : '#92400E', flex: 1, fontWeight: '600' },

  btnPrimary: {
    backgroundColor: color.yellow,
    borderRadius: radius.md,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderWidth: 1,
    borderColor: color.yellow,
  },
  btnPrimaryText: { color: '#061A38', fontWeight: '800', fontSize: 15 },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: isDark ? 'rgba(2, 11, 24, 0.88)' : 'rgba(15, 23, 42, 0.65)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: color.border,
    padding: space.xl,
    gap: space.md,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: color.text },
  modalSub: { fontSize: 12, color: color.muted, marginTop: 2 },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.input,
  },
  pickerChipActive: { backgroundColor: color.yellow, borderColor: color.yellow },
  pickerChipText: { fontSize: 12, fontWeight: '700', color: color.muted },
  pickerChipTextActive: { color: color.navy },

  // Defect Modal Bottom Sheet
  defectModalSheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: color.border,
    width: '100%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 20,
  },
  defectModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    gap: space.sm,
  },
  defectModalScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  defectModalScrollBody: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: 8,
  },
  sevChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.input,
  },
  sevDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  sevChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: color.muted,
  },
  defectDescInput: {
    minHeight: 80,
    maxHeight: 140,
    paddingTop: 10,
    paddingBottom: 10,
  },
  defectModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.surface,
  },
  defectCancelBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defectCancelText: {
    color: color.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  defectSubmitBtn: {
    flex: 2,
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: color.yellow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  defectSubmitText: {
    color: '#061A38',
    fontSize: 14,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
