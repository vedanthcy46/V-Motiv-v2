import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const envPath = path.resolve(process.cwd(), 'services/api/.env');
dotenv.config({ path: envPath });

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

const auth = getAuth(firebase);

async function main() {
  const email = process.env.ADMIN_EMAIL || 'vmotiv.v@gmail.com';
  const phoneArg = process.argv.slice(2).find(arg => arg.startsWith('+')) || process.env.ADMIN_PHONE;

  if (!phoneArg) {
    console.log(`\nUsage: npm run mfa:enroll -- <phoneNumberWithCountryCode>`);
    console.log(`Example: npm run mfa:enroll -- +919876543210\n`);

    const user = await auth.getUserByEmail(email);
    console.log(`Current user status for ${email}:`);
    console.log(`  UID: ${user.uid}`);
    console.log(`  Enrolled 2FA Factors:`, user.multiFactor?.enrolledFactors || 'None (no phone factor enrolled yet)');
    return;
  }

  console.log(`Looking up user ${email}...`);
  const user = await auth.getUserByEmail(email);
  console.log(`Found UID: ${user.uid}`);

  console.log(`Enrolling phone factor ${phoneArg} for ${email}...`);
  const updatedUser = await auth.updateUser(user.uid, {
    multiFactor: {
      enrolledFactors: [
        {
          factorId: 'phone',
          phoneNumber: phoneArg,
          displayName: 'Primary Mobile',
        },
      ],
    },
  });

  console.log('Successfully enrolled phone MFA factor:');
  console.log(JSON.stringify(updatedUser.multiFactor?.enrolledFactors, null, 2));
  console.log('\nWhen logging into the Admin Portal, Firebase will now send SMS OTP challenges to this number.');
}

main().catch(err => {
  console.error('Error enrolling MFA:', err);
  process.exit(1);
});
