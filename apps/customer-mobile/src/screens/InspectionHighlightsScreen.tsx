import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, CheckCircle2, Download, FileText, ShieldCheck } from 'lucide-react-native';
import { color, radius, space } from '../theme';
import type { RootStack } from '../navigation/types';

type Props = NativeStackScreenProps<RootStack, 'InspectionHighlights'>;

export function InspectionHighlightsScreen({ route, navigation }: Props) {
  const { inspectionSummary, conditionSummary, verifiedTags, features, reportUrl } = route.params;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <ArrowLeft size={22} color={color.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inspection information</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badgeBanner}>
          <ShieldCheck size={36} color={color.yellow} />
          <View style={styles.badgeTextContainer}>
            <Text style={styles.badgeTitle}>Published vehicle information</Text>
            <Text style={styles.badgeSubtitle}>
              Only inspection information supplied by V MOTIV operations is shown here.
            </Text>
          </View>
        </View>

        {inspectionSummary ? (
          <View style={styles.summaryCard}>
            <Text style={styles.cardTitle}>Engineer's Assessment</Text>
            <Text style={styles.summaryText}>{inspectionSummary}</Text>
          </View>
        ) : null}

        {conditionSummary ? (
          <View style={styles.summaryCard}>
            <Text style={styles.cardTitle}>Vehicle Condition & Care</Text>
            <Text style={styles.summaryText}>{conditionSummary}</Text>
          </View>
        ) : null}

        {verifiedTags.length ? <View style={styles.tagsContainer}>
          <Text style={styles.cardTitle}>Published tags</Text>
          <View style={styles.tagChips}>{verifiedTags.map((tag) => <View key={tag} style={styles.tagChip}><CheckCircle2 size={14} color={color.yellow} /><Text style={styles.tagText}>{tag.replace(/_/g, ' ')}</Text></View>)}</View>
        </View> : null}

        {features && features.length > 0 ? (
          <View style={styles.summaryCard}>
            <Text style={styles.cardTitle}>Published fitted features</Text>
            <View style={styles.tagChips}>
              {features.map((feat, i) => (
                <View key={i} style={styles.featureChip}>
                  <Text style={styles.featureText}>{feat}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {!inspectionSummary && !conditionSummary && !verifiedTags.length && !features.length ? <View style={styles.summaryCard}><Text style={styles.cardTitle}>No inspection details published</Text><Text style={styles.summaryText}>This listing can still be reviewed, but inspection information has not been published by operations.</Text></View> : null}
        {reportUrl ? (
          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={() => Linking.openURL(reportUrl)}
          >
            <Download size={18} color={color.navy} />
            <Text style={styles.downloadBtnText}>Open published inspection report</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  backBtn: {
    padding: space.xs,
  },
  headerTitle: {
    color: color.white,
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    padding: space.md,
    paddingBottom: space.xxl,
  },
  badgeBanner: {
    flexDirection: 'row',
    backgroundColor: color.navy,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    marginBottom: space.md,
  },
  badgeTextContainer: {
    flex: 1,
    marginLeft: space.md,
  },
  badgeTitle: {
    color: color.yellow,
    fontSize: 16,
    fontWeight: '700',
  },
  badgeSubtitle: {
    color: color.muted,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18,
  },
  summaryCard: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.md,
  },
  cardTitle: {
    color: color.white,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: space.xs,
  },
  summaryText: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 20,
  },
  tagsContainer: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
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
    gap: 6,
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.3)',
  },
  tagText: {
    color: color.yellow,
    fontSize: 11,
    fontWeight: '700',
  },
  categoryCard: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.sm,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  categoryTitle: {
    color: color.white,
    fontSize: 14,
    fontWeight: '700',
  },
  categoryScore: {
    color: color.yellow,
    fontSize: 13,
    fontWeight: '700',
  },
  categoryItems: {
    gap: space.xs,
  },
  categoryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  categoryItemText: {
    color: '#E5E7EB',
    fontSize: 12,
    flex: 1,
  },
  featureChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  featureText: {
    color: color.white,
    fontSize: 12,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: color.yellow,
    paddingVertical: space.md,
    borderRadius: radius.md,
    marginTop: space.lg,
  },
  downloadBtnText: {
    color: color.navy,
    fontSize: 14,
    fontWeight: '700',
  },
});
