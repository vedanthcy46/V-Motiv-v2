import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, ChevronDown, ChevronUp, Headphones } from 'lucide-react-native';
import { faqSections } from '../constants/faq';
import { useStackScreenBottomPadding } from '../layout/safe-layout';
import type { RootStack } from '../navigation/types';
import { radius, space, useAppTheme, type ThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStack, 'Faq'>;

/** Help & FAQs: short answers to common questions, one tap to open each, and a way through to the support desk. */
export function FaqScreen({ navigation }: Props) {
  const bottomPadding = useStackScreenBottomPadding();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sections = useMemo(() => faqSections(), []);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={styles.headerTitle}>Help & FAQs</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}>
        {sections.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
            <View style={styles.group}>
              {section.items.map((item, index) => {
                const open = openId === item.id;
                const Chevron = open ? ChevronUp : ChevronDown;
                return (
                  <View key={item.id} style={[styles.row, index < section.items.length - 1 && styles.rowDivider]}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityLabel={item.question}
                      onPress={() => setOpenId(open ? null : item.id)}
                      style={styles.question}
                    >
                      <Text style={styles.questionText}>{item.question}</Text>
                      <Chevron size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                    {open ? <Text style={styles.answer}>{item.answer}</Text> : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <TouchableOpacity
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Contact the support desk"
          onPress={() => navigation.navigate('Support')}
          style={styles.contact}
        >
          <Headphones size={20} color={colors.brandAccent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.contactTitle}>Did not find your answer?</Text>
            <Text style={styles.contactBody}>Talk to our team through the support desk.</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
    backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
    headerTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
    content: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.xl },
    section: { gap: space.sm },
    sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.textMuted, paddingHorizontal: space.xs },
    group: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    row: { paddingHorizontal: space.lg },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
    question: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
    questionText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary, lineHeight: 21 },
    answer: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, paddingBottom: space.lg },
    contact: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    contactTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
    contactBody: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  });
