import { z } from 'zod';

export function readConfig(env: NodeJS.ProcessEnv) {
  const config = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    DATABASE_URL: z.url(),
    WEB_ORIGIN: z.url(),
    FIREBASE_PROJECT_ID: z.string().trim().min(1),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    EMAIL_DELIVERY_ENABLED: z.enum(['true', 'false']).default('false'),
  }).parse(env);
  const database = new URL(config.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error('PostgreSQL is required.');
  if (config.NODE_ENV !== 'production' &&
    (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) || !/^\/vmotiv_v2_(dev|test)$/.test(database.pathname))) {
    throw new Error('Development requires a local, isolated vmotiv_v2_dev or vmotiv_v2_test database.');
  }
  const origin = new URL(config.WEB_ORIGIN);
  if (origin.origin !== config.WEB_ORIGIN) throw new Error('WEB_ORIGIN must be an exact origin.');
  if (config.NODE_ENV === 'production' && (origin.protocol !== 'https:' || env.FIREBASE_AUTH_EMULATOR_HOST)) {
    throw new Error('Production requires HTTPS and forbids the Firebase auth emulator.');
  }
  if (config.EMAIL_DELIVERY_ENABLED === 'true' &&
      (!config.RESEND_API_KEY || !config.EMAIL_FROM || !config.EMAIL_FROM.includes('@'))) {
    throw new Error('Email delivery requires RESEND_API_KEY and a verified EMAIL_FROM sender.');
  }
  return config;
}
export type Config = ReturnType<typeof readConfig>;

