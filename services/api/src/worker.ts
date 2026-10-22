import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readConfig } from './config.js';
import { processEmail, resendSender } from './email.js';
const config = readConfig(process.env);
const send = resendSender(config);
const db = new PrismaClient();
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });
try {
  while (!stopped) {
    await processEmail(db, send, config.EMAIL_FROM!);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
} finally { await db.$disconnect(); }

