import { z } from 'zod';

export function readConfig(env: NodeJS.ProcessEnv) {
  const config = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    DATABASE_URL: z.url(),
    WEB_ORIGIN: z.url(),
    ADMIN_WEB_ORIGIN: z.url().optional(),
    SALES_WEB_ORIGIN: z.url().optional(),
    INSPECTION_REVIEW_WEB_ORIGIN: z.url().optional(),
    OPERATIONS_WEB_ORIGIN: z.url().optional(),
    INSPECTOR_PORTAL_ORIGIN: z.url().optional(),
    FIREBASE_PROJECT_ID: z.string().trim().min(1),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    EMAIL_DELIVERY_ENABLED: z.enum(['true', 'false']).default('false'),
  }).parse(env);
  const database = new URL(config.DATABASE_URL);
  if (database.hostname.endsWith('.neon.tech')) {
    if (!database.searchParams.has('connect_timeout')) database.searchParams.set('connect_timeout', '30');
    if (!database.searchParams.has('pool_timeout')) database.searchParams.set('pool_timeout', '30');
    config.DATABASE_URL = database.toString();
  }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error('PostgreSQL is required.');
  if (config.NODE_ENV !== 'production' &&
    (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) || !/^\/vmotiv_v2_(dev|test)$/.test(database.pathname))) {
    throw new Error('Development requires a local, isolated vmotiv_v2_dev or vmotiv_v2_test database.');
  }
  const origin = new URL(config.WEB_ORIGIN);
  if (origin.origin !== config.WEB_ORIGIN) throw new Error('WEB_ORIGIN must be an exact origin.');
  const optionalOrigins = [
    ['ADMIN_WEB_ORIGIN', config.ADMIN_WEB_ORIGIN],
    ['SALES_WEB_ORIGIN', config.SALES_WEB_ORIGIN],
    ['INSPECTION_REVIEW_WEB_ORIGIN', config.INSPECTION_REVIEW_WEB_ORIGIN],
    ['OPERATIONS_WEB_ORIGIN', config.OPERATIONS_WEB_ORIGIN],
    ['INSPECTOR_PORTAL_ORIGIN', config.INSPECTOR_PORTAL_ORIGIN],
  ] as const;
  for (const [name, value] of optionalOrigins) {
    if (value && new URL(value).origin !== value) throw new Error(`${name} must be an exact origin.`);
  }
  const adminOrigin = config.ADMIN_WEB_ORIGIN ? new URL(config.ADMIN_WEB_ORIGIN) : undefined;
  const loopbackOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  const adminLoopbackOrigin = adminOrigin ? ['localhost', '127.0.0.1', '[::1]'].includes(adminOrigin.hostname) : false;
  if (config.NODE_ENV === 'production' &&
      ((origin.protocol !== 'https:' && !(origin.protocol === 'http:' && loopbackOrigin)) || env.FIREBASE_AUTH_EMULATOR_HOST)) {
    throw new Error('Production requires HTTPS for public web origins and forbids the Firebase auth emulator. HTTP is permitted only on loopback.');
  }
  if (config.NODE_ENV === 'production' && adminOrigin &&
      adminOrigin.protocol !== 'https:' && !(adminOrigin.protocol === 'http:' && adminLoopbackOrigin)) {
    throw new Error('Production requires HTTPS for the Admin web origin. HTTP is permitted only on loopback.');
  }
  if (config.NODE_ENV === 'production') {
    for (const [name, value] of optionalOrigins.slice(1)) {
      if (!value) continue;
      const portalOrigin = new URL(value);
      const portalLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(portalOrigin.hostname);
      if (portalOrigin.protocol !== 'https:' && !(portalOrigin.protocol === 'http:' && portalLoopback)) {
        throw new Error(`Production requires HTTPS for ${name}. HTTP is permitted only on loopback.`);
      }
    }
  }
  if (config.EMAIL_DELIVERY_ENABLED === 'true' &&
      (!config.RESEND_API_KEY || !config.EMAIL_FROM || !config.EMAIL_FROM.includes('@'))) {
    throw new Error('Email delivery requires RESEND_API_KEY and a verified EMAIL_FROM sender.');
  }
  return config;
}
export type Config = ReturnType<typeof readConfig>;

