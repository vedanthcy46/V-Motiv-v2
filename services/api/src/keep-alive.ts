// Keeps a free Render web service from going to sleep.
// Render stops a free service after ~15 minutes without incoming traffic. This calls the service's own public health route
// every 5 minutes, which counts as traffic. It only helps while the service is awake (a sleeping service cannot wake itself),
// so for extra safety also point an external uptime monitor (e.g. UptimeRobot, 5-minute interval) at the same health URL.

export const KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000;
export const KEEP_ALIVE_PATH = '/health/live';

/**
 * The public address to ping, or null when keep-alive should not run.
 * Render provides RENDER_EXTERNAL_URL automatically; KEEP_ALIVE_URL overrides it; KEEP_ALIVE=false turns it off.
 * It never runs against a local address: only a public https URL keeps a Render service awake.
 */
export function keepAliveTarget(env: NodeJS.ProcessEnv = process.env): string | null {
  if ((env.KEEP_ALIVE ?? '').trim().toLowerCase() === 'false') return null;
  const raw = (env.KEEP_ALIVE_URL || env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number }>;

export interface KeepAliveOptions {
  baseUrl: string;
  intervalMs?: number;
  path?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  log?: Pick<Console, 'info' | 'warn'>;
}

/** One health call. Never throws: a failed ping is reported and the next one simply tries again. */
export async function pingHealth(options: KeepAliveOptions): Promise<boolean> {
  const { baseUrl, path = KEEP_ALIVE_PATH, timeoutMs = 10_000, fetchImpl = (url, init) => fetch(url, init), log = console } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}${path}`, { signal: controller.signal, headers: { 'user-agent': 'vmotiv-keep-alive' } });
    if (!response.ok) log.warn(`[KEEP-ALIVE] health check answered ${response.status}`);
    return response.ok;
  } catch (error: any) {
    log.warn(`[KEEP-ALIVE] health check failed: ${error?.name === 'AbortError' ? 'timed out' : error?.message || error}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Starts the 5-minute loop and returns a function that stops it. */
export function startKeepAlive(options: KeepAliveOptions): () => void {
  const intervalMs = options.intervalMs ?? KEEP_ALIVE_INTERVAL_MS;
  const log = options.log ?? console;
  const timer = setInterval(() => { void pingHealth(options); }, intervalMs);
  timer.unref(); // never keeps the process alive on its own
  log.info(`[KEEP-ALIVE] pinging ${options.baseUrl}${options.path ?? KEEP_ALIVE_PATH} every ${Math.round(intervalMs / 60_000)} min so the service does not sleep`);
  return () => clearInterval(timer);
}
