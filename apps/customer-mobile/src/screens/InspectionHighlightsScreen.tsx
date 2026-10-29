import React, { useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Gauge,
  Info,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
  XCircle,
} from 'lucide-react-native';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import type { RootStack } from '../navigation/types';
import type { CustomerVehicleProfile, InspectionAuditDetails, InspectionDefectItem } from '../types';

type Props = NativeStackScreenProps<RootStack, 'InspectionHighlights'>;

type TabKey = 'DEFECTS' | 'SYSTEMS' | 'DIAGNOSTICS';

export function InspectionHighlightsScreen({ route, navigation }: Props) {
  const { verifiedTags, features, reportUrl, inspectionDetails, customerProfile } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const effectiveProfile: CustomerVehicleProfile | null | undefined =
    customerProfile || (inspectionDetails as any)?.customerProfile;

  const [activeTab, setActiveTab] = useState<TabKey>('DEFECTS');
  const [selectedPhoto, setSelectedPhoto] = useState<InspectionDefectItem | null>(null);
  const [defectFilter, setDefectFilter] = useState<string>('ALL');

  if (!inspectionDetails) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Inspection report</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={[styles.content, { flex: 1, justifyContent: 'center' }]}>
          <View style={styles.emptyCard}>
            <FileText size={32} color={colors.brandAccent} />
            <Text style={styles.emptyTitle}>Report not published yet</Text>
            <Text style={styles.emptySub}>The vehicle can be viewed, but its approved inspection report is not available for customer viewing yet.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // This screen only presents the approved report returned by the API.
  const audit: InspectionAuditDetails = inspectionDetails;

  const filteredDefects = audit.defects.filter(d => {
    if (defectFilter === 'ALL') return true;
    return d.category === defectFilter;
  });

  const categories = ['ALL', ...Array.from(new Set(audit.defects.map(d => d.category)))];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inspection report</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Certification Score Card */}
        <View style={styles.scoreBanner}>
          <View style={styles.scoreHeaderRow}>
            <View style={styles.badgeRow}>
              <ShieldCheck size={20} color={colors.brandAccent} />
              <Text style={styles.badgeLabel}>{audit.certificationBadge}</Text>
            </View>
            <View style={styles.scorePill}>
              <Text style={styles.scorePillText}>{audit.certificationScore}</Text>
            </View>
          </View>

          <Text style={styles.scoreSummaryTitle}>Approved V MOTIV inspection</Text>
          <Text style={styles.scoreSummarySub}>
            This report shows only checks and findings that were approved for customer viewing.
          </Text>

          <View style={styles.metricRow}>
            <View style={styles.metricCol}>
              <Text style={styles.metricNum}>{audit.totalChecksCount}</Text>
              <Text style={styles.metricLabel}>Total Checks</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricCol}>
              <Text style={[styles.metricNum, { color: '#61D99A' }]}>{audit.passedChecksCount}</Text>
              <Text style={styles.metricLabel}>Passed Clean</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricCol}>
              <Text style={[styles.metricNum, { color: colors.brandAccent }]}>{audit.imperfectionsCount}</Text>
              <Text style={styles.metricLabel}>Cosmetic Defects</Text>
            </View>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'DEFECTS' && styles.tabButtonActive]}
            onPress={() => setActiveTab('DEFECTS')}
          >
            <Camera size={15} color={activeTab === 'DEFECTS' ? '#061A38' : colors.textMuted} />
            <Text style={[styles.tabButtonText, activeTab === 'DEFECTS' && styles.tabButtonTextActive]}>
              Defects & Photos ({audit.defects.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'SYSTEMS' && styles.tabButtonActive]}
            onPress={() => setActiveTab('SYSTEMS')}
          >
            <Wrench size={15} color={activeTab === 'SYSTEMS' ? '#061A38' : colors.textMuted} />
            <Text style={[styles.tabButtonText, activeTab === 'SYSTEMS' && styles.tabButtonTextActive]}>
              200-Pt Inspection
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'DIAGNOSTICS' && styles.tabButtonActive]}
            onPress={() => setActiveTab('DIAGNOSTICS')}
          >
            <Gauge size={15} color={activeTab === 'DIAGNOSTICS' ? '#061A38' : colors.textMuted} />
            <Text style={[styles.tabButtonText, activeTab === 'DIAGNOSTICS' && styles.tabButtonTextActive]}>
              Summary & QC
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: DEFECTS & DEFECTIVE PHOTOS (LIKE SPINNY) */}
        {activeTab === 'DEFECTS' && (
          <View style={styles.section}>
            {/* Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.filterPill, defectFilter === cat && styles.filterPillActive]}
                  onPress={() => setDefectFilter(cat)}
                >
                  <Text style={[styles.filterPillText, defectFilter === cat && styles.filterPillTextActive]}>
                    {cat === 'ALL' ? 'All Defects' : cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.tabSectionKicker}>
              Tap any photograph to zoom into the documented imperfection.
            </Text>

            {filteredDefects.map((defect) => (
              <View key={defect.id} style={styles.defectCard}>
                {/* Defect Photo with tap zoom */}
                {defect.photoUrl ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.defectImageWrapper}
                    onPress={() => setSelectedPhoto(defect)}
                  >
                    <Image source={{ uri: defect.photoUrl }} style={styles.defectImage} resizeMode="cover" />
                    <View style={styles.defectImageOverlay}>
                      <Eye size={14} color="#FFFFFF" />
                      <Text style={styles.defectImageOverlayText}>Tap to zoom</Text>
                    </View>
                    <View style={styles.defectSeverityPill}>
                      <Text style={styles.defectSeverityText}>{defect.severity}</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.defectImageWrapper}>
                    <FileText size={28} color={colors.textMuted} />
                    <Text style={styles.defectImageOverlayText}>No photo was published for this finding</Text>
                  </View>
                )}

                {/* Defect Details */}
                <View style={styles.defectInfo}>
                  <View style={styles.defectTitleRow}>
                    <Text style={styles.defectTitle}>{defect.title}</Text>
                    <View style={[styles.repairedPill, defect.repaired ? styles.repairedDone : styles.repairedAsIs]}>
                      <Text style={[styles.repairedText, { color: defect.repaired ? '#61D99A' : colors.brandAccent }]}>
                        {defect.repaired ? 'Touch-up Done' : 'As-Is Cosmetic'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.defectMetaRow}>
                    <Text style={styles.defectPartLocation}>📍 {defect.location}</Text>
                    <Text style={styles.defectCategoryTag}>{defect.category}</Text>
                  </View>

                  <Text style={styles.defectDesc}>{defect.description}</Text>

                  <View style={styles.actionTakenBox}>
                    <Info size={14} color={colors.brandAccent} />
                    <Text style={styles.actionTakenText}>{defect.actionTaken}</Text>
                  </View>
                </View>
              </View>
            ))}

            {filteredDefects.length === 0 && (
              <View style={styles.emptyCard}>
                <CheckCircle2 size={32} color="#61D99A" />
                <Text style={styles.emptyTitle}>Zero Defects in Category</Text>
                <Text style={styles.emptySub}>No cosmetic or structural imperfections found in this area.</Text>
              </View>
            )}
          </View>
        )}

        {/* TAB 2: 200-POINT SYSTEMS AUDIT */}
        {activeTab === 'SYSTEMS' && (
          <View style={styles.section}>
            <Text style={styles.tabSectionKicker}>
              Recorded check groups approved for customer viewing.
            </Text>

            {audit.systems.map((sys, idx) => (
              <View key={idx} style={styles.systemCard}>
                <View style={styles.systemHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.systemName}>{sys.name}</Text>
                    <Text style={styles.systemPoints}>{sys.pointsCount} Points Verified</Text>
                  </View>
                  <View style={styles.systemBadge}>
                    <CheckCircle2 size={14} color="#61D99A" />
                    <Text style={styles.systemBadgeText}>{sys.status}</Text>
                  </View>
                </View>
                <Text style={styles.systemHighlights}>{sys.highlights}</Text>
              </View>
            ))}
            {audit.systems.length === 0 && (
              <View style={styles.emptyCard}>
                <FileText size={28} color={colors.brandAccent} />
                <Text style={styles.emptyTitle}>Check groups not published</Text>
                <Text style={styles.emptySub}>The approved report includes the overall check count and any recorded findings above.</Text>
              </View>
            )}
          </View>
        )}

        {/* TAB 3: DIAGNOSTICS & ROAD TEST */}
        {activeTab === 'DIAGNOSTICS' && (
          <View style={styles.section}>
            <View style={styles.summaryCard}>
              <View style={styles.summaryCardHeader}>
                <ShieldCheck size={20} color={colors.brandAccent} />
              <Text style={styles.cardTitle}>Inspection summary</Text>
              </View>
              <Text style={styles.summaryText}>{audit.engineerSummary}</Text>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryCardHeader}>
                <Gauge size={20} color={colors.brandAccent} />
              <Text style={styles.cardTitle}>Vehicle condition summary</Text>
              </View>
              <Text style={styles.summaryText}>{audit.conditionSummary}</Text>
            </View>

            {effectiveProfile?.qualityControl && (effectiveProfile.qualityControl.status?.toUpperCase() === 'PASSED' || effectiveProfile.qualityControl.findings) && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryCardHeader}>
                  <ShieldCheck size={20} color="#10B981" />
                  <Text style={styles.cardTitle}>Independent QC Certification</Text>
                </View>
                <Text style={styles.summaryText}>
                  {effectiveProfile.qualityControl.findings || 'Vehicle has completed independent road test and multi-system quality control verification.'}
                </Text>
              </View>
            )}

            {effectiveProfile?.refurbishment && effectiveProfile.refurbishment.length > 0 && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryCardHeader}>
                  <Wrench size={20} color={colors.brandAccent} />
                  <Text style={styles.cardTitle}>Refurbishment & Workshop Completed</Text>
                </View>
                <View style={{ gap: 8, marginTop: 4 }}>
                  {effectiveProfile.refurbishment.map((rf: any, idx: number) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <CheckCircle2 size={14} color="#22C55E" style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700' }}>{rf.category}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{rf.action}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {verifiedTags && verifiedTags.length > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.cardTitle}>Certified Verification Badges</Text>
                <View style={styles.tagChips}>
                  {verifiedTags.map((tag) => (
                    <View key={tag} style={styles.tagChip}>
                      <CheckCircle2 size={14} color={colors.brandAccent} />
                      <Text style={styles.tagText}>{tag.replace(/_/g, ' ')}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {features && features.length > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.cardTitle}>Tested & Verified Fitted Features</Text>
                <View style={styles.tagChips}>
                  {features.map((feat, i) => (
                    <View key={i} style={styles.featureChip}>
                      <Text style={styles.featureText}>{feat}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {reportUrl && (
              <TouchableOpacity
                style={styles.downloadBtn}
                onPress={() => Linking.openURL(reportUrl)}
              >
                <Download size={18} color="#061A38" />
                <Text style={styles.downloadBtnText}>Download Official PDF Inspection Report</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* FULL SCREEN PHOTO MODAL */}
      <Modal
        visible={Boolean(selectedPhoto)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={styles.photoModalScrim}>
          <SafeAreaView style={styles.photoModalContent}>
            <View style={styles.photoModalHeader}>
              <View>
                <Text style={styles.photoModalTitle}>{selectedPhoto?.title}</Text>
                <Text style={styles.photoModalSub}>📍 {selectedPhoto?.location}</Text>
              </View>
              <TouchableOpacity
                style={styles.photoModalCloseBtn}
                onPress={() => setSelectedPhoto(null)}
              >
                <X size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {selectedPhoto && (
              <Image
                source={{ uri: selectedPhoto.photoUrl }}
                style={styles.photoModalImage}
                resizeMode="contain"
              />
            )}

            <View
              style={[
                styles.photoModalFooter,
                {
                  paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + space.sm,
                },
              ]}
            >
              <Text style={styles.photoModalDesc}>{selectedPhoto?.description}</Text>
              <Text style={styles.photoModalAction}>Action: {selectedPhoto?.actionTaken}</Text>
              <TouchableOpacity
                style={styles.photoModalDismissBtn}
                activeOpacity={0.8}
                onPress={() => setSelectedPhoto(null)}
              >
                <Text style={styles.photoModalDismissBtnText}>Close Preview</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    backBtn: {
      padding: space.xs,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: '700',
    },
    content: {
      padding: space.md,
      gap: space.md,
      paddingBottom: space.xxl,
    },
    scoreBanner: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: space.xs,
    },
    scoreHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space.xs,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    badgeLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.brandAccent,
      letterSpacing: 0.5,
    },
    scorePill: {
      backgroundColor: colors.brandAccent,
      paddingHorizontal: space.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
    },
    scorePillText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#061A38',
    },
    scoreSummaryTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    scoreSummarySub: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
    },
    metricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      marginTop: space.sm,
      paddingTop: space.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    metricCol: {
      alignItems: 'center',
    },
    metricNum: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    metricLabel: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    metricDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.border,
    },
    tabsContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#061A38' : '#EEF2F6',
      borderRadius: radius.md,
      padding: 3,
      gap: 4,
    },
    tabButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 10,
      borderRadius: radius.sm,
    },
    tabButtonActive: {
      backgroundColor: colors.brandAccent,
    },
    tabButtonText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
    tabButtonTextActive: {
      color: '#061A38',
      fontWeight: '700',
    },
    section: {
      gap: space.md,
    },
    tabSectionKicker: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    filterPillsScroll: {
      gap: space.xs,
      paddingBottom: 2,
    },
    filterPill: {
      paddingHorizontal: space.sm,
      paddingVertical: 6,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    filterPillActive: {
      backgroundColor: colors.brandAccent,
      borderColor: colors.brandAccent,
    },
    filterPillText: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '600',
    },
    filterPillTextActive: {
      color: '#061A38',
      fontWeight: '700',
    },
    defectCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    defectImageWrapper: {
      position: 'relative',
      height: 190,
      backgroundColor: '#04132B',
    },
    defectImage: {
      width: '100%',
      height: '100%',
    },
    defectImageOverlay: {
      position: 'absolute',
      right: 10,
      bottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(6, 26, 56, 0.85)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.pill,
    },
    defectImageOverlayText: {
      fontSize: 11,
      color: '#FFFFFF',
      fontWeight: '600',
    },
    defectSeverityPill: {
      position: 'absolute',
      left: 10,
      top: 10,
      backgroundColor: 'rgba(247, 181, 3, 0.95)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.sm,
    },
    defectSeverityText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#061A38',
    },
    defectInfo: {
      padding: space.md,
      gap: space.xs,
    },
    defectTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    defectTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    repairedPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.pill,
    },
    repairedDone: {
      backgroundColor: 'rgba(97, 217, 154, 0.15)',
    },
    repairedAsIs: {
      backgroundColor: 'rgba(247, 181, 3, 0.15)',
    },
    repairedText: {
      fontSize: 11,
      fontWeight: '700',
    },
    defectMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    defectPartLocation: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.brandAccent,
    },
    defectCategoryTag: {
      fontSize: 12,
      color: colors.textMuted,
    },
    defectDesc: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
      marginTop: 2,
    },
    actionTakenBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      backgroundColor: isDark ? '#04132B' : '#F8FAFC',
      padding: space.sm,
      borderRadius: radius.sm,
      marginTop: space.xs,
    },
    actionTakenText: {
      flex: 1,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
    },
    systemCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    systemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    systemName: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    systemPoints: {
      fontSize: 12,
      color: colors.textMuted,
    },
    systemBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(97, 217, 154, 0.15)',
      paddingHorizontal: space.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
    },
    systemBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#61D99A',
    },
    systemHighlights: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: space.xs,
    },
    summaryCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '700',
    },
    summaryText: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    tagChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.xs,
      marginTop: space.xs,
    },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? '#061A38' : '#EEF2F6',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tagText: {
      color: colors.textPrimary,
      fontSize: 11,
      fontWeight: '600',
    },
    featureChip: {
      backgroundColor: isDark ? '#092144' : '#E2E8F0',
      paddingHorizontal: space.sm,
      paddingVertical: 4,
      borderRadius: radius.sm,
    },
    featureText: {
      color: colors.textPrimary,
      fontSize: 12,
    },
    downloadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      backgroundColor: colors.brandAccent,
      paddingVertical: 12,
      borderRadius: radius.md,
    },
    downloadBtnText: {
      color: '#061A38',
      fontWeight: '700',
      fontSize: 13,
    },
    emptyCard: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.xl,
      gap: space.xs,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    emptySub: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
    },
    photoModalScrim: {
      flex: 1,
      backgroundColor: 'rgba(0, 6, 15, 0.95)',
      justifyContent: 'center',
    },
    photoModalContent: {
      flex: 1,
      justifyContent: 'space-between',
    },
    photoModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    photoModalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    photoModalSub: {
      fontSize: 13,
      color: colors.brandAccent,
      marginTop: 2,
    },
    photoModalCloseBtn: {
      padding: space.xs,
    },
    photoModalImage: {
      flex: 1,
      width: '100%',
    },
    photoModalFooter: {
      padding: space.md,
      backgroundColor: 'rgba(6, 26, 56, 0.8)',
      gap: 4,
    },
    photoModalDesc: {
      fontSize: 13,
      color: '#FFFFFF',
      lineHeight: 18,
    },
    photoModalAction: {
      fontSize: 12,
      color: colors.brandAccent,
    },
    photoModalDismissBtn: {
      backgroundColor: colors.brandAccent,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: space.sm,
      minHeight: 46,
    },
    photoModalDismissBtnText: {
      color: '#061A38',
      fontWeight: '800',
      fontSize: 14,
    },
  });
