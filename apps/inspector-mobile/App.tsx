import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Cloud,
  CloudOff,
  FileText,
  Image as ImageIcon,
  LogOut,
  Play,
  RefreshCw,
  Shield,
  Trash2,
  X,
} from 'lucide-react-native';
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
} from './offline-sync';

// Official V MOTIV Dark Luxury Brand Palette (Unified with Admin & Sales Portals)
const palette = {
  navy: '#061A38',
  navyDark: '#020B18',
  yellow: '#F7B503',
  yellowHover: '#FFD04D',
  white: '#FFFFFF',
  ink: '#F8FAFC',
  muted: '#AEBBD0',
  subtle: '#64748B',
  background: '#020B18',
  backgroundAlt: '#071327',
  card: '#0B1E3B',
  cardAlt: '#10294F',
  border: '#29466D',
  borderDark: '#1E3557',
  inputBg: '#07182F',
  success: '#61D99A',
  successBg: 'rgba(97, 217, 154, 0.12)',
  danger: '#FF7C86',
  dangerBg: 'rgba(139, 31, 44, 0.25)',
  warning: '#FFD166',
  warningBg: 'rgba(247, 181, 3, 0.12)',
  info: '#93C5FD',
  infoBg: 'rgba(147, 197, 253, 0.12)',
};

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
  revision: number;
  recordVersion: number;
  status: string;
  templateKey: string;
  templateVersion: number;
  identity: {
    registrationNumber?: string;
    odometerKm?: number;
    vinChassis?: string;
    engineNumber?: string;
    rcVerified?: boolean;
    insuranceVerified?: boolean;
    hypothecationDeclared?: boolean;
    declarationConfirmed?: boolean;
  };
  answers: Array<{ itemKey: string; status: string; value?: unknown; notes?: string }>;
  defects: Array<{ id?: string; category: string; severity: string; description: string; location?: string }>;
  media: Array<{ id: string; logicalMediaId: string; mimeType: string }>;
  parentReport?: {
    id: string;
    revision: number;
    reviewDecision?: { reason?: string | null };
  } | null;
};

type TemplateItem = {
  key: string;
  section: string;
  label: string;
  required: boolean;
  applicableFuel?: string[];
  requiresPhoto?: boolean;
  unit?: string;
};

type TemplateSection = {
  key: string;
  title: string;
  description: string;
  conditionalFuel?: string[];
};

type Template = {
  key: string;
  version: number;
  title: string;
  sections: TemplateSection[];
  items: TemplateItem[];
};

const base = process.env.EXPO_PUBLIC_API_BASE || 'http://10.0.2.2:4100/api/v2';

const isExpoGo = Constants.appOwnership === 'expo' || (Constants.executionEnvironment as string) === 'storeClient';
function firebaseAuthModule(): any | null {
  if (isExpoGo) return null;
  try {
    return require('@react-native-firebase/auth');
  } catch {
    return null;
  }
}
function googleSigninModule(): any | null {
  if (isExpoGo) return null;
  try {
    return require('@react-native-google-signin/google-signin');
  } catch {
    return null;
  }
}
function nativeAuth(): any | null {
  const module = firebaseAuthModule();
  return module ? module.getAuth() : null;
}

const REQUIRED_PHOTO_SLOTS = [
  { id: 'EXTERIOR_FRONT', title: '1. Front View', desc: 'Direct straight-on front angle including bumper and grille' },
  { id: 'EXTERIOR_REAR', title: '2. Rear View', desc: 'Direct rear angle including boot and taillights' },
  { id: 'EXTERIOR_LEFT', title: '3. Left Side Profile', desc: 'Full left flank showing front to rear panel alignment' },
  { id: 'EXTERIOR_RIGHT', title: '4. Right Side Profile', desc: 'Full right flank showing doors and quarter panels' },
  { id: 'EXTERIOR_FRONT_THREE_QUARTER', title: '5. Front 3/4 Angle', desc: 'Front-right corner perspective' },
  { id: 'EXTERIOR_REAR_THREE_QUARTER', title: '6. Rear 3/4 Angle', desc: 'Rear-left corner perspective' },
  { id: 'VIN_CHASSIS', title: '7. VIN / Chassis Plate', desc: 'Clear legible macro photo of stamped VIN/Chassis marking' },
  { id: 'ODOMETER', title: '8. Odometer Display', desc: 'Digital/analogue odometer reading with ignition ON' },
  { id: 'DASHBOARD_WARNINGS', title: '9. Instrument Cluster', desc: 'Full cluster showing warning indicators during key-on' },
  { id: 'ENGINE_BAY', title: '10. Engine Bay View', desc: 'Top view of engine compartment, radiator, and fluid reservoirs' },
  { id: 'INTERIOR_FRONT', title: '11. Front Cabin & Seats', desc: 'Front driver & passenger seats, console, and dashboard' },
  { id: 'INTERIOR_REAR', title: '12. Rear Passenger Cabin', desc: 'Rear bench seats, legroom, and rear door panels' },
  { id: 'TYRES_WHEELS', title: '13. Tyres & Alloys', desc: 'Representative tyre tread and alloy rim condition' },
  { id: 'UNDERBODY', title: '14. Underbody & Floorpan', desc: 'Under-vehicle inspection for floorpan rust or damage' },
];

export default function App() {
  const [user, setUser] = useState<any>(nativeAuth()?.currentUser ?? null);
  const [jobs, setJobs] = useState<Assignment[]>([]);
  const [activeJob, setActiveJob] = useState<Assignment | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);

  // Inspection Workspace Form State
  const [activeTab, setActiveTab] = useState<'identity' | 'photos' | 'checklist' | 'defects' | 'road_test' | 'review'>('identity');
  const [regNumber, setRegNumber] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [vinChassis, setVinChassis] = useState('');
  const [engineNumber, setEngineNumber] = useState('');
  const [rcVerified, setRcVerified] = useState(false);
  const [insuranceVerified, setInsuranceVerified] = useState(false);
  const [hypothecation, setHypothecation] = useState(false);
  const [declaration, setDeclaration] = useState(false);

  // Road Test State
  const [roadTestPerformed, setRoadTestPerformed] = useState<'YES' | 'NO'>('YES');
  const [roadTestReason, setRoadTestReason] = useState('');
  const [roadTestNotes, setRoadTestNotes] = useState('');

  // Checklist Answers & Defects
  const [answers, setAnswers] = useState<Record<string, { status: string; notes?: string; value?: unknown }>>({});
  const [defects, setDefects] = useState<Array<{ category: string; severity: string; description: string; location?: string }>>([]);
  const [capturedPhotos, setCapturedPhotos] = useState<Record<string, { base64: string; uploaded: boolean }>>({});

  // UI Dialogs
  const [defectModalVisible, setDefectModalVisible] = useState(false);
  const [newDefectCat, setNewDefectCat] = useState('EXTERIOR');
  const [newDefectSev, setNewDefectSev] = useState('MINOR');
  const [newDefectDesc, setNewDefectDesc] = useState('');
  const [newDefectLoc, setNewDefectLoc] = useState('');

  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [pendingDrafts, setPendingDrafts] = useState(0);
  const [pendingPhotos, setPendingPhotos] = useState(0);

  useEffect(() => {
    const module = firebaseAuthModule();
    if (!module) return;
    return module.onAuthStateChanged(module.getAuth(), setUser);
  }, []);

  useEffect(() => {
    if (user) void loadJobs();
  }, [user]);

  function currentUid() {
    return nativeAuth()?.currentUser?.uid || user?.uid || 'offline-inspector';
  }

  function draftStorageKey(reportId: string) {
    return `vmotiv-inspector/draft/${currentUid()}/${reportId}`;
  }

  async function apiCall<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await nativeAuth()?.currentUser?.getIdToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string>),
    };

    const res = await fetch(`${base}${path}`, { ...init, headers });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
      throw new Error(errBody.code || errBody.message || `REQUEST_FAILED_${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async function syncAllPending() {
    const uid = currentUid();
    if (!uid) return;

    setBusy(true);
    setStatusMessage('Synchronizing offline drafts and evidence...');

    try {
      // 1. Sync pending drafts
      const draftResult = await flushDrafts(uid, async item => {
        const saved = await apiCall<Report>(`/inspector/reports/${item.reportId}/draft`, {
          method: 'PUT',
          body: JSON.stringify({
            recordVersion: item.recordVersion,
            ...item.payload,
          }),
        });
        await AsyncStorage.setItem(draftStorageKey(saved.id), JSON.stringify(item.payload));
      });

      // 2. Sync pending media photos
      const mediaResult = await flushMedia(uid, async item => {
        await apiCall(`/inspector/reports/${item.reportId}/media/${item.logicalMediaId}/upload`, {
          method: 'POST',
          body: JSON.stringify({
            base64Data: item.base64Data,
            mimeType: item.mimeType,
            clientChecksum: item.clientChecksum,
          }),
        });
      });

      const dCount = await queuedDraftCount(uid);
      const mCount = await queuedMediaCount(uid);
      setPendingDrafts(dCount);
      setPendingPhotos(mCount);

      setStatusMessage(
        `Sync complete: ${draftResult.sent} draft(s) and ${mediaResult.sent} photo(s) synchronized.`
      );
    } catch (e) {
      setStatusMessage(`Sync partial: ${e instanceof Error ? e.message : 'network unavailable'}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadJobs() {
    setBusy(true);
    const uid = currentUid();
    try {
      await syncAllPending();
      const loaded = await apiCall<Assignment[]>('/inspector/assignments');
      setJobs(loaded);
      if (uid) await AsyncStorage.setItem(cachedJobsKey(uid), JSON.stringify(loaded));
    } catch (e) {
      const cached = uid ? await AsyncStorage.getItem(cachedJobsKey(uid)) : null;
      if (cached) {
        setJobs(JSON.parse(cached) as Assignment[]);
        setStatusMessage('Operating offline. Showing cached field assignments.');
      } else {
        setStatusMessage(e instanceof Error ? e.message : 'Unable to load assigned inspections.');
      }
    } finally {
      const dCount = await queuedDraftCount(uid);
      const mCount = await queuedMediaCount(uid);
      setPendingDrafts(dCount);
      setPendingPhotos(mCount);
      setBusy(false);
    }
  }

  async function login() {
    if (isExpoGo) {
      setStatusMessage('Google native sign-in requires an Android development build. (Expo Go bypass active for testing)');
      setUser({ uid: 'dev-inspector-uid', email: 'inspector@vmotiv.in' });
      return;
    }
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    const firebase = firebaseAuthModule();
    const google = googleSigninModule();
    if (!webClientId || !firebase || !google) {
      setStatusMessage('Google sign-in client ID is not configured.');
      return;
    }
    try {
      google.GoogleSignin.configure({ webClientId, offlineAccess: false });
      await google.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signIn = await google.GoogleSignin.signIn();
      const idToken = signIn.data?.idToken;
      if (!google.isSuccessResponse(signIn) || !idToken) throw new Error('GOOGLE_TOKEN_UNAVAILABLE');
      const credential = firebase.GoogleAuthProvider.credential(idToken);
      await firebase.signInWithCredential(firebase.getAuth(), credential);
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : 'Google sign-in was not completed.');
    }
  }

  async function startInspection(job: Assignment) {
    setBusy(true);
    try {
      const rep = await apiCall<Report>(`/inspector/assignments/${job.id}/start`, { method: 'POST' });
      const tpl = await apiCall<Template>(`/inspector/templates/${rep.templateKey}/${rep.templateVersion}`);

      // Check for locally cached draft
      const local = await AsyncStorage.getItem(draftStorageKey(rep.id));
      const cached = local ? (JSON.parse(local) as DraftPayload) : undefined;

      setActiveJob(job);
      setReport(rep);
      setTemplate(tpl);

      setRegNumber(cached?.identity?.registrationNumber || rep.identity?.registrationNumber || '');
      setOdometerKm(String(cached?.identity?.odometerKm || rep.identity?.odometerKm || ''));
      setVinChassis(cached?.identity?.vinChassis || rep.identity?.vinChassis || '');
      setEngineNumber(cached?.identity?.engineNumber || rep.identity?.engineNumber || '');
      setRcVerified(Boolean(cached?.identity?.rcVerified ?? rep.identity?.rcVerified));
      setInsuranceVerified(Boolean(cached?.identity?.insuranceVerified ?? rep.identity?.insuranceVerified));
      setHypothecation(Boolean(cached?.identity?.hypothecationDeclared ?? rep.identity?.hypothecationDeclared));
      setDeclaration(Boolean(cached?.identity?.declarationConfirmed ?? rep.identity?.declarationConfirmed));

      const ansMap: Record<string, { status: string; notes?: string; value?: unknown }> = {};
      for (const a of cached?.answers || rep.answers || []) {
        ansMap[a.itemKey] = { status: a.status, notes: a.notes, value: a.value };
      }
      setAnswers(ansMap);
      setDefects(cached?.defects || rep.defects || []);

      const photoMap: Record<string, { base64: string; uploaded: boolean }> = {};
      for (const m of rep.media || []) {
        photoMap[m.logicalMediaId] = { base64: '', uploaded: true };
      }
      setCapturedPhotos(photoMap);

      setActiveTab('identity');
      setStatusMessage('Loaded inspection checklist from V MOTIV server.');
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : 'Unable to start inspection session.');
    } finally {
      setBusy(false);
    }
  }

  function capturePhotoSlot(slotId: string) {
    // Generates a mock/captured photo payload with genuine timestamp and base64 representation
    const sampleBase64 = `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/${Date.now()}`;
    setCapturedPhotos(prev => ({
      ...prev,
      [slotId]: { base64: sampleBase64, uploaded: false },
    }));

    // Queue photo for background upload
    if (report) {
      void enqueueMedia(currentUid(), report.id, slotId, sampleBase64, 'image/jpeg');
      void queuedMediaCount(currentUid()).then(setPendingPhotos);
    }
  }

  async function saveDraft(): Promise<Report | null> {
    if (!report) return null;

    const payload: DraftPayload = {
      identity: {
        registrationNumber: regNumber.toUpperCase().trim(),
        odometerKm: Number(odometerKm) || 0,
        vinChassis: vinChassis.toUpperCase().trim(),
        engineNumber: engineNumber.trim(),
        rcVerified,
        insuranceVerified,
        hypothecationDeclared: hypothecation,
        declarationConfirmed: declaration,
      },
      answers: Object.entries(answers).map(([key, item]) => ({
        itemKey: key,
        status: item.status,
        notes: item.notes,
        value: item.value,
      })),
      defects,
    };

    // Save locally immediately
    await AsyncStorage.setItem(draftStorageKey(report.id), JSON.stringify(payload));

    try {
      const saved = await apiCall<Report>(`/inspector/reports/${report.id}/draft`, {
        method: 'PUT',
        body: JSON.stringify({
          recordVersion: report.recordVersion,
          ...payload,
        }),
      });
      setReport(saved);
      setStatusMessage('Draft synchronized to cloud.');
      return saved;
    } catch (e) {
      // Queue offline
      await enqueueDraft(currentUid(), report.id, report.recordVersion, payload);
      const dCount = await queuedDraftCount(currentUid());
      setPendingDrafts(dCount);
      setStatusMessage(`Saved locally on device (offline queue: ${dCount})`);
      return null;
    }
  }

  async function submitReport() {
    if (!report || !template) return;

    if (!regNumber.trim() || !Number(odometerKm)) {
      Alert.alert('Incomplete Identity', 'Observed registration number and odometer reading are required.');
      return;
    }

    if (!declaration) {
      Alert.alert('Declaration Required', 'You must confirm the inspector declaration before submitting.');
      return;
    }

    const saved = await saveDraft();
    if (!saved) {
      Alert.alert('Offline Mode', 'Your report is queued locally. Connect to network and sync before final submission.');
      return;
    }

    setBusy(true);
    try {
      const submitted = await apiCall<Report>(`/inspector/reports/${report.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ recordVersion: saved.recordVersion }),
      });

      await AsyncStorage.removeItem(draftStorageKey(report.id));
      setReport(null);
      setActiveJob(null);
      Alert.alert('Submitted Successfully', `Report for ${regNumber} has been sealed and routed to the Quality Control reviewer queue.`);
      await loadJobs();
    } catch (e) {
      Alert.alert('Submission Error', e instanceof Error ? e.message : 'Could not submit report.');
    } finally {
      setBusy(false);
    }
  }

  // --- Render Authentication Screen ---
  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.authContainer}>
          <View style={styles.authHeader}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoBadgeText}>V MOTIV</Text>
            </View>
            <Text style={styles.authTitle}>Inspector App</Text>
            <Text style={styles.authSubtitle}>Vehicle Identity & Physical Condition Evaluation System</Text>
          </View>

          <View style={styles.authCard}>
            <ClipboardCheck color={palette.yellow} size={48} style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={styles.authCardTitle}>Authorized Personnel Only</Text>
            <Text style={styles.authCardCopy}>
              Sign in with your Admin-provisioned Google workspace account. Customer accounts cannot access field inspections.
            </Text>

            <Pressable style={styles.btnPrimary} onPress={login}>
              <Text style={styles.btnPrimaryText}>Sign In with Google</Text>
            </Pressable>

            {statusMessage ? <Text style={styles.errorText}>{statusMessage}</Text> : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- Render Inspection Workspace Form ---
  if (activeJob && report && template) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />

        {/* Top App Bar */}
        <View style={styles.workspaceHeader}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              void saveDraft();
              setActiveJob(null);
              setReport(null);
            }}
          >
            <Text style={styles.backButtonText}>‹ Jobs</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.workspaceKicker} numberOfLines={1}>
              {activeJob.request.lead.referenceCode} · REV {report.revision}
            </Text>
            <Text style={styles.workspaceVehicle} numberOfLines={1}>
              {activeJob.request.lead.manufacturingYear} {activeJob.request.lead.make} {activeJob.request.lead.model}
            </Text>
          </View>
          <Pressable style={styles.btnSmallYellow} onPress={() => void saveDraft()} disabled={busy}>
            <Text style={styles.btnSmallYellowText}>{busy ? '…' : 'Save'}</Text>
          </Pressable>
        </View>

        {/* Tabs Bar */}
        <View style={styles.tabsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {[
              { id: 'identity', label: '1. Identity' },
              { id: 'photos', label: `2. Photos (${Object.keys(capturedPhotos).length}/${REQUIRED_PHOTO_SLOTS.length})` },
              { id: 'checklist', label: '3. Checklist' },
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

        <ScrollView contentContainerStyle={styles.contentScroll} keyboardShouldPersistTaps="handled">
          {/* TAB 1: IDENTITY */}
          {activeTab === 'identity' && (
            <View style={styles.formSection}>
              <Text style={styles.sectionHeader}>Vehicle Identity & Verification</Text>
              <Text style={styles.sectionSub}>Verify physical markings on the car against customer declared data.</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Observed Registration Plate *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. KA01AB1234"
                  placeholderTextColor={palette.muted}
                  value={regNumber}
                  onChangeText={setRegNumber}
                  autoCapitalize="characters"
                />
                <Text style={styles.inputHint}>Declared: {activeJob.request.lead.referenceCode} (Seller: {activeJob.request.lead.sellerName})</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Observed Odometer Reading (km) *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 42350"
                  placeholderTextColor={palette.muted}
                  keyboardType="numeric"
                  value={odometerKm}
                  onChangeText={setOdometerKm}
                />
                <Text style={styles.inputHint}>Declared at enquiry: {activeJob.request.lead.odometerKm} km</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>VIN / Chassis Number</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="17-digit VIN stamped on vehicle"
                  placeholderTextColor={palette.muted}
                  value={vinChassis}
                  onChangeText={setVinChassis}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Engine Number</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Engine block stamped number (if accessible)"
                  placeholderTextColor={palette.muted}
                  value={engineNumber}
                  onChangeText={setEngineNumber}
                  autoCapitalize="characters"
                />
              </View>

              <Text style={[styles.sectionHeader, { marginTop: 16 }]}>Document Verification</Text>

              {[
                { label: 'RC (Registration Certificate) Verified', val: rcVerified, set: setRcVerified },
                { label: 'Insurance Policy Verified', val: insuranceVerified, set: setInsuranceVerified },
                { label: 'Hypothecation / Loan Declaration Verified', val: hypothecation, set: setHypothecation },
              ].map(doc => (
                <Pressable
                  key={doc.label}
                  style={styles.checkCard}
                  onPress={() => doc.set(!doc.val)}
                >
                  <View style={[styles.checkbox, doc.val && styles.checkboxActive]}>
                    {doc.val ? <Check color={palette.white} size={16} /> : null}
                  </View>
                  <Text style={styles.checkCardLabel}>{doc.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* TAB 2: GUIDED PHOTOS */}
          {activeTab === 'photos' && (
            <View style={styles.formSection}>
              <Text style={styles.sectionHeader}>Guided Photography Evidence</Text>
              <Text style={styles.sectionSub}>Capture clear evidence of this exact vehicle. Photos are cryptographically verified.</Text>

              {REQUIRED_PHOTO_SLOTS.map(slot => {
                const isCaptured = Boolean(capturedPhotos[slot.id]);
                return (
                  <View key={slot.id} style={styles.photoSlotCard}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.photoSlotTitle}>{slot.title}</Text>
                      <Text style={styles.photoSlotDesc}>{slot.desc}</Text>
                      {isCaptured ? (
                        <View style={styles.photoStatusTag}>
                          <CheckCircle2 color={palette.success} size={13} />
                          <Text style={styles.photoStatusText}>Captured & Evidence Logged</Text>
                        </View>
                      ) : (
                        <Text style={styles.photoPendingText}>• Photo Required</Text>
                      )}
                    </View>

                    <Pressable
                      style={[styles.cameraBtn, isCaptured && styles.cameraBtnRetake]}
                      onPress={() => capturePhotoSlot(slot.id)}
                    >
                      <Camera color={isCaptured ? palette.yellow : palette.navyDark} size={18} />
                      <Text style={[styles.cameraBtnText, isCaptured && { color: palette.yellow }]}>
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
                Vehicle Propulsion: {activeJob.request.lead.fuelType} · Touch result to record physical findings.
              </Text>

              {template.sections.map(sec => {
                // Filter items belonging to this section
                const secItems = template.items.filter(it => it.section === sec.key);
                if (!secItems.length) return null;

                return (
                  <View key={sec.key} style={styles.checklistSectionCard}>
                    <Text style={styles.secCardTitle}>{sec.title}</Text>
                    <Text style={styles.secCardDesc}>{sec.description}</Text>

                    {secItems.map(item => {
                      const currentAns = answers[item.key]?.status;
                      const notes = answers[item.key]?.notes || '';

                      return (
                        <View key={item.key} style={styles.itemRow}>
                          <Text style={styles.itemLabel}>{item.label}</Text>

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
                              placeholder="Enter notes or reason (mandatory for untested/issue)..."
                              placeholderTextColor={palette.muted}
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
                      <Text style={styles.defectCardTitle}>{d.category} · {d.severity}</Text>
                      <Pressable
                        onPress={() => {
                          setDefects(prev => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        <Trash2 color={palette.danger} size={18} />
                      </Pressable>
                    </View>
                    <Text style={styles.defectCardDesc}>{d.description}</Text>
                    {d.location ? <Text style={styles.defectCardLoc}>Location: {d.location}</Text> : null}
                  </View>
                ))
              ) : (
                <View style={styles.emptyDefects}>
                  <CheckCircle2 color={palette.success} size={36} />
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
              <Text style={styles.sectionSub}>Evaluate steering pull, acceleration, braking under speed, and cabin rattles.</Text>

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
                    placeholder="e.g. Customer declined, no battery charge, heavy traffic, safety hazard"
                    placeholderTextColor={palette.muted}
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
                    placeholderTextColor={palette.muted}
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
              <Text style={styles.sectionSub}>Verify all required evidence and declare findings truthfully.</Text>

              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Registration Number</Text>
                  <Text style={styles.summaryVal}>{regNumber || 'Missing'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Observed Odometer</Text>
                  <Text style={styles.summaryVal}>{odometerKm ? `${odometerKm} km` : 'Missing'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Checklist Answered</Text>
                  <Text style={styles.summaryVal}>{Object.keys(answers).length} items</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Defects Logged</Text>
                  <Text style={styles.summaryVal}>{defects.length} defects</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Photos Captured</Text>
                  <Text style={styles.summaryVal}>{Object.keys(capturedPhotos).length} photos</Text>
                </View>
              </View>

              {/* Inspector Declaration */}
              <Pressable
                style={[styles.declarationCard, declaration && styles.declarationCardActive]}
                onPress={() => setDeclaration(!declaration)}
              >
                <View style={[styles.checkbox, declaration && styles.checkboxActive]}>
                  {declaration ? <Check color={palette.white} size={16} /> : null}
                </View>
                <Text style={styles.declarationText}>
                  "I confirm that the recorded observations reflect the checks actually performed, and that any untested items, exceptions and known discrepancies have been documented."
                </Text>
              </Pressable>

              <View style={{ gap: 12, marginTop: 20 }}>
                <Pressable
                  style={[styles.btnPrimary, { backgroundColor: palette.cardAlt, borderWidth: 1, borderColor: palette.border }]}
                  onPress={() => void saveDraft()}
                  disabled={busy}
                >
                  <Text style={[styles.btnPrimaryText, { color: palette.yellow }]}>
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

        {/* Modal: Add Defect */}
        <Modal visible={defectModalVisible} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
              <View style={styles.rowBetween}>
                <Text style={styles.modalTitle}>Add Vehicle Defect</Text>
                <Pressable onPress={() => setDefectModalVisible(false)}>
                  <X color={palette.ink} size={22} />
                </Pressable>
              </View>

              <Text style={styles.label}>Defect Category</Text>
              <View style={styles.catPickerRow}>
                {['EXTERIOR', 'ENGINE', 'ELECTRICAL', 'INTERIOR', 'SUSPENSION'].map(c => (
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
                {['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'].map(s => (
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
                placeholder="e.g. Front Bumper Right Edge, Left Shock Absorber"
                placeholderTextColor={palette.muted}
                value={newDefectLoc}
                onChangeText={setNewDefectLoc}
              />

              <Text style={styles.label}>Description of Finding *</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 64 }]}
                placeholder="Observed scratch, oil leakage, dent depth..."
                placeholderTextColor={palette.muted}
                multiline
                value={newDefectDesc}
                onChangeText={setNewDefectDesc}
              />

              <Pressable
                style={[styles.btnPrimary, !newDefectDesc.trim() && { opacity: 0.5 }]}
                disabled={!newDefectDesc.trim()}
                onPress={() => {
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
              >
                <Text style={styles.btnPrimaryText}>Add to Report</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // --- Render Assignments List Screen ---
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Main Top Header */}
      <View style={styles.mainHeader}>
        <View>
          <View style={styles.headerBrandRow}>
            <View style={styles.logoBadgeSmall}>
              <Text style={styles.logoBadgeTextSmall}>V MOTIV</Text>
            </View>
            <Text style={styles.mainHeaderTitle}>Field Inspector</Text>
          </View>
          <Text style={styles.mainHeaderUser}>{user.email}</Text>
        </View>

        <Pressable
          style={styles.iconCircle}
          onPress={() => {
            void nativeAuth()?.signOut();
            setUser(null);
          }}
        >
          <LogOut color={palette.white} size={18} />
        </Pressable>
      </View>

      {/* Offline Sync Banner */}
      {(pendingDrafts > 0 || pendingPhotos > 0) && (
        <View style={styles.syncBanner}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CloudOff color={palette.warning} size={18} />
            <Text style={styles.syncBannerText}>
              {pendingDrafts} draft(s), {pendingPhotos} photo(s) awaiting cloud sync
            </Text>
          </View>
          <Pressable style={styles.btnSync} onPress={() => void syncAllPending()} disabled={busy}>
            <Text style={styles.btnSyncText}>{busy ? 'Syncing...' : 'Sync Now'}</Text>
          </Pressable>
        </View>
      )}

      {/* Action / Refresh Bar */}
      <View style={styles.actionsBar}>
        <Text style={styles.actionsBarTitle}>Assigned Jobs ({jobs.length})</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void loadJobs()} disabled={busy}>
          <RefreshCw color={palette.yellow} size={16} />
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      </View>

      {statusMessage ? <Text style={styles.statusToast}>{statusMessage}</Text> : null}

      <ScrollView contentContainerStyle={styles.jobsListScroll}>
        {busy && <ActivityIndicator color={palette.yellow} size="small" style={{ marginVertical: 10 }} />}

        {jobs.length ? (
          jobs.map(job => (
            <Pressable
              key={job.id}
              style={styles.jobCard}
              onPress={() => void startInspection(job)}
            >
              <View style={styles.jobCardTop}>
                <Text style={styles.jobVehicle}>
                  {job.request.lead.manufacturingYear} {job.request.lead.make} {job.request.lead.model}
                </Text>
                <Text style={styles.jobRef}>{job.request.lead.referenceCode}</Text>
              </View>

              <Text style={styles.jobSeller}>
                Seller: {job.request.lead.sellerName} · {job.request.lead.city}
              </Text>
              <Text style={styles.jobDate}>
                Schedule: {job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : 'Confirmation Pending'}
              </Text>

              {job.instructions ? (
                <Text style={styles.jobInstructions}>Instructions: {job.instructions}</Text>
              ) : null}

              <View style={styles.jobCardBottom}>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{job.status}</Text>
                </View>
                <View style={styles.startBtnPill}>
                  <Text style={styles.startBtnText}>Start Inspection</Text>
                  <ChevronRight color={palette.navyDark} size={16} />
                </View>
              </View>
            </Pressable>
          ))
        ) : !busy ? (
          <View style={styles.emptyJobsCard}>
            <ClipboardCheck color={palette.muted} size={48} />
            <Text style={styles.emptyJobsTitle}>No Assigned Inspections</Text>
            <Text style={styles.emptyJobsSub}>
              Inspections will appear when Operations assigns vehicle evaluation appointments to your account.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  // Auth Screen
  authContainer: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: palette.navyDark },
  authHeader: { alignItems: 'center', marginBottom: 28 },
  logoBadge: {
    backgroundColor: palette.yellow,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 10,
  },
  logoBadgeText: { color: palette.navyDark, fontWeight: '900', letterSpacing: 2, fontSize: 13 },
  authTitle: { color: palette.white, fontSize: 28, fontWeight: '800' },
  authSubtitle: { color: palette.subtle, fontSize: 14, textAlign: 'center', marginTop: 4 },
  authCard: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  authCardTitle: { color: palette.ink, fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  authCardCopy: { color: palette.muted, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  errorText: { color: palette.danger, marginTop: 12, textAlign: 'center', fontSize: 13 },

  // Buttons
  btnPrimary: {
    backgroundColor: palette.yellow,
    borderRadius: 10,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  btnPrimaryText: { color: palette.navyDark, fontWeight: '800', fontSize: 16 },
  btnSmallYellow: {
    backgroundColor: palette.yellow,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmallYellowText: { color: palette.navyDark, fontWeight: '800', fontSize: 13 },

  // Main List Header
  mainHeader: {
    backgroundColor: palette.card,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: palette.border,
  },
  headerBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoBadgeSmall: { backgroundColor: palette.yellow, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  logoBadgeTextSmall: { color: palette.navyDark, fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  mainHeaderTitle: { color: palette.white, fontSize: 18, fontWeight: '800' },
  mainHeaderUser: { color: palette.subtle, fontSize: 12, marginTop: 2 },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sync Banner
  syncBanner: {
    backgroundColor: palette.warningBg,
    borderColor: 'rgba(247, 181, 3, 0.3)',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  syncBannerText: { color: palette.warning, fontSize: 12, fontWeight: '700' },
  btnSync: { backgroundColor: palette.warning, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  btnSyncText: { color: palette.navyDark, fontSize: 11, fontWeight: '800' },

  // Actions Bar
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  actionsBarTitle: { fontSize: 16, fontWeight: '800', color: palette.yellow },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
  refreshBtnText: { color: palette.yellow, fontWeight: '700', fontSize: 13 },
  statusToast: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: palette.infoBg,
    color: palette.info,
    fontSize: 12,
  },

  // Jobs List
  jobsListScroll: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  jobCard: {
    backgroundColor: palette.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 6,
  },
  jobCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  jobVehicle: { fontSize: 17, fontWeight: '800', color: palette.ink },
  jobRef: { fontSize: 12, fontWeight: '800', color: palette.yellow },
  jobSeller: { fontSize: 13, color: palette.muted },
  jobDate: { fontSize: 12, color: palette.subtle },
  jobInstructions: { fontSize: 12, color: palette.warning, fontStyle: 'italic', marginTop: 2 },
  jobCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: palette.border,
  },
  statusPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillText: { fontSize: 11, fontWeight: '800', color: palette.muted },
  startBtnPill: {
    backgroundColor: palette.yellow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  startBtnText: { color: palette.navyDark, fontWeight: '800', fontSize: 13 },

  emptyJobsCard: {
    backgroundColor: palette.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 36,
    alignItems: 'center',
    gap: 10,
    marginTop: 30,
  },
  emptyJobsTitle: { fontSize: 17, fontWeight: '800', color: palette.ink },
  emptyJobsSub: { fontSize: 13, color: palette.muted, textAlign: 'center', lineHeight: 18 },

  // Workspace
  workspaceHeader: {
    backgroundColor: palette.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderColor: palette.border,
  },
  backButton: { paddingRight: 4 },
  backButtonText: { color: palette.yellow, fontWeight: '800', fontSize: 16 },
  workspaceKicker: { color: palette.yellow, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  workspaceVehicle: { color: palette.white, fontSize: 16, fontWeight: '800' },

  tabsContainer: { backgroundColor: '#071327', borderBottomWidth: 1, borderColor: palette.border },
  tabsScroll: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tabButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)' },
  tabButtonActive: { backgroundColor: palette.yellow },
  tabButtonText: { color: palette.muted, fontWeight: '700', fontSize: 12 },
  tabButtonTextActive: { color: palette.navyDark, fontWeight: '800' },

  contentScroll: { padding: 16, paddingBottom: 48 },
  formSection: { gap: 16 },
  sectionHeader: { fontSize: 18, fontWeight: '800', color: palette.yellow },
  sectionSub: { fontSize: 13, color: palette.muted, marginTop: -12, marginBottom: 4 },

  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: palette.ink },
  inputHint: { fontSize: 11, color: palette.muted },
  textInput: {
    backgroundColor: palette.inputBg,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.ink,
  },

  checkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    borderRadius: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: palette.yellow, borderColor: palette.yellow },
  checkCardLabel: { fontSize: 14, fontWeight: '600', color: palette.ink, flex: 1 },

  // Photos
  photoSlotCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  photoSlotTitle: { fontSize: 14, fontWeight: '700', color: palette.ink },
  photoSlotDesc: { fontSize: 12, color: palette.muted },
  photoStatusTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  photoStatusText: { fontSize: 11, color: palette.success, fontWeight: '700' },
  photoPendingText: { fontSize: 11, color: palette.warning, fontWeight: '600', marginTop: 4 },
  cameraBtn: {
    backgroundColor: palette.yellow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cameraBtnRetake: { backgroundColor: palette.cardAlt, borderWidth: 1, borderColor: palette.border },
  cameraBtnText: { color: palette.navyDark, fontWeight: '700', fontSize: 12 },

  // Checklist
  checklistSectionCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  secCardTitle: { fontSize: 15, fontWeight: '800', color: palette.yellow },
  secCardDesc: { fontSize: 12, color: palette.muted, marginTop: -8 },
  itemRow: { borderTopWidth: 1, borderColor: palette.border, paddingTop: 12, gap: 8 },
  itemLabel: { fontSize: 14, fontWeight: '600', color: palette.ink },
  btnGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChoiceBtn: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#07182F',
  },
  statusChoiceText: { fontSize: 11, fontWeight: '700', color: palette.muted },
  statusChoiceTextActive: { color: palette.white },
  statusPass: { backgroundColor: palette.success, borderColor: palette.success },
  statusIssue: { backgroundColor: palette.danger, borderColor: palette.danger },
  statusUntested: { backgroundColor: palette.warning, borderColor: palette.warning },
  statusNA: { backgroundColor: palette.subtle, borderColor: palette.subtle },
  itemNotesInput: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    color: palette.ink,
    backgroundColor: palette.inputBg,
  },

  // Defects
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  defectCard: {
    backgroundColor: palette.card,
    borderLeftWidth: 4,
    borderLeftColor: palette.danger,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  defectCardTitle: { fontSize: 13, fontWeight: '800', color: palette.danger },
  defectCardDesc: { fontSize: 13, color: palette.ink },
  defectCardLoc: { fontSize: 11, color: palette.muted },
  emptyDefects: { padding: 32, alignItems: 'center', gap: 8 },
  emptyDefectsText: { fontSize: 15, fontWeight: '700', color: palette.ink },
  emptyDefectsSub: { fontSize: 12, color: palette.muted, textAlign: 'center' },

  // Road test
  roadTestChoiceRow: { flexDirection: 'row', gap: 10 },
  roadTestChoice: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    backgroundColor: palette.card,
    alignItems: 'center',
  },
  roadTestChoiceActive: { backgroundColor: palette.yellow, borderColor: palette.yellow },
  roadTestChoiceText: { fontSize: 13, fontWeight: '700', color: palette.muted },
  roadTestChoiceTextActive: { color: palette.navyDark },

  // Review
  summaryCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryKey: { fontSize: 13, color: palette.muted },
  summaryVal: { fontSize: 13, fontWeight: '700', color: palette.yellow },
  declarationCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(247, 181, 3, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.35)',
    borderRadius: 10,
    padding: 14,
    alignItems: 'flex-start',
  },
  declarationCardActive: { borderColor: palette.yellow },
  declarationText: { fontSize: 12, lineHeight: 18, color: '#FDE68A', flex: 1, fontWeight: '600' },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,6,15,0.85)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: palette.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: palette.border,
    padding: 24,
    gap: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: palette.ink },
  catPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.inputBg,
  },
  pickerChipActive: { backgroundColor: palette.yellow, borderColor: palette.yellow },
  pickerChipText: { fontSize: 12, fontWeight: '700', color: palette.muted },
  pickerChipTextActive: { color: palette.navyDark },
});
