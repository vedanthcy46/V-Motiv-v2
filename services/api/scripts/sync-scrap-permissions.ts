// Adds the vehicle-scrapping permissions and their role grants to the database. Additive only: nothing is deleted or changed, and it is safe
// to run more than once. Run it after the scrapping database migration has been applied:
//
//   npm run sync:scrap-permissions -w @vmotiv/api
//
import { PrismaClient } from '@prisma/client';
import { syncScrapPermissions } from '../src/scrap/scrap-permissions-sync.js';

const db = new PrismaClient();
try {
  const result = await syncScrapPermissions(db);
  console.info(`Scrapping permissions: ${result.permissions} defined, ${result.grants} new grant(s) added.`);
  if (result.rolesMissing.length) console.warn(`These roles do not exist in this database yet, so nothing was granted to them: ${result.rolesMissing.join(', ')}`);
} finally {
  await db.$disconnect();
}
