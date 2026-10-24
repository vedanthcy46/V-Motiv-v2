import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { ensureAdminCatalog } from '../src/admin-catalog.js';

// Load environment variables
const envPath = path.resolve(process.cwd(), 'services/api/.env');
dotenv.config({ path: envPath });

// Find firebase-admin.json service account
let serviceAccountJson: string | null = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || null;
if (!serviceAccountJson) {
  const possiblePaths = [
    path.resolve(process.cwd(), 'secrets/firebase-admin.json'),
    path.resolve(process.cwd(), '../secrets/firebase-admin.json'),
    path.resolve(process.cwd(), '../../secrets/firebase-admin.json'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      serviceAccountJson = fs.readFileSync(p, 'utf8');
      console.log(`Loaded service account from: ${p}`);
      break;
    }
  }
}

if (!serviceAccountJson) {
  throw new Error('Could not find firebase-admin.json or FIREBASE_SERVICE_ACCOUNT_JSON.');
}

const serviceAccount = JSON.parse(serviceAccountJson);
const firebase = getApps()[0] ?? initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id || 'v-motiv',
});

// Admin details
const email = 'vmotiv.v@gmail.com';
const displayName = 'V Motiv';
const branchCode = 'BLR-MAIN';
const branchName = 'V MOTIV Bengaluru Hub';
const branchCity = 'Bengaluru';
const branchAddress = 'Sulibele Road, near Veera Kempamma Veera Tamanna Kula Devastana, Lakkondanahalli, Hoskote, Alappanahalli, Karnataka 562165';

// Verify in Firebase Auth
console.log(`Verifying ${email} in Firebase Auth...`);
const firebaseUser = await getAuth(firebase).getUserByEmail(email);
console.log(`Verified Firebase User: uid=${firebaseUser.uid}, email=${firebaseUser.email}, verified=${firebaseUser.emailVerified}`);

if (!firebaseUser.emailVerified) {
  console.log(`Setting emailVerified to true in Firebase Auth for ${email}...`);
  await getAuth(firebase).updateUser(firebaseUser.uid, { emailVerified: true });
}

// Database URLs to seed
const databases = [
  { name: 'Local Dev Database', url: 'postgresql://vmotiv_v2@127.0.0.1:5440/vmotiv_v2_dev' },
  { name: 'Neon Production Database', url: 'postgresql://neondb_owner:npg_ZbytqXH2UKp8@ep-green-band-b52uqy11-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require' },
];

for (const dbConfig of databases) {
  console.log(`\n========================================`);
  console.log(`Seeding Admin for: ${dbConfig.name}...`);
  console.log(`========================================`);

  const db = new PrismaClient({ datasourceUrl: dbConfig.url });
  try {
    await db.$connect();
    
    // Ensure cities exist
    await db.supportedCity.upsert({
      where: { name: branchCity },
      update: { active: true },
      create: { name: branchCity, active: true },
    });

    // Ensure permissions and roles catalog
    await ensureAdminCatalog(db);

    const superAdminRole = await db.role.findUniqueOrThrow({
      where: { key: 'SUPER_ADMIN' },
      select: { id: true },
    });

    // Upsert Bengaluru Hub Branch
    const branch = await db.branch.upsert({
      where: { code: branchCode },
      update: {
        name: branchName,
        city: branchCity,
        address: branchAddress,
        active: true,
      },
      create: {
        code: branchCode,
        name: branchName,
        city: branchCity,
        address: branchAddress,
        active: true,
      },
      select: { id: true, code: true, name: true, city: true, address: true },
    });
    console.log(`Branch ready: [${branch.code}] ${branch.name} - ${branch.address}`);

    // Upsert User
    const user = await db.user.upsert({
      where: { firebaseUid: firebaseUser.uid },
      update: {
        email: firebaseUser.email!.toLowerCase(),
        displayName: displayName || firebaseUser.displayName,
        status: 'ACTIVE',
      },
      create: {
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email!.toLowerCase(),
        displayName: displayName || firebaseUser.displayName,
        status: 'ACTIVE',
      },
      select: { id: true, email: true, firebaseUid: true },
    });
    console.log(`User record ready: ${user.email} (id: ${user.id}, uid: ${user.firebaseUid})`);

    // Upsert Employee
    const employeeCode = 'VM-ADMIN-SUPER01';
    const existingEmployee = await db.employee.findUnique({
      where: { userId: user.id },
      include: {
        roleAssignments: true,
        branchAssignments: true,
      },
    });

    let employee;
    if (!existingEmployee) {
      employee = await db.employee.create({
        data: {
          userId: user.id,
          employeeCode,
          designation: 'Platform Owner',
          role: 'SUPER_ADMIN',
          active: true,
          status: 'ACTIVE',
          mfaStatus: 'COMPLIANT',
          roleAssignments: { create: { roleId: superAdminRole.id } },
          branchAssignments: { create: { branchId: branch.id } },
        },
        select: { userId: true, employeeCode: true, role: true, active: true, status: true },
      });
      console.log(`Created new Super Admin employee: ${employee.employeeCode}`);
    } else {
      employee = await db.employee.update({
        where: { userId: user.id },
        data: {
          role: 'SUPER_ADMIN',
          active: true,
          status: 'ACTIVE',
          mfaStatus: 'COMPLIANT',
        },
        select: { userId: true, employeeCode: true, role: true, active: true, status: true },
      });

      // Ensure role assignment
      const hasRole = existingEmployee.roleAssignments.some(r => r.roleId === superAdminRole.id);
      if (!hasRole) {
        await db.employeeRoleAssignment.upsert({
          where: { employeeId_roleId: { employeeId: user.id, roleId: superAdminRole.id } },
          update: {},
          create: { employeeId: user.id, roleId: superAdminRole.id },
        });
      }

      // Ensure branch assignment
      const hasBranch = existingEmployee.branchAssignments.some(b => b.branchId === branch.id);
      if (!hasBranch) {
        await db.employeeBranchAssignment.upsert({
          where: { employeeId_branchId: { employeeId: user.id, branchId: branch.id } },
          update: {},
          create: { employeeId: user.id, branchId: branch.id },
        });
      }
      console.log(`Updated existing Super Admin employee: ${employee.employeeCode || employeeCode}`);
    }

    // Audit event
    await db.auditEvent.create({
      data: {
        actorId: user.id,
        action: 'INITIAL_SUPER_ADMIN_BOOTSTRAPPED',
        entityType: 'Employee',
        entityId: user.id,
        details: {
          branchCode: branch.code,
          branchAddress: branch.address,
          email: user.email,
          firebaseUid: user.firebaseUid,
          seededAt: new Date().toISOString(),
        },
      },
    });

    console.log(`✅ Successfully seeded Super Admin on ${dbConfig.name}!`);
  } catch (err: any) {
    console.error(`❌ Failed to seed ${dbConfig.name}:`, err.message || err);
  } finally {
    await db.$disconnect();
  }
}
