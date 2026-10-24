import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient } from '@prisma/client';
import { readConfig } from '../src/config.js';
import { ensureAdminCatalog } from '../src/admin-catalog.js';

const config = readConfig(process.env);
const uid = process.env.BOOTSTRAP_FIREBASE_UID?.trim();
const expectedEmail = process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase();
const displayName = process.env.BOOTSTRAP_NAME?.trim();
const branchCode = process.env.BOOTSTRAP_BRANCH_CODE?.trim().toUpperCase();
const branchName = process.env.BOOTSTRAP_BRANCH_NAME?.trim();
const branchCity = process.env.BOOTSTRAP_BRANCH_CITY?.trim();
const branchAddress = process.env.BOOTSTRAP_BRANCH_ADDRESS?.trim();

if (process.env.BOOTSTRAP_CONFIRM !== 'CREATE_FIRST_SUPER_ADMIN' || !uid || !expectedEmail || !displayName || !branchCode || !branchName || !branchCity) {
  throw new Error('Set BOOTSTRAP_CONFIRM=CREATE_FIRST_SUPER_ADMIN and all BOOTSTRAP_FIREBASE_UID, BOOTSTRAP_EMAIL, BOOTSTRAP_NAME, BOOTSTRAP_BRANCH_CODE, BOOTSTRAP_BRANCH_NAME and BOOTSTRAP_BRANCH_CITY values for this one-time operator command.');
}

let serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccount) {
  const possiblePaths = [
    path.resolve(process.cwd(), 'secrets/firebase-admin.json'),
    path.resolve(process.cwd(), '../secrets/firebase-admin.json'),
    path.resolve(process.cwd(), '../../secrets/firebase-admin.json'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      serviceAccount = fs.readFileSync(p, 'utf8');
      break;
    }
  }
}

const firebase = getApps()[0] ?? initializeApp(serviceAccount ? {
  credential: cert(JSON.parse(serviceAccount)),
  projectId: config.FIREBASE_PROJECT_ID,
} : { projectId: config.FIREBASE_PROJECT_ID });

const firebaseUser = await getAuth(firebase).getUser(uid);
if (!firebaseUser.emailVerified || firebaseUser.email?.toLowerCase() !== expectedEmail || !firebaseUser.providerData.some(provider => provider.providerId === 'google.com')) {
  throw new Error('The Firebase UID must belong to the explicitly supplied, verified Google email identity.');
}

const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
try {
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('vmotiv-v2-first-super-admin', 0))::text`;
    const existingSuperAdmins = await tx.employeeRoleAssignment.count({ where: { role: { key: 'SUPER_ADMIN' } } });
    if (existingSuperAdmins > 0) throw new Error('Bootstrap is permanently closed because a Super Admin already exists. Use the governed role-assignment workflow.');

    await ensureAdminCatalog(tx);
    const role = await tx.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' }, select: { id: true } });
    const branch = await tx.branch.upsert({
      where: { code: branchCode },
      update: { name: branchName, city: branchCity, address: branchAddress || null, active: true },
      create: { code: branchCode, name: branchName, city: branchCity, address: branchAddress || null },
      select: { id: true, code: true },
    });
    const existingUser = await tx.user.findUnique({ where: { firebaseUid: uid }, select: { id: true, email: true } });
    if (existingUser && existingUser.email.toLowerCase() !== expectedEmail) throw new Error('Existing local UID has a different email; bootstrap refused.');
    const user = existingUser ?? await tx.user.create({ data: { firebaseUid: uid, email: expectedEmail, displayName }, select: { id: true, email: true } });
    const employee = await tx.employee.create({ data: {
      userId: user.id,
      employeeCode: `VM-ADMIN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      designation: 'Platform Owner',
      role: 'SUPER_ADMIN', active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT',
      roleAssignments: { create: { roleId: role.id } },
      branchAssignments: { create: { branchId: branch.id } },
    }, select: { userId: true, employeeCode: true } });
    await tx.auditEvent.create({ data: {
      actorId: user.id, action: 'INITIAL_SUPER_ADMIN_BOOTSTRAPPED', entityType: 'Employee', entityId: user.id,
      details: { branchCode: branch.code, branchAddress, firebaseUidVerified: true, mfaEnrollmentRequired: false },
    } });
    return employee;
  }, { timeout: 30_000 });
  console.info(`Created the first Super Admin (${result.employeeCode}). Bootstrap is now closed.`);
} finally {
  await db.$disconnect();
}
