import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { databaseConnection } from './database-connection.mjs';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

const databaseUrl = databaseConnection(process.env.DATABASE_URL, {
  migration: true,
  directUrl: process.env.DIRECT_DATABASE_URL,
});
const require = createRequire(import.meta.url);
const migrationFile = fileURLToPath(
  new URL('./prisma/migrations/20261029030000_service_and_notification_persistence/migration.sql', import.meta.url)
);

console.info('Applying the idempotent service and notification schema repair using a direct database connection (credentials hidden).');
const child = spawn(
  process.execPath,
  [require.resolve('prisma/build/index.js'), 'db', 'execute', '--file', migrationFile],
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl } }
);
child.on('error', () => { console.error('Could not start the database repair command.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
