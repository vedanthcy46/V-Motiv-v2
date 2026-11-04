/** Distinct, upper-cased values present in the data (so a filter never offers an option nothing matches). */
export function distinctUpper(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(v => (v ?? '').trim().toUpperCase()).filter(Boolean))].sort();
}

/** Next filter value: ALL -> first option -> ... -> last option -> ALL. An unknown current value resets to ALL. */
export function nextFilterValue(current: string, options: string[]): string {
  if (current === 'ALL') return options[0] ?? 'ALL';
  const index = options.indexOf(current);
  if (index === -1) return 'ALL';
  return options[index + 1] ?? 'ALL';
}
