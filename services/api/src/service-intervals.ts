// When a car's next periodic service is due. This used to be a fixed "+10,000 km / +180 days" written on every vehicle at
// creation (before any service had happened) and after every job, even an AC repair. Now it is only set after a periodic
// service, from configurable intervals.
export const DEFAULT_SERVICE_INTERVAL_KM = 10_000;
export const DEFAULT_SERVICE_INTERVAL_DAYS = 180;
const DEFAULT_PERIODIC_CATEGORIES = ['periodic-maintenance'];

type Env = Record<string, string | undefined>;

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function isPeriodicServiceCategory(categoryKey: string | null | undefined, env: Env = process.env): boolean {
  const configured = env.SERVICE_PERIODIC_CATEGORIES?.split(',').map(item => item.trim()).filter(Boolean);
  return (configured?.length ? configured : DEFAULT_PERIODIC_CATEGORIES).includes(categoryKey ?? '');
}

/** Next-due odometer and date after a completed job, or null when this kind of job does not reset the service schedule. */
export function nextServiceDue(categoryKey: string | null | undefined, odometerKm: number, now: Date = new Date(), env: Env = process.env) {
  if (!isPeriodicServiceCategory(categoryKey, env)) return null;
  const km = positiveInt(env.SERVICE_INTERVAL_KM, DEFAULT_SERVICE_INTERVAL_KM);
  const days = positiveInt(env.SERVICE_INTERVAL_DAYS, DEFAULT_SERVICE_INTERVAL_DAYS);
  return { nextServiceDueKm: odometerKm + km, nextServiceDueDate: new Date(now.getTime() + days * 24 * 60 * 60 * 1000) };
}
