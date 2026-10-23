import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { databaseConnection } from './database-connection.mjs';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const databaseUrl = databaseConnection(process.env.DATABASE_URL, {
  migration: true, directUrl: process.env.DIRECT_DATABASE_URL,
});
console.info('Deploying migrations using a direct database connection (credentials hidden).');
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
  stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl },
});
child.on('error', () => { console.error('Could not start Prisma migration command.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
