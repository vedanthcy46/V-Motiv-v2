// Pure date helpers for the calendar date field. Dates are plain "YYYY-MM-DD" strings (no time zone), the same text the API expects.

export type IsoDate = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toIso(year: number, month: number, day: number): IsoDate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Parses "YYYY-MM-DD"; null for anything that is not a real calendar date (so 2026-02-31 is rejected). */
export function parseIso(value: string | null | undefined): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** ISO dates compare correctly as text. */
export const isBefore = (a: IsoDate, b: IsoDate) => a < b;

export function addYears(iso: IsoDate, years: number): IsoDate {
  const p = parseIso(iso)!;
  const year = p.year + years;
  return toIso(year, p.month, Math.min(p.day, daysInMonth(year, p.month)));
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "15 May 1998" for display; empty text for a missing or invalid value. */
export function formatDisplay(iso: string | null | undefined): string {
  const p = parseIso(iso);
  return p ? `${p.day} ${MONTH_NAMES[p.month - 1]!.slice(0, 3)} ${p.year}` : '';
}

/** The month as rows of 7 cells (Monday first); null cells pad the first and last week. */
export function monthGrid(year: number, month: number): Array<Array<number | null>> {
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const cells: Array<number | null> = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** Whether a day may be chosen given optional earliest / latest dates (inclusive). */
export function isAllowed(iso: IsoDate, min?: IsoDate, max?: IsoDate): boolean {
  return (!min || iso >= min) && (!max || iso <= max);
}

/** Moves a (year, month) by whole months, rolling the year. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
