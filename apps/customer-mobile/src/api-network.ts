type ApiEndpointOptions = {
  configured?: string;
  development: boolean;
  devServerUrl?: string;
};

function parseUrl(value: string): URL | undefined {
  try { return new URL(value.includes('://') ? value : `http://${value}`); } catch { return undefined; }
}

function isLocalHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || host.endsWith('.local') ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

/** A development API follows the actual Metro transport, including USB localhost. */
export function resolveApiBaseUrl({ configured, development, devServerUrl }: ApiEndpointOptions) {
  const value = configured?.trim();
  const endpoint = value ? parseUrl(value) : undefined;
  if (value && (!endpoint || !/^https?:$/.test(endpoint.protocol) || endpoint.username || endpoint.password)) {
    throw new Error('API_CONFIGURATION_REQUIRED');
  }
  if (!development) {
    if (!endpoint) throw new Error('API_CONFIGURATION_REQUIRED');
    return endpoint.toString().replace(/\/$/, '');
  }

  // Private development hosts follow Metro across DHCP changes and USB use.
  // An explicitly configured public backend retains its own host.
  if (endpoint && !isLocalHost(endpoint.hostname)) return endpoint.toString().replace(/\/$/, '');
  const metro = devServerUrl ? parseUrl(devServerUrl) : undefined;
  const local = endpoint ?? new URL('http://localhost:4100/api/v2');
  if (metro && isLocalHost(metro.hostname)) local.hostname = metro.hostname;
  return local.toString().replace(/\/$/, '');
}

export async function withDeadline<T>(operation: Promise<T>, timeoutMs: number, timeoutCode: string, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new Error(timeoutCode)); onTimeout?.(); }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
