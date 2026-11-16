import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, CloudOff, Info } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme';
import { PROGRESS_STAGES, statusTone, type Tone } from '../../services/scrap-form';

/** Every control here is at least 48 points tall, the usual minimum for a comfortable touch target. */
const MIN_TOUCH = 48;

export function useToneColors() {
  const { theme } = useAppTheme();
  const c = theme.colors;
  return (tone: Tone) => ({
    neutral: { fg: c.textSecondary, bg: c.surfaceSecondary },
    info: { fg: c.info, bg: c.infoBackground },
    warning: { fg: c.warning, bg: c.warningBackground },
    success: { fg: c.success, bg: c.successBackground },
    danger: { fg: c.error, bg: c.errorBackground },
  }[tone]);
}

export function ScreenHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack: () => void; right?: React.ReactNode }) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.background, borderBottomColor: c.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} hitSlop={8} style={styles.back}>
        <ArrowLeft size={22} color={c.textPrimary} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.headerTitle, { color: c.textPrimary }]}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={[styles.headerSub, { color: c.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** The status as a label with an icon and colour. The words always say it, so colour is never the only signal. */
export function StatusPill({ status, label }: { status: string; label: string }) {
  const tone = statusTone(status);
  const color = useToneColors()(tone);
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? AlertCircle : Info;
  return (
    <View accessibilityLabel={`Status: ${label}`} style={[styles.pill, { backgroundColor: color.bg }]}>
      <Icon size={13} color={color.fg} accessibilityElementsHidden />
      <Text style={[styles.pillText, { color: color.fg }]}>{label}</Text>
    </View>
  );
}

export function Card({ title, children, style }: { title?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>
      {title ? <Text accessibilityRole="header" style={[styles.cardTitle, { color: c.textPrimary }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Notice({ tone = 'info', children, action }: { tone?: Tone; children: React.ReactNode; action?: { label: string; onPress: () => void } }) {
  const color = useToneColors()(tone);
  const Icon = tone === 'danger' ? AlertCircle : tone === 'warning' ? AlertCircle : Info;
  return (
    <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} style={[styles.notice, { backgroundColor: color.bg }]}>
      <Icon size={18} color={color.fg} accessibilityElementsHidden />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={[styles.noticeText, { color: color.fg }]}>{children}</Text>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}>
            <Text style={[styles.noticeAction, { color: color.fg }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function FieldLabel({ label, help, error, required }: { label: string; help?: string; error?: string; required?: boolean }) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  return (
    <View style={{ gap: 3 }}>
      <Text style={[styles.fieldLabel, { color: c.textPrimary }]}>{label}{required ? <Text style={{ color: c.brandAccent }}> *</Text> : null}</Text>
      {help ? <Text style={[styles.fieldHelp, { color: c.textMuted }]}>{help}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.fieldError, { color: c.error }]}>{error}</Text> : null}
    </View>
  );
}

export function YesNo({ label, help, value, onChange, error, required = true, yesLabel = 'Yes', noLabel = 'No' }: {
  label: string; help?: string; value: boolean | undefined | null; onChange: (value: boolean) => void; error?: string; required?: boolean; yesLabel?: string; noLabel?: string;
}) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel label={label} help={help} error={error} required={required} />
      <View style={{ flexDirection: 'row', gap: 10 }} accessibilityRole="radiogroup">
        {([[true, yesLabel], [false, noLabel]] as const).map(([option, text]) => {
          const selected = value === option;
          return (
            <Pressable
              key={String(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${label}: ${text}`}
              onPress={() => onChange(option)}
              style={[styles.choice, { flex: 1, backgroundColor: selected ? c.selected : c.surface, borderColor: selected ? c.brandAccent : error ? c.error : c.border }]}
            >
              {selected ? <Check size={16} color={c.textPrimary} accessibilityElementsHidden /> : null}
              <Text style={[styles.choiceText, { color: c.textPrimary, fontWeight: selected ? '800' : '600' }]}>{text}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** One option per row, for choices with longer wording. */
export function ChoiceList({ label, help, options, value, onChange, error, required = true }: {
  label: string; help?: string; options: Array<{ value: string; label: string }>; value: string | undefined | null; onChange: (value: string) => void; error?: string; required?: boolean;
}) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel label={label} help={help} error={error} required={required} />
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        {options.map(option => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              style={[styles.choiceRow, { backgroundColor: selected ? c.selected : c.surface, borderColor: selected ? c.brandAccent : error ? c.error : c.border }]}
            >
              <View style={[styles.radio, { borderColor: selected ? c.brandAccent : c.textMuted }]}>{selected ? <View style={[styles.radioDot, { backgroundColor: c.brandAccent }]} /> : null}</View>
              <Text style={[styles.choiceText, { color: c.textPrimary, flex: 1, textAlign: 'left', fontWeight: selected ? '800' : '600' }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Short options side by side (fuel, vehicle category). */
export function Chips({ label, options, value, onChange, error, required = true }: {
  label: string; options: Array<{ value: string; label: string }>; value: string | undefined | null; onChange: (value: string) => void; error?: string; required?: boolean;
}) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel label={label} error={error} required={required} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
        {options.map(option => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              style={[styles.chip, { backgroundColor: selected ? c.selected : c.surface, borderColor: selected ? c.brandAccent : error ? c.error : c.border }]}
            >
              <Text style={[styles.chipText, { color: c.textPrimary, fontWeight: selected ? '800' : '600' }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Checkbox({ checked, onChange, children, error }: { checked: boolean; onChange: (value: boolean) => void; children: React.ReactNode; error?: string }) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        style={[styles.choiceRow, { backgroundColor: checked ? c.selected : c.surface, borderColor: checked ? c.brandAccent : error ? c.error : c.border, alignItems: 'flex-start' }]}
      >
        <View style={[styles.box, { borderColor: checked ? c.brandAccent : c.textMuted, backgroundColor: checked ? c.brandAccent : 'transparent' }]}>
          {checked ? <Check size={14} color={c.brandNavy} accessibilityElementsHidden /> : null}
        </View>
        <Text style={[styles.checkText, { color: c.textPrimary }]}>{children}</Text>
      </Pressable>
      {error ? <Text accessibilityRole="alert" style={[styles.fieldError, { color: c.error }]}>{error}</Text> : null}
    </View>
  );
}

export function ProgressTrack({ stage }: { stage: number | null }) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  if (stage === null) return null;
  return (
    <View accessible accessibilityLabel={`Progress: step ${stage + 1} of ${PROGRESS_STAGES.length}, ${PROGRESS_STAGES[stage]}`} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {PROGRESS_STAGES.map((name, index) => (
          <View key={name} style={[styles.segment, { backgroundColor: index <= stage ? c.brandAccent : c.border }]} />
        ))}
      </View>
      <Text style={[styles.fieldHelp, { color: c.textSecondary }]}>
        <Text style={{ fontWeight: '800', color: c.textPrimary }}>{PROGRESS_STAGES[stage]}</Text>  ·  step {stage + 1} of {PROGRESS_STAGES.length}
      </Text>
    </View>
  );
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

export function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  if (state === 'idle') return null;
  if (state === 'saving') return <View style={styles.save}><ActivityIndicator size="small" color={c.textMuted} /><Text style={[styles.saveText, { color: c.textMuted }]}>Saving…</Text></View>;
  if (state === 'saved') return <View style={styles.save}><Check size={14} color={c.success} /><Text style={[styles.saveText, { color: c.textMuted }]}>Saved</Text></View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Not saved on the server. Tap to retry." onPress={onRetry} hitSlop={8} style={styles.save}>
      <CloudOff size={14} color={c.warning} />
      <Text style={[styles.saveText, { color: c.warning, fontWeight: '800' }]}>{state === 'offline' ? 'Kept on this phone · Retry' : 'Not saved · Retry'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 12.5, marginTop: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: '800' },
  card: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14 },
  noticeText: { fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
  noticeAction: { fontSize: 13.5, fontWeight: '800', textDecorationLine: 'underline' },
  fieldLabel: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  fieldHelp: { fontSize: 12.5, lineHeight: 18 },
  fieldError: { fontSize: 12.5, fontWeight: '700' },
  choice: { minHeight: MIN_TOUCH, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 12 },
  choiceRow: { minHeight: MIN_TOUCH, borderRadius: 14, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  choiceText: { fontSize: 15, textAlign: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkText: { flex: 1, fontSize: 14.5, lineHeight: 21 },
  chip: { minHeight: 44, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 14 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  save: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  saveText: { fontSize: 12.5, fontWeight: '600' },
});
