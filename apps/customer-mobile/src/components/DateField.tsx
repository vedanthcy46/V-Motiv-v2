import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../theme';
import { MONTH_NAMES, WEEKDAYS, formatDisplay, isAllowed, monthGrid, parseIso, shiftMonth, toIso, todayIso, type IsoDate } from '../utils/date-field';

/**
 * A date the customer picks from a calendar instead of typing. The value is "YYYY-MM-DD" ('' when nothing is chosen).
 * Tap the year to jump straight to it (useful for a date of birth); `minDate` / `maxDate` grey out days that are not allowed.
 * Written in plain React Native so it needs no extra native module.
 */
export function DateField({ value, onChange, placeholder = 'Select date', minDate, maxDate, initialYear, title, accessibilityLabel }: {
  value: string;
  onChange: (iso: IsoDate) => void;
  placeholder?: string;
  minDate?: IsoDate;
  maxDate?: IsoDate;
  /** Year shown first when nothing is chosen yet (e.g. 30 years ago for a date of birth). */
  initialYear?: number;
  title?: string;
  accessibilityLabel?: string;
}) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const [open, setOpen] = useState(false);
  const [yearPicker, setYearPicker] = useState(false);
  const selected = parseIso(value);
  const today = todayIso();

  const startView = useMemo(() => {
    if (selected) return { year: selected.year, month: selected.month };
    const t = parseIso(today)!;
    const year = initialYear ?? t.year;
    // Open on a month where something can be chosen.
    const limit = maxDate ? parseIso(maxDate) : null;
    if (limit && year === limit.year && t.month > limit.month) return { year, month: limit.month };
    return { year, month: year === t.year ? t.month : 1 };
  }, [selected, initialYear, maxDate, today]);

  const [view, setView] = useState(startView);
  useEffect(() => { if (open) { setView(startView); setYearPicker(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const minYear = (minDate ? parseIso(minDate)?.year : undefined) ?? 1920;
  const maxYear = (maxDate ? parseIso(maxDate)?.year : undefined) ?? new Date().getFullYear() + 25;
  const years = useMemo(() => Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i), [minYear, maxYear]);
  const rows = useMemo(() => monthGrid(view.year, view.month), [view]);
  const monthIndex = view.year * 12 + view.month - 1;
  const canGoPrev = !minDate || monthIndex > (parseIso(minDate)!.year * 12 + parseIso(minDate)!.month - 1);
  const canGoNext = !maxDate || monthIndex < (parseIso(maxDate)!.year * 12 + parseIso(maxDate)!.month - 1);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title ?? 'Select date'}
        onPress={() => setOpen(true)}
        style={[styles.field, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}
      >
        <Text style={{ color: selected ? c.textPrimary : c.textMuted, fontSize: 15 }}>{selected ? formatDisplay(value) : placeholder}</Text>
        <Text style={{ color: c.textMuted, fontSize: 16 }}>📅</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => undefined}>
            {title ? <Text style={[styles.title, { color: c.textSecondary }]}>{title}</Text> : null}

            <View style={styles.header}>
              <Pressable accessibilityLabel="Previous month" disabled={!canGoPrev} onPress={() => setView(v => shiftMonth(v.year, v.month, -1))} style={[styles.nav, { opacity: canGoPrev ? 1 : 0.3 }]}>
                <Text style={[styles.navText, { color: c.textPrimary }]}>‹</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Choose year" onPress={() => setYearPicker(p => !p)} style={styles.monthTitle}>
                <Text style={[styles.monthText, { color: c.textPrimary }]}>{MONTH_NAMES[view.month - 1]} {view.year} ▾</Text>
              </Pressable>
              <Pressable accessibilityLabel="Next month" disabled={!canGoNext} onPress={() => setView(v => shiftMonth(v.year, v.month, 1))} style={[styles.nav, { opacity: canGoNext ? 1 : 0.3 }]}>
                <Text style={[styles.navText, { color: c.textPrimary }]}>›</Text>
              </Pressable>
            </View>

            {yearPicker ? (
              <FlatList
                data={years}
                keyExtractor={String}
                style={styles.yearList}
                initialScrollIndex={Math.max(0, years.indexOf(view.year))}
                getItemLayout={(_, index) => ({ length: 44, offset: 44 * index, index })}
                renderItem={({ item }) => (
                  <Pressable onPress={() => { setView(v => ({ ...v, year: item })); setYearPicker(false); }} style={[styles.yearRow, item === view.year && { backgroundColor: c.brandAccent }]}>
                    <Text style={{ color: item === view.year ? '#061A38' : c.textPrimary, fontWeight: item === view.year ? '800' : '500', fontSize: 16 }}>{item}</Text>
                  </Pressable>
                )}
              />
            ) : (
              <>
                <View style={styles.weekRow}>
                  {WEEKDAYS.map(day => <Text key={day} style={[styles.weekday, { color: c.textMuted }]}>{day}</Text>)}
                </View>
                {rows.map((row, r) => (
                  <View key={r} style={styles.weekRow}>
                    {row.map((day, i) => {
                      if (day === null) return <View key={i} style={styles.cell} />;
                      const iso = toIso(view.year, view.month, day);
                      const allowed = isAllowed(iso, minDate, maxDate);
                      const isSelected = iso === value;
                      return (
                        <Pressable
                          key={i}
                          disabled={!allowed}
                          accessibilityRole="button"
                          accessibilityLabel={formatDisplay(iso)}
                          accessibilityState={{ selected: isSelected, disabled: !allowed }}
                          onPress={() => { onChange(iso); setOpen(false); }}
                          style={[styles.cell, isSelected && { backgroundColor: c.brandAccent, borderRadius: 20 }, !isSelected && iso === today && { borderColor: c.brandAccent, borderWidth: 1, borderRadius: 20 }]}
                        >
                          <Text style={{ color: isSelected ? '#061A38' : allowed ? c.textPrimary : c.textMuted, opacity: allowed ? 1 : 0.35, fontWeight: isSelected ? '800' : '500' }}>{day}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </>
            )}

            <View style={styles.footer}>
              {value ? (
                <Pressable onPress={() => { onChange(''); setOpen(false); }}><Text style={[styles.footerText, { color: c.error }]}>Clear</Text></Pressable>
              ) : <View />}
              <Pressable onPress={() => setOpen(false)}><Text style={[styles.footerText, { color: c.textSecondary }]}>Close</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 11, 24, 0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 360, borderRadius: 16, borderWidth: 1, padding: 14 },
  title: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 28, lineHeight: 30 },
  monthTitle: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  monthText: { fontSize: 16, fontWeight: '800' },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', paddingVertical: 6 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', margin: 1 },
  yearList: { maxHeight: 264 },
  yearRow: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingHorizontal: 6 },
  footerText: { fontSize: 14, fontWeight: '700', padding: 6 },
});
