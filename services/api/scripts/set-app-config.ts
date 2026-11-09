// Publishes (or changes) the app version information the mobile apps check.
//   npm run app-config:set -- --platform android --latest 1.0.1 --url "https://play.google.com/store/apps/details?id=in.vmotiv.customer" --notes "Faster payments, bug fixes"
//   npm run app-config:set -- --platform ios --latest 1.0.1 --min 1.0.0 --url "https://apps.apple.com/app/id123456789"
// --platform android|ios|both (default both)   --app customer (default)   --latest <version> (required)
// --min <version>  apps older than this must update (the card cannot be dismissed)   --url <store link>   --notes <text>
import { PrismaClient } from '@prisma/client';
import { isValidVersion, type AppPlatform } from '../src/app-config.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const app = (arg('app') ?? 'customer').trim();
const platformArg = (arg('platform') ?? 'both').trim().toLowerCase();
const latest = arg('latest')?.trim();
const min = arg('min')?.trim();
if (!latest || !isValidVersion(latest)) throw new Error('--latest <version> is required, for example --latest 1.0.1');
if (min && !isValidVersion(min)) throw new Error('--min must look like 1.0.0');
const platforms: AppPlatform[] = platformArg === 'both' ? ['ANDROID', 'IOS'] : platformArg === 'android' ? ['ANDROID'] : platformArg === 'ios' ? ['IOS'] : (() => { throw new Error('--platform must be android, ios or both'); })();

const db = new PrismaClient();
try {
  for (const platform of platforms) {
    const data = {
      latestVersion: latest,
      ...(min !== undefined ? { minSupportedVersion: min || null } : {}),
      ...(arg('url') !== undefined ? { updateUrl: arg('url') || null } : {}),
      ...(arg('notes') !== undefined ? { releaseNotes: arg('notes') || null } : {}),
    };
    const row = await db.appConfig.upsert({ where: { app_platform: { app, platform } }, update: data, create: { app, platform, ...data } });
    console.log(`${app} / ${platform}: latest ${row.latestVersion}${row.minSupportedVersion ? `, required from ${row.minSupportedVersion}` : ''}${row.updateUrl ? `, ${row.updateUrl}` : ''}`);
  }
} finally {
  await db.$disconnect();
}
