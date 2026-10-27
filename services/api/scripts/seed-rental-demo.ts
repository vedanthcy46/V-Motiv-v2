import { PrismaClient, RentalVehicleStatus } from '@prisma/client';

const db = new PrismaClient();

async function seedFleet() {
  const hubs = await db.serviceHub.findMany({ where: { isActive: true } });
  if (hubs.length === 0) {
    console.log('No hubs found');
    return;
  }

  const future = new Date();
  future.setFullYear(future.getFullYear() + 2);

  const primaryHub = hubs[0];

  const demoFleet = [
    {
      fleetNumber: 'VMF-001',
      registrationNumber: 'KA01MJ8812',
      vin: 'MALC1234567890123',
      make: 'Hyundai',
      model: 'Creta SX (O)',
      variant: '1.5 Petrol IVT Automatic',
      year: 2023,
      transmission: 'AUTOMATIC',
      fuelType: 'PETROL',
      seats: 5,
      color: 'Polar White',
      odometerKm: 18450,
      fuelLevelPercent: 100,
      hubId: primaryHub.id,
      images: [
        'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80',
      ],
      status: RentalVehicleStatus.AVAILABLE,
      commercialPermitNumber: 'KA-RENT-2023-8812',
      commercialPermitExpiry: future,
      insurancePolicyNumber: 'HDFC-ERGO-COM-44012',
      insuranceExpiry: future,
      fitnessCertExpiry: future,
      isEligibleForRental: true,
      baseDailyRatePaise: 300000, // ₹3,000 / day
      baseHourlyRatePaise: 20000,  // ₹200 / hr
      securityDepositPaise: 500000, // ₹5,000 deposit
      includedKmPerDay: 250,
      extraKmRatePaise: 1200,      // ₹12 / km
      features: ['Panoramic Sunroof', 'Ventilated Seats', 'Wireless CarPlay', 'Cruise Control'],
    },
    {
      fleetNumber: 'VMF-002',
      registrationNumber: 'KA01MJ9944',
      vin: 'MBTF9876543210987',
      make: 'Toyota',
      model: 'Innova Crysta 2.4 VX',
      variant: '7-Seater Diesel Manual',
      year: 2023,
      transmission: 'MANUAL',
      fuelType: 'DIESEL',
      seats: 7,
      color: 'Silver Metallic',
      odometerKm: 24100,
      fuelLevelPercent: 100,
      hubId: primaryHub.id,
      images: [
        'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80',
      ],
      status: RentalVehicleStatus.AVAILABLE,
      commercialPermitNumber: 'KA-RENT-2023-9944',
      commercialPermitExpiry: future,
      insurancePolicyNumber: 'ICICI-LOMBARD-COM-5519',
      insuranceExpiry: future,
      fitnessCertExpiry: future,
      isEligibleForRental: true,
      baseDailyRatePaise: 420000, // ₹4,200 / day
      baseHourlyRatePaise: 28000,  // ₹280 / hr
      securityDepositPaise: 700000, // ₹7,000 deposit
      includedKmPerDay: 300,
      extraKmRatePaise: 1500,      // ₹15 / km
      features: ['Captain Seats', 'Rear AC Vents', 'Touchscreen Infotainment', 'Airbags'],
    },
    {
      fleetNumber: 'VMF-003',
      registrationNumber: 'KA01EV5501',
      vin: 'TATANEXONEV202401',
      make: 'Tata',
      model: 'Nexon EV Empowered',
      variant: 'Long Range 40.5kWh',
      year: 2024,
      transmission: 'AUTOMATIC',
      fuelType: 'EV',
      seats: 5,
      color: 'Daytona Grey',
      odometerKm: 9800,
      fuelLevelPercent: 100,
      hubId: primaryHub.id,
      images: [
        'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=80',
      ],
      status: RentalVehicleStatus.AVAILABLE,
      commercialPermitNumber: 'KA-RENT-2024-5501',
      commercialPermitExpiry: future,
      insurancePolicyNumber: 'TATA-AIG-COM-77002',
      insuranceExpiry: future,
      fitnessCertExpiry: future,
      isEligibleForRental: true,
      baseDailyRatePaise: 350000, // ₹3,500 / day
      baseHourlyRatePaise: 22000,  // ₹220 / hr
      securityDepositPaise: 600000, // ₹6,000 deposit
      includedKmPerDay: 200,
      extraKmRatePaise: 1000,      // ₹10 / km
      features: ['360-Degree Camera', 'Fast Charging Support', 'V2L Capability', 'Blind Spot Monitor'],
    },
  ];

  for (const car of demoFleet) {
    await db.rentalFleetVehicle.upsert({
      where: { fleetNumber: car.fleetNumber },
      update: car as any,
      create: car as any,
    });
    console.log(`Seeded rental fleet vehicle: ${car.fleetNumber} (${car.make} ${car.model})`);
  }
}

seedFleet()
  .catch(console.error)
  .finally(() => db.$disconnect());
