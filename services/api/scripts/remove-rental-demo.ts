import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const DEMO_FLEET_NUMBERS = ['VMR-DEMO-001', 'VMF-001', 'VMF-002', 'VMF-003'];
const DEMO_PLATES = ['DEMO-LOCAL-001', 'KA01MJ8812', 'KA01MJ9944', 'KA01EV5501'];

async function removeDemoFleet() {
  console.log('Searching for seeded demo rental fleet vehicles...');

  const demoVehicles = await db.rentalFleetVehicle.findMany({
    where: {
      OR: [
        { fleetNumber: { in: DEMO_FLEET_NUMBERS } },
        { fleetNumber: { startsWith: 'VMR-DEMO' } },
        { registrationNumber: { in: DEMO_PLATES } },
        { registrationNumber: { startsWith: 'DEMO-' } },
      ],
    },
    include: {
      bookings: true,
      blocks: true,
      holds: true,
    },
  });

  if (demoVehicles.length === 0) {
    console.log('No demo rental fleet vehicles found. Database is already clean.');
    return;
  }

  console.log(`Found ${demoVehicles.length} demo rental vehicle(s) to remove:`);
  for (const veh of demoVehicles) {
    console.log(`  - [${veh.fleetNumber}] ${veh.registrationNumber}: ${veh.make} ${veh.model} (${veh.id})`);
  }

  for (const veh of demoVehicles) {
    await db.$transaction(async tx => {
      const bookingIds = veh.bookings.map(b => b.id);

      if (bookingIds.length > 0) {
        // Delete related booking data
        await tx.rentalAuditEvent.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.rentalPaymentRecord.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.rentalDriverVerification.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.rentalTripRecord.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.rentalAgreementAcceptance.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.rentalDamageClaim.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.rentalBookingExtension.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.rentalBooking.deleteMany({ where: { id: { in: bookingIds } } });
        console.log(`    Deleted ${bookingIds.length} related demo booking(s)`);
      }

      // Delete blocks and holds
      await tx.rentalVehicleBlock.deleteMany({ where: { vehicleId: veh.id } });
      await tx.rentalBookingHold.deleteMany({ where: { vehicleId: veh.id } });

      // Delete the vehicle
      await tx.rentalFleetVehicle.delete({ where: { id: veh.id } });
      console.log(`    Deleted demo vehicle ${veh.fleetNumber} (${veh.registrationNumber})`);
    });
  }

  console.log('All seeded demo rental cars have been successfully removed!');
}

removeDemoFleet()
  .catch(console.error)
  .finally(() => db.$disconnect());
