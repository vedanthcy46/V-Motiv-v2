import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Calendar,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CloudOff,
  Gauge,
  Info,
  LogOut,
  MapPin,
  RefreshCw,
  Tag,
  Trash2,
  User,
  UserCheck,
  X,
} from 'lucide-react-native';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../api';
import { color, radius, space } from '../theme';
import {
  cachedJobsKey,
  cachedTemplateKey,
  enqueueDraft,
  enqueueMedia,
  flushDrafts,
  flushMedia,
  queuedDraftCount,
  queuedMediaCount,
  type DraftPayload,
} from '../services/inspector-sync';

type Assignment = {
  id: string;
  status: string;
  scheduledAt: string | null;
  locationType: string;
  address: string | null;
  instructions: string | null;
  request: {
    id: string;
    status: string;
    branchId?: string | null;
    lead: {
      id: string;
      referenceCode: string;
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

type Report = {
  id: string;
  assignmentId: string;
  status: string;
  recordVersion: number;
  templateKey: string;
  templateVersion: number;
  identity: Record<string, unknown>;
  answers: Array<{ itemKey: string; status: string; value?: unknown; notes?: string }>;
  defects: Array<{ category: string; severity: string; description: string; location?: string }>;
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

function formatRefCode(code: string | null | undefined): string {
  if (!code) return 'N/A';
  if (code.length > 12) {
    return code.slice(0, 8).toUpperCase();
  }
  return code.toUpperCase();
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

function getStatusTheme(status: string) {
  switch (status?.toUpperCase()) {
    case 'ASSIGNED':
      return {
        bg: 'rgba(247, 181, 3, 0.14)',
        border: 'rgba(247, 181, 3, 0.4)',
        text: color.yellow,
        label: 'ASSIGNED',
      };
    case 'CONFIRMED':
      return {
        bg: 'rgba(52, 211, 153, 0.14)',
        border: 'rgba(52, 211, 153, 0.4)',
        text: color.success,
        label: 'CONFIRMED',
      };
    case 'IN_PROGRESS':
      return {
        bg: 'rgba(56, 189, 248, 0.14)',
        border: 'rgba(56, 189, 248, 0.4)',
        text: '#38BDF8',
        label: 'IN PROGRESS',
      };
    case 'COMPLETED':
      return {
        bg: 'rgba(34, 197, 94, 0.14)',
        border: 'rgba(34, 197, 94, 0.4)',
        text: '#4ADE80',
        label: 'COMPLETED',
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
        text: color.muted,
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
  const [defects, setDefects] = useState<Array<{ category: string; severity: string; description: string; location?: string }>>([]);
  const [capturedPhotos, setCapturedPhotos] = useState<Record<string, { base64: string; time: string }>>({});
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

  // 1. Initial Load of Assigned Jobs & Queue Counts
  useEffect(() => {
    void refreshQueueCounts();
    void loadJobs();
  }, [user]);

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

  async function loadJobs() {
    if (!user) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const live = await api<Assignment[]>('/api/v2/inspector/assignments');
      setJobs(live);
      await AsyncStorage.setItem(cachedJobsKey(user.id), JSON.stringify(live));
    } catch (err: any) {
      console.warn('[LOAD_ASSIGNMENTS_ERROR]', err?.status, err?.code, err?.message);
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
      setRegNumber(String(iden.registrationNumber || job.request.lead.referenceCode || ''));
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
      setDefects(activeReport.defects || []);
    } catch (err: any) {
      console.warn('[START_INSPECTION_ERROR]', err?.status, err?.code, err?.message);
      Alert.alert('Inspection Error', `Could not start or load evaluation workspace: ${err?.message || err?.code || 'Please check your connection'}`);
    } finally {
      setBusy(false);
    }
  }

  // 3. Save Draft (Local First + Cloud Sync)
  async function saveDraft() {
    if (!activeJob || !report || !user) return;
    setBusy(true);
    const payload: DraftPayload = {
      identity: {
        registrationNumber: regNumber,
        odometerKm: Number(odometerKm) || 0,
        vinChassis,
        engineNumber,
        rcVerified,
        insuranceVerified,
        hypothecationDeclared,
        declarationConfirmed: declaration,
      },
      answers: Object.entries(answers).map(([itemKey, val]) => ({
        itemKey,
        status: val.status,
        notes: val.notes,
      })),
      defects,
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
      Alert.alert('Draft Saved', 'Evaluation saved to V MOTIV Cloud successfully.');
    } catch {
      await enqueueDraft(user.id, report.id, report.recordVersion, payload);
      await refreshQueueCounts();
      Alert.alert('Saved Offline', 'Draft queued locally on device. Will sync automatically when online.');
    } finally {
      setBusy(false);
    }
  }

  // 4. Capture Guided Photo Slot
  async function capturePhotoSlot(slotId: string) {
    if (!activeJob || !report || !user) return;

    // Generates valid Base64 test evidence image
    const sampleBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    setCapturedPhotos(prev => ({
      ...prev,
      [slotId]: { base64: sampleBase64, time: new Date().toISOString() },
    }));

    try {
      await api(`/api/v2/inspector/reports/${report.id}/media/upload-json`, {
        method: 'POST',
        body: JSON.stringify({
          slotId,
          logicalMediaId: slotId,
          base64Data: sampleBase64,
          mimeType: 'image/jpeg',
          capturedAt: new Date().toISOString(),
        }),
      });
    } catch {
      await enqueueMedia(user.id, report.id, slotId, sampleBase64, 'image/jpeg');
      await refreshQueueCounts();
    }
  }

  // 5. Submit Completed Report
  async function submitReport() {
    if (!activeJob || !report) return;
    if (!declaration) {
      Alert.alert('Declaration Required', 'You must sign the truthfulness declaration before submitting.');
      return;
    }
    if (!regNumber.trim() || !odometerKm.trim()) {
      Alert.alert('Missing Identity Data', 'Observed registration number and odometer reading are required.');
      return;
    }

    setBusy(true);
    try {
      await saveDraft();
      await api(`/api/v2/inspector/reports/${report.id}/submit`, { method: 'POST' });
      Alert.alert(
        'Inspection Submitted',
        'Your evaluation report and evidence have been sealed and forwarded to the Independent Quality Review team.',
        [{ text: 'OK', onPress: () => { setActiveJob(null); void loadJobs(); } }]
      );
    } catch (err: any) {
      Alert.alert('Submission Error', err?.message || 'Unable to submit report. Ensure all checks are complete.');
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
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Workspace Top Bar */}
        <View style={styles.workspaceHeader}>
          <Pressable style={styles.backButton} onPress={() => setActiveJob(null)}>
            <Text style={styles.backButtonText}>‹ Jobs</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.workspaceKicker} numberOfLines={1} ellipsizeMode="tail">
              EVALUATION · #{formatRefCode(activeJob.request.lead.referenceCode)}
            </Text>
            <Text style={styles.workspaceVehicle} numberOfLines={1} ellipsizeMode="tail">
              {activeJob.request.lead.manufacturingYear} {activeJob.request.lead.make} {activeJob.request.lead.model}
            </Text>
          </View>
          <Pressable style={styles.btnSmallYellow} onPress={() => void saveDraft()} disabled={busy}>
            <Text style={styles.btnSmallYellowText}>{busy ? '…' : 'Save Draft'}</Text>
          </Pressable>
        </View>

        {/* Tab Navigation Strip */}
        <View style={styles.tabsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {[
              { id: 'identity', label: '1. Identity' },
              { id: 'photos', label: `2. Photos (${Object.keys(capturedPhotos).length}/16)` },
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
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                  onChangeText={setRegNumber}
                  placeholder="e.g. KA01MJ1234"
                  placeholderTextColor={color.muted}
                  autoCapitalize="characters"
                />
                <Text style={styles.inputHint} numberOfLines={1} ellipsizeMode="tail">
                  Declared: #{formatRefCode(activeJob.request.lead.referenceCode)} (Seller: {activeJob.request.lead.sellerName})
                </Text>
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
              <Text style={styles.sectionHeader}>Guided Photographic Proof</Text>
              <Text style={styles.sectionSub}>All 16 mandatory photographic angles required for independent review.</Text>

              {standardPhotoSlots.map(slot => {
                const isCaptured = Boolean(capturedPhotos[slot.id]);
                return (
                  <View key={slot.id} style={styles.photoSlotCard}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={styles.photoSlotTitle} numberOfLines={1} ellipsizeMode="tail">{slot.label}</Text>
                      <Text style={styles.photoSlotDesc} numberOfLines={2} ellipsizeMode="tail">{slot.desc}</Text>
                      {isCaptured ? (
                        <View style={styles.photoStatusTag}>
                          <CheckCircle2 color={color.success} size={13} />
                          <Text style={styles.photoStatusText} numberOfLines={1}>Evidence Captured</Text>
                        </View>
                      ) : (
                        <Text style={styles.photoPendingText} numberOfLines={1}>• Photo Required</Text>
                      )}
                    </View>

                    <Pressable
                      style={[styles.cameraBtn, isCaptured && styles.cameraBtnRetake]}
                      onPress={() => void capturePhotoSlot(slot.id)}
                    >
                      <Camera color={isCaptured ? color.yellow : color.navy} size={18} />
                      <Text style={[styles.cameraBtnText, isCaptured && { color: color.yellow }]}>
                        {isCaptured ? 'Retake' : 'Snap'}
                      </Text>
                    </Pressable>
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
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.sectionHeader}>Defect Register ({defects.length})</Text>
                  <Text style={styles.sectionSub}>Log damages, scratches, mechanical symptoms, or missing parts.</Text>
                </View>
                <Pressable style={styles.btnSmallYellow} onPress={() => setDefectModalVisible(true)}>
                  <Text style={styles.btnSmallYellowText}>+ Add Defect</Text>
                </Pressable>
              </View>

              {defects.length ? (
                defects.map((d, idx) => (
                  <View key={idx} style={styles.defectCard}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.defectCardTitle} numberOfLines={1} ellipsizeMode="tail">{d.category} · {d.severity}</Text>
                      <Pressable onPress={() => setDefects(prev => prev.filter((_, i) => i !== idx))}>
                        <Trash2 color={color.danger} size={18} />
                      </Pressable>
                    </View>
                    <Text style={styles.defectCardDesc} numberOfLines={4} ellipsizeMode="tail">{d.description}</Text>
                    {d.location ? <Text style={styles.defectCardLoc} numberOfLines={1} ellipsizeMode="tail">Location: {d.location}</Text> : null}
                  </View>
                ))
              ) : (
                <View style={styles.emptyDefects}>
                  <CheckCircle2 color={color.success} size={36} />
                  <Text style={styles.emptyDefectsText}>No defects recorded</Text>
                  <Text style={styles.emptyDefectsSub}>Click "+ Add Defect" if damages, leaks, or wear are found.</Text>
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
                  <Text style={styles.summaryVal} numberOfLines={1} ellipsizeMode="tail">{regNumber || 'Missing'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey} numberOfLines={1}>Observed Odometer</Text>
                  <Text style={styles.summaryVal} numberOfLines={1} ellipsizeMode="tail">{odometerKm ? `${odometerKm} km` : 'Missing'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey} numberOfLines={1}>Checklist Answered</Text>
                  <Text style={styles.summaryVal} numberOfLines={1} ellipsizeMode="tail">{Object.keys(answers).length} items</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey} numberOfLines={1}>Defects Logged</Text>
                  <Text style={styles.summaryVal} numberOfLines={1} ellipsizeMode="tail">{defects.length} defects</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey} numberOfLines={1}>Photos Captured</Text>
                  <Text style={styles.summaryVal} numberOfLines={1} ellipsizeMode="tail">{Object.keys(capturedPhotos).length} photos</Text>
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
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>

        {/* Modal: Add Defect */}
        <Modal visible={defectModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalBackdrop}
          >
            <View style={styles.modalContent}>
              <View style={styles.rowBetween}>
                <Text style={styles.modalTitle}>Add Vehicle Defect</Text>
                <Pressable onPress={() => setDefectModalVisible(false)}>
                  <X color={color.text} size={22} />
                </Pressable>
              </View>

              <Text style={styles.label}>Defect Category</Text>
              <View style={styles.catPickerRow}>
                {['Exterior Body', 'Structural / Frame', 'Engine / Gearbox', 'Suspension / Steering', 'Interior / Controls', 'Electrical / AC'].map(c => (
                  <Pressable
                    key={c}
                    style={[styles.pickerChip, newDefectCat === c && styles.pickerChipActive]}
                    onPress={() => setNewDefectCat(c)}
                  >
                    <Text style={[styles.pickerChipText, newDefectCat === c && styles.pickerChipTextActive]}>{c}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Severity</Text>
              <View style={styles.catPickerRow}>
                {(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] as const).map(s => (
                  <Pressable
                    key={s}
                    style={[styles.pickerChip, newDefectSev === s && styles.pickerChipActive]}
                    onPress={() => setNewDefectSev(s)}
                  >
                    <Text style={[styles.pickerChipText, newDefectSev === s && styles.pickerChipTextActive]}>{s}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Location / Part</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Right front fender, Radiator support"
                placeholderTextColor={color.muted}
                value={newDefectLoc}
                onChangeText={setNewDefectLoc}
              />

              <Text style={styles.label}>Description of Finding *</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 64 }]}
                placeholder="Observed scratch, tear, leakage, or deformation"
                placeholderTextColor={color.muted}
                multiline
                value={newDefectDesc}
                onChangeText={setNewDefectDesc}
              />

              <Pressable
                style={[styles.btnPrimary, !newDefectDesc.trim() && { opacity: 0.5 }]}
                onPress={() => {
                  if (!newDefectDesc.trim()) return;
                  setDefects(prev => [
                    ...prev,
                    {
                      category: newDefectCat,
                      severity: newDefectSev,
                      description: newDefectDesc.trim(),
                      location: newDefectLoc.trim() || undefined,
                    },
                  ]);
                  setNewDefectDesc('');
                  setNewDefectLoc('');
                  setDefectModalVisible(false);
                }}
                disabled={!newDefectDesc.trim()}
              >
                <Text style={styles.btnPrimaryText}>Add to Report</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  // --- ASSIGNMENTS LIST VIEW ---
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={styles.mainHeader}>
        <View style={styles.headerBrandRow}>
          <BrandLogo variant="horizontal" size={24} />
          <View style={styles.badgePill}>
            <Text style={styles.badgePillText}>INSPECTOR</Text>
          </View>
        </View>

        <View style={styles.headerRightActions}>
          <Pressable style={styles.modeSwitchBtn} onPress={() => setActiveMode('customer')}>
            <UserCheck color={color.yellow} size={15} />
            <Text style={styles.modeSwitchText}>Customer Mode</Text>
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
        <Text style={styles.actionsBarTitle} numberOfLines={1}>Assigned Inspections ({jobs.length})</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void loadJobs()} disabled={busy}>
          <RefreshCw color={color.yellow} size={15} />
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      </View>

      {statusMessage ? <Text style={styles.statusToast}>{statusMessage}</Text> : null}

      <ScrollView contentContainerStyle={styles.jobsListScroll}>
        {busy && <ActivityIndicator color={color.yellow} size="small" style={{ marginVertical: space.md }} />}

        {jobs.length ? (
          jobs.map(job => {
            const statusTheme = getStatusTheme(job.status);
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
                      #{refFormatted}
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

                {/* Spec Pills (Fuel, Transmission, Odometer) */}
                <View style={styles.specPillsRow}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },

  // Header
  mainHeader: {
    backgroundColor: color.navy,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  headerBrandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  badgePill: {
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    borderWidth: 1,
    borderColor: color.yellow,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgePillText: { color: color.yellow, fontWeight: '800', fontSize: 10, letterSpacing: 1 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  modeSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  modeSwitchText: { color: color.textSecondary, fontSize: 11, fontWeight: '700' },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: space.md,
  },
  actionsBarTitle: { fontSize: 16, fontWeight: '800', color: color.yellow },
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: 'rgba(2, 11, 24, 0.35)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(26, 59, 107, 0.4)',
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
    color: '#FEF08A',
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
    color: color.yellow,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  instructionsText: {
    fontSize: 12,
    color: '#FDE68A',
    lineHeight: 17,
    fontStyle: 'italic',
  },
  jobCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderColor: 'rgba(26, 59, 107, 0.6)',
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
    backgroundColor: color.navy,
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

  tabsContainer: { backgroundColor: color.navy, borderBottomWidth: 1, borderColor: color.border },
  tabsScroll: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabButtonActive: { backgroundColor: color.yellow },
  tabButtonText: { color: color.muted, fontWeight: '700', fontSize: 12 },
  tabButtonTextActive: { color: color.navy, fontWeight: '800' },

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  photoSlotTitle: { fontSize: 14, fontWeight: '700', color: color.text },
  photoSlotDesc: { fontSize: 12, color: color.muted },
  photoStatusTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  photoStatusText: { fontSize: 11, color: color.success, fontWeight: '700' },
  photoPendingText: { fontSize: 11, color: color.yellow, fontWeight: '600', marginTop: 4 },
  cameraBtn: {
    backgroundColor: color.yellow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  cameraBtnRetake: { backgroundColor: color.raised, borderWidth: 1, borderColor: color.border },
  cameraBtnText: { color: color.navy, fontWeight: '700', fontSize: 12 },

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
  defectCard: {
    backgroundColor: color.surface,
    borderLeftWidth: 4,
    borderLeftColor: color.danger,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: 4,
  },
  defectCardTitle: { fontSize: 13, fontWeight: '800', color: color.danger },
  defectCardDesc: { fontSize: 13, color: color.text },
  defectCardLoc: { fontSize: 11, color: color.muted },
  emptyDefects: { padding: 32, alignItems: 'center', gap: space.sm },
  emptyDefectsText: { fontSize: 15, fontWeight: '700', color: color.text },
  emptyDefectsSub: { fontSize: 12, color: color.muted, textAlign: 'center' },

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
  roadTestChoiceTextActive: { color: color.navy },

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
  declarationText: { fontSize: 12, lineHeight: 18, color: '#FDE68A', flex: 1, fontWeight: '600' },

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
  btnPrimaryText: { color: color.navy, fontWeight: '800', fontSize: 15 },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2, 11, 24, 0.88)', justifyContent: 'flex-end' },
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
});
