// The daily email digest: for employees who asked for it, one email of what is still unread in their inbox. Informational items are
// summarised here instead of pushed. Sent once per person per day (the outbox key is unique per day).
import type { PrismaClient } from '@prisma/client';
import { localDate } from './workhours.js';

export async function sendDailyDigests(db: PrismaClient, now = new Date()): Promise<number> {
  const today = localDate(now, 'Asia/Kolkata');
  const prefs = await db.notificationPreference.findMany({ where: { digestFrequency: 'DAILY', emailEnabled: true }, select: { userId: true }, take: 500 });
  let sent = 0;
  for (const { userId } of prefs) {
    const employee = await db.employee.findFirst({ where: { userId, active: true, status: 'ACTIVE', user: { status: 'ACTIVE' } }, select: { user: { select: { email: true, displayName: true } } } });
    if (!employee?.user.email) continue;
    const unread = await db.notification.findMany({ where: { userId, module: { not: null }, read: false, resolvedAt: null, supersededAt: null, dismissedAt: null }, orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }], take: 30, select: { title: true, module: true, severity: true } });
    if (unread.length === 0) continue;
    const lines = unread.map(item => `• [${item.module}] ${item.title}${item.severity === 'CRITICAL' ? ' (critical)' : ''}`).join('\n');
    const result = await db.emailOutbox.upsert({
      where: { eventKey: `digest/${userId}/${today}` }, update: {},
      create: { userId, eventKey: `digest/${userId}/${today}`, recipient: employee.user.email, templateVersion: 'employee-digest-v1', subject: `You have ${unread.length} unread V MOTIV notification${unread.length === 1 ? '' : 's'}`, text: `Hello ${employee.user.displayName ?? ''},\n\nStill waiting in your inbox:\n\n${lines}\n\nOpen your portal to act on them. This digest has no customer or payment details.` },
      select: { createdAt: true },
    });
    if (Date.now() - result.createdAt.getTime() < 5_000) sent++;
  }
  return sent;
}
