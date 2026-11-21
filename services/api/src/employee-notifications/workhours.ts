// Working-time arithmetic for escalation: a clock that only runs during the branch's working hours, in the branch's timezone,
// skipping non-working days and configured holidays.
export interface WorkingCalendar { timezone: string; start: string; end: string; workingDays: number[]; holidays: string[] }

function parts(date: Date, timeZone: string) {
  const format = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
  const get = Object.fromEntries(format.formatToParts(date).map(part => [part.type, part.value]));
  return { y: Number(get.year), m: Number(get.month), d: Number(get.day), hh: Number(get.hour) % 24, mm: Number(get.minute), weekday: String(get.weekday) };
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** The UTC instant at which the local clock in `timeZone` reads `hhmm` on `date` (yyyy-mm-dd). */
export function zonedInstant(date: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  const local = parts(new Date(guess), timeZone);
  const asIfUtc = Date.UTC(local.y, local.m - 1, local.d, local.hh, local.mm);
  return new Date(guess - (asIfUtc - guess)); // guess shifted by the zone offset at that moment
}

export const localDate = (date: Date, timeZone: string) => {
  const p = parts(date, timeZone);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};

/** Working minutes between two instants (a clock that stops outside hours, on rest days and on holidays). */
export function workingMinutesBetween(from: Date, to: Date, calendar: WorkingCalendar): number {
  if (to <= from) return 0;
  let total = 0;
  let day = localDate(from, calendar.timezone);
  const last = localDate(to, calendar.timezone);
  for (let guard = 0; guard < 400; guard++) {
    const weekday = WEEKDAY[parts(zonedInstant(day, '12:00', calendar.timezone), calendar.timezone).weekday] ?? 0;
    if (calendar.workingDays.includes(weekday) && !calendar.holidays.includes(day)) {
      const open = zonedInstant(day, calendar.start, calendar.timezone);
      const close = zonedInstant(day, calendar.end, calendar.timezone);
      const startMs = Math.max(open.getTime(), from.getTime());
      const endMs = Math.min(close.getTime(), to.getTime());
      if (endMs > startMs) total += (endMs - startMs) / 60_000;
    }
    if (day === last) break;
    const next = new Date(zonedInstant(day, '12:00', calendar.timezone).getTime() + 24 * 3_600_000);
    day = localDate(next, calendar.timezone);
  }
  return Math.floor(total);
}
