import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const DEMO_TITLES = [
  '2023 Tata Nexon XZ+ (O) Dark Edition',
  '2022 Hyundai Creta SX (O) AT',
  '2023 Mahindra XUV700 AX7 Luxury Pack',
  '2022 Maruti Suzuki Brezza ZXi Plus AT',
  '2021 Kia Seltos GTX Plus AT',
  '2022 Honda City 5th Gen ZX CVT',
  '2023 Maruti Suzuki Baleno Alpha AGS',
  '2021 Toyota Innova Crysta 2.4 VX 7 STR',
];

async function unseed() {
  console.log('Finding demo vehicle listings to remove...');

  const demoListings = await db.vehicleListing.findMany({
    where: {
      title: { in: DEMO_TITLES },
    },
    select: {
      id: true,
      vehicleId: true,
      title: true,
    },
  });

  if (demoListings.length === 0) {
    console.log('No demo listings found. Database is already clean.');
    return;
  }

  const listingIds = demoListings.map((l) => l.id);
  const vehicleIds = demoListings.map((l) => l.vehicleId);

  console.log(`Found ${demoListings.length} demo listings:`);
  demoListings.forEach((l) => console.log(`  - ${l.title} (${l.id})`));

  // 1. Delete associated wishlist items
  const wishlistDeleted = await db.wishlistItem.deleteMany({
    where: { listingId: { in: listingIds } },
  });
  console.log(`Removed ${wishlistDeleted.count} associated wishlist items.`);

  // 2. Delete associated test drive requests
  const drivesDeleted = await db.testDriveRequest.deleteMany({
    where: { listingId: { in: listingIds } },
  });
  console.log(`Removed ${drivesDeleted.count} associated test drive requests.`);

  // 3. Delete associated purchase enquiries
  const enquiriesDeleted = await db.purchaseEnquiry.deleteMany({
    where: { listingId: { in: listingIds } },
  });
  console.log(`Removed ${enquiriesDeleted.count} associated purchase enquiries.`);

  // 4. Delete associated media
  const mediaDeleted = await db.vehicleMedia.deleteMany({
    where: { listingId: { in: listingIds } },
  });
  console.log(`Removed ${mediaDeleted.count} associated media items.`);

  // 5. Delete vehicle listings
  const listingsDeleted = await db.vehicleListing.deleteMany({
    where: { id: { in: listingIds } },
  });
  console.log(`Removed ${listingsDeleted.count} vehicle listings.`);

  // 6. Delete underlying vehicles
  const vehiclesDeleted = await db.vehicle.deleteMany({
    where: { id: { in: vehicleIds } },
  });
  console.log(`Removed ${vehiclesDeleted.count} vehicles.`);

  console.log('Demo inventory data successfully removed!');
}

unseed()
  .catch((e) => {
    console.error('Error unseeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
