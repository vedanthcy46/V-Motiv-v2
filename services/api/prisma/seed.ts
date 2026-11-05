import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const CITIES = [
  'Bengaluru',
  'Hyderabad',
  'Chennai',
  'Mumbai',
  'Pune',
  'Delhi NCR',
];

const VEHICLES = [
  {
    make: 'Tata',
    model: 'Nexon',
    variant: 'XZ+ (O) Dark Edition',
    manufacturingYear: 2023,
    registrationYear: 2023,
    fuelType: 'PETROL',
    transmission: 'MANUAL',
    odometerKm: 18500,
    color: 'Atlas Black',
    ownershipCount: 1,
    city: 'Bengaluru',
    bodyType: 'SUV',
    engineCapacityCc: 1199,
    pricePaise: 98500000n, // ₹9,85,000
    title: '2023 Tata Nexon XZ+ (O) Dark Edition',
    conditionSummary: 'Meticulously maintained, single owner, complete service history at authorized dealership. Tyres at 75% tread life remaining.',
    inspectionSummary: '180-point quality check completed. Engine health rated 4.9/5. All original factory panels, zero structural damage, comprehensive OBD scan clear.',
    inspectionReportUrl: 'https://vmotiv.in/reports/nexon-xz-2023.pdf',
    features: ['Electric Sunroof', 'Ventilated Leatherette Seats', 'Air Purifier', 'Touchscreen Navigation', 'Cruise Control', 'Reverse Camera with Dynamic Guidelines'],
    verifiedTags: ['VMOTIV_CERTIFIED', 'NON_ACCIDENTAL', 'SINGLE_OWNER', 'SERVICE_HISTORY_VERIFIED'],
    media: [
      { url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80', displayOrder: 0 },
      { url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80', displayOrder: 1 },
      { url: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=1200&q=80', displayOrder: 2 },
    ],
  },
  {
    make: 'Hyundai',
    model: 'Creta',
    variant: 'SX (O) AT',
    manufacturingYear: 2022,
    registrationYear: 2022,
    fuelType: 'DIESEL',
    transmission: 'AUTOMATIC',
    odometerKm: 32000,
    color: 'Polar White',
    ownershipCount: 1,
    city: 'Hyderabad',
    bodyType: 'SUV',
    engineCapacityCc: 1493,
    pricePaise: 142000000n, // ₹14,20,000
    title: '2022 Hyundai Creta SX (O) AT',
    conditionSummary: 'Showroom condition, panoramic sunroof, automatic transmission shifting seamlessly. Full insurance active.',
    inspectionSummary: '180-point inspection passed. Brake pads at 80%, suspension quiet, battery tested optimal.',
    inspectionReportUrl: 'https://vmotiv.in/reports/creta-sxo-2022.pdf',
    features: ['Panoramic Sunroof', 'Bose Premium Audio', 'Electronic Parking Brake', 'Paddle Shifters', 'Ventilated Seats', 'Wireless Phone Charger'],
    verifiedTags: ['VMOTIV_CERTIFIED', 'NON_ACCIDENTAL', 'ORIGINAL_PAINT'],
    media: [
      { url: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=1200&q=80', displayOrder: 0 },
      { url: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=1200&q=80', displayOrder: 1 },
    ],
  },
  {
    make: 'Mahindra',
    model: 'XUV700',
    variant: 'AX7 Luxury Pack',
    manufacturingYear: 2023,
    registrationYear: 2023,
    fuelType: 'PETROL',
    transmission: 'AUTOMATIC',
    odometerKm: 15200,
    color: 'Midnight Black',
    ownershipCount: 1,
    city: 'Bengaluru',
    bodyType: 'SUV',
    engineCapacityCc: 1997,
    pricePaise: 215000000n, // ₹21,50,000
    title: '2023 Mahindra XUV700 AX7 Luxury Pack',
    conditionSummary: 'Top-tier ADAS package, flush door handles, twin digital HD displays, 12-speaker Sony 3D sound.',
    inspectionSummary: 'Passed 180-point certification. ADAS camera calibrated, turbocharger inspection verified clear.',
    inspectionReportUrl: 'https://vmotiv.in/reports/xuv700-ax7-2023.pdf',
    features: ['Level 2 ADAS', 'Dual 10.25-inch Screens', 'Blind View Monitor', 'Sony 3D Sound', 'Wireless Android Auto / CarPlay', 'Smart Door Handles'],
    verifiedTags: ['VMOTIV_CERTIFIED', 'WARRANTY_ACTIVE', 'SINGLE_OWNER'],
    media: [
      { url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80', displayOrder: 0 },
      { url: 'https://images.unsplash.com/photo-1541348263662-e0c8de4259ba?auto=format&fit=crop&w=1200&q=80', displayOrder: 1 },
    ],
  },
  {
    make: 'Maruti Suzuki',
    model: 'Brezza',
    variant: 'ZXi Plus AT',
    manufacturingYear: 2022,
    registrationYear: 2022,
    fuelType: 'PETROL',
    transmission: 'AUTOMATIC',
    odometerKm: 24000,
    color: 'Magma Grey',
    ownershipCount: 1,
    city: 'Chennai',
    bodyType: 'SUV',
    engineCapacityCc: 1462,
    pricePaise: 89000000n, // ₹8,90,000
    title: '2022 Maruti Suzuki Brezza ZXi Plus AT',
    conditionSummary: 'Smart Hybrid technology with excellent city fuel efficiency. Highly reliable, pristine interiors.',
    inspectionSummary: '180-point inspection completed. All electrical systems verified, zero suspension play.',
    inspectionReportUrl: 'https://vmotiv.in/reports/brezza-zxi-2022.pdf',
    features: ['Head-Up Display (HUD)', '360-degree View Camera', 'Electric Sunroof', 'SmartPlay Pro+ Touchscreen', 'Paddle Shifters'],
    verifiedTags: ['VMOTIV_CERTIFIED', 'LOW_MAINTENANCE', 'SINGLE_OWNER'],
    media: [
      { url: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=1200&q=80', displayOrder: 0 },
    ],
  },
  {
    make: 'Kia',
    model: 'Seltos',
    variant: 'GTX Plus AT',
    manufacturingYear: 2021,
    registrationYear: 2021,
    fuelType: 'DIESEL',
    transmission: 'AUTOMATIC',
    odometerKm: 38000,
    color: 'Intense Red',
    ownershipCount: 1,
    city: 'Mumbai',
    bodyType: 'SUV',
    engineCapacityCc: 1493,
    pricePaise: 137500000n, // ₹13,75,000
    title: '2021 Kia Seltos GTX Plus AT',
    conditionSummary: 'GT-Line styling with red accents, BOSE 8-speaker audio, ventilated front seats.',
    inspectionSummary: '180-point check passed. Transmission fluid checked, no oil leaks, all electronics fully operational.',
    inspectionReportUrl: 'https://vmotiv.in/reports/seltos-gtx-2021.pdf',
    features: ['Ventilated Seats', 'BOSE Sound System', 'UVO Connected Car', 'Smart Pure Air Purifier', 'Drive & Traction Modes'],
    verifiedTags: ['VMOTIV_CERTIFIED', 'NON_ACCIDENTAL'],
    media: [
      { url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80', displayOrder: 0 },
    ],
  },
  {
    make: 'Honda',
    model: 'City',
    variant: 'ZX CVT',
    manufacturingYear: 2022,
    registrationYear: 2022,
    fuelType: 'PETROL',
    transmission: 'AUTOMATIC',
    odometerKm: 21000,
    color: 'Radiant Red Metallic',
    ownershipCount: 1,
    city: 'Pune',
    bodyType: 'SEDAN',
    engineCapacityCc: 1498,
    pricePaise: 124000000n, // ₹12,40,000
    title: '2022 Honda City 5th Gen ZX CVT',
    conditionSummary: 'Renowned i-VTEC engine smoothness with CVT automatic. Unrivalled rear legroom and executive ride comfort.',
    inspectionSummary: '180-point quality check completed. LaneWatch camera operational, suspension smooth, tyres at 80% life.',
    inspectionReportUrl: 'https://vmotiv.in/reports/city-zx-2022.pdf',
    features: ['Honda LaneWatch Camera', 'Full LED Headlamps', 'Electric Sunroof', '8-inch Touchscreen Infotainment', 'One-Touch Power Windows'],
    verifiedTags: ['VMOTIV_CERTIFIED', 'SINGLE_OWNER', 'COMPLETE_SERVICE_RECORD'],
    media: [
      { url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80', displayOrder: 0 },
    ],
  },
  {
    make: 'Maruti Suzuki',
    model: 'Baleno',
    variant: 'Alpha AGS',
    manufacturingYear: 2023,
    registrationYear: 2023,
    fuelType: 'PETROL',
    transmission: 'AUTOMATIC',
    odometerKm: 14000,
    color: 'Nexa Blue',
    ownershipCount: 1,
    city: 'Delhi NCR',
    bodyType: 'HATCHBACK',
    engineCapacityCc: 1197,
    pricePaise: 78000000n, // ₹7,80,000
    title: '2023 Maruti Suzuki Baleno Alpha AGS',
    conditionSummary: 'Near-new condition premium hatchback with head-up display, 360 camera and Arkamys surround sound.',
    inspectionSummary: '180-point check passed. Battery at 100%, original tyres, zero dings or paint touchups.',
    inspectionReportUrl: 'https://vmotiv.in/reports/baleno-alpha-2023.pdf',
    features: ['Head-Up Display', '360 View Camera', 'Surround Sense Powered by ARKAMYS', 'LED Projector Headlamps', 'Auto-Dimming IRVM'],
    verifiedTags: ['VMOTIV_CERTIFIED', 'SINGLE_OWNER', 'FACTORY_WARRANTY'],
    media: [
      { url: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=1200&q=80', displayOrder: 0 },
    ],
  },
  {
    make: 'Toyota',
    model: 'Innova Crysta',
    variant: '2.4 VX 7 STR',
    manufacturingYear: 2021,
    registrationYear: 2021,
    fuelType: 'DIESEL',
    transmission: 'MANUAL',
    odometerKm: 45000,
    color: 'Super White',
    ownershipCount: 1,
    city: 'Bengaluru',
    bodyType: 'MUV',
    engineCapacityCc: 2393,
    pricePaise: 199000000n, // ₹19,90,000
    title: '2021 Toyota Innova Crysta 2.4 VX 7 STR',
    conditionSummary: 'Legendary bulletproof reliability, 7-seater captain seats layout, driven exclusively on highways with Toyota official service history.',
    inspectionSummary: '180-point inspection passed. Heavy duty clutch tested, diesel injectors clean, air conditioning cooling verified.',
    inspectionReportUrl: 'https://vmotiv.in/reports/innova-crysta-2021.pdf',
    features: ['Captain Seats with Armrest', 'Rear Automatic AC', 'Cruise Control', '7 Airbags', 'Push Button Start/Stop'],
    verifiedTags: ['VMOTIV_CERTIFIED', 'HIGHWAY_DRIVEN', 'TOYOTA_MAINTAINED'],
    media: [
      { url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80', displayOrder: 0 },
    ],
  },
];

async function seed() {
  console.log('Seeding supported cities...');
  for (const name of CITIES) {
    await db.supportedCity.upsert({
      where: { name },
      update: { active: true },
      create: { name, active: true },
    });
  }

  console.log('Seeding vehicle inventory...');
  for (const item of VEHICLES) {
    const { media, pricePaise, title, ...vehicleData } = item;
    
    // Check if listing already exists
    const existingListing = await db.vehicleListing.findFirst({
      where: { title },
    });

    if (existingListing) {
      console.log(`Listing '${title}' already exists, skipping.`);
      continue;
    }

    const vehicle = await db.vehicle.create({
      data: vehicleData,
    });

    const listing = await db.vehicleListing.create({
      data: {
        vehicleId: vehicle.id,
        title,
        pricePaise,
        currency: 'INR',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        media: {
          create: media.map(m => ({
            url: m.url,
            mediaType: 'IMAGE',
            displayOrder: m.displayOrder,
          })),
        },
      },
    });

    console.log(`Created listing: ${listing.title} (${listing.id})`);
  }

  console.log('Database seeding complete!');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
