// ============================================================
// constants/car-catalog.ts
// Canonical Car Catalog for V MOTIV Customer Mobile App
// Used across My Garage, Sell Screen, and Service Booking.
// ============================================================

export interface CarBrandItem {
  name: string;
  category?: 'high_volume' | 'luxury' | 'exotic';
}

export const CAR_MAKES: CarBrandItem[] = [
  // High-Volume Indian Market Makes
  { name: 'Maruti Suzuki', category: 'high_volume' },
  { name: 'Hyundai', category: 'high_volume' },
  { name: 'Tata', category: 'high_volume' },
  { name: 'Mahindra', category: 'high_volume' },
  { name: 'Toyota', category: 'high_volume' },
  { name: 'Kia', category: 'high_volume' },
  { name: 'Honda', category: 'high_volume' },
  { name: 'Volkswagen', category: 'high_volume' },
  { name: 'Skoda', category: 'high_volume' },
  { name: 'Renault', category: 'high_volume' },
  { name: 'MG', category: 'high_volume' },
  { name: 'BYD', category: 'high_volume' },
  { name: 'Nissan', category: 'high_volume' },
  { name: 'Ford', category: 'high_volume' },
  { name: 'Jeep', category: 'high_volume' },
  { name: 'Citroen', category: 'high_volume' },
  { name: 'Datsun', category: 'high_volume' },

  // Luxury & Premium Makes
  { name: 'Mercedes-Benz', category: 'luxury' },
  { name: 'BMW', category: 'luxury' },
  { name: 'Audi', category: 'luxury' },
  { name: 'Volvo', category: 'luxury' },
  { name: 'Jaguar', category: 'luxury' },
  { name: 'Land Rover', category: 'luxury' },
  { name: 'Porsche', category: 'luxury' },

  // Ultra-Luxury & Exotic Makes
  { name: 'Rolls-Royce', category: 'exotic' },
  { name: 'Ferrari', category: 'exotic' },
  { name: 'Lamborghini', category: 'exotic' },
  { name: 'Bugatti', category: 'exotic' },
];

export const MODELS_BY_MAKE: Record<string, string[]> = {
  'Maruti Suzuki': ['Swift', 'Baleno', 'Dzire', 'Vitara Brezza', 'Ertiga', 'Alto', 'WagonR', 'Celerio', 'Ciaz', 'S-Cross', 'Ignis', 'XL6', 'Grand Vitara', 'Fronx', 'Jimny', 'Invicto'],
  'Maruti': ['Swift', 'Baleno', 'Dzire', 'Vitara Brezza', 'Ertiga', 'Alto', 'WagonR', 'Celerio', 'Ciaz', 'S-Cross', 'Ignis', 'XL6', 'Grand Vitara', 'Fronx', 'Jimny', 'Invicto'],
  'Suzuki': ['Swift', 'Baleno', 'Dzire', 'Vitara Brezza', 'Ertiga', 'Alto', 'WagonR', 'Celerio', 'Ciaz', 'S-Cross', 'Ignis', 'XL6', 'Grand Vitara', 'Fronx', 'Jimny', 'Invicto'],
  'Hyundai': ['Creta', 'Venue', 'i20', 'i10', 'Verna', 'Tucson', 'Alcazar', 'Aura', 'Exter', 'Grand i10 Nios', 'Ioniq 5', 'Kona Electric'],
  'Tata': ['Nexon', 'Harrier', 'Safari', 'Altroz', 'Tiago', 'Tigor', 'Punch', 'Curvv', 'Nexon EV', 'Tiago EV', 'Punch EV', 'Sierra'],
  'Mahindra': ['XUV700', 'XUV300', 'XUV 3XO', 'Thar', 'Scorpio', 'Scorpio-N', 'Bolero', 'Bolero Neo', 'XUV400', 'Marazzo', 'Alturas G4', 'BE 6e', 'XEV 9e'],
  'Honda': ['City', 'Amaze', 'Elevate', 'Jazz', 'WR-V', 'Civic', 'CR-V', 'BR-V', 'Brio'],
  'Toyota': ['Innova Crysta', 'Fortuner', 'Innova Hycross', 'Urban Cruiser', 'Glanza', 'Hyryder', 'Camry', 'Corolla Altis', 'Vellfire', 'Hilux', 'Land Cruiser'],
  'Kia': ['Seltos', 'Sonet', 'Carens', 'Carnival', 'EV6', 'EV9'],
  'Renault': ['Kwid', 'Triber', 'Kiger', 'Duster', 'Lodgy', 'Captur'],
  'Skoda': ['Kushaq', 'Slavia', 'Octavia', 'Superb', 'Kodiaq', 'Rapid', 'Kylaq'],
  'Volkswagen': ['Polo', 'Virtus', 'Taigun', 'Vento', 'Tiguan', 'Jetta', 'Passat'],
  'Ford': ['EcoSport', 'Endeavour', 'Figo', 'Aspire', 'Freestyle', 'Mustang', 'Fiesta'],
  'MG': ['Hector', 'Astor', 'Gloster', 'ZS EV', 'Comet EV', 'Windsor EV'],
  'BYD': ['Atto 3', 'Seal', 'eMax 7', 'e6', 'Dolphin', 'Sealion 6'],
  'byd': ['Atto 3', 'Seal', 'eMax 7', 'e6', 'Dolphin', 'Sealion 6'],
  'Jeep': ['Compass', 'Meridian', 'Wrangler', 'Grand Cherokee'],
  'Nissan': ['Magnite', 'Kicks', 'Sunny', 'Micra', 'Terrano', 'X-Trail', 'Evalia'],
  'Citroen': ['C3', 'C3 Aircross', 'Basalt', 'C5 Aircross', 'eC3'],
  'Datsun': ['Go', 'Go+', 'Redi-GO'],
  'Mercedes-Benz': ['C-Class', 'E-Class', 'GLA', 'GLC', 'GLE', 'S-Class', 'A-Class Limousine', 'GLS', 'CLA', 'G-Wagon', 'EQE', 'EQS'],
  'Mercedes': ['C-Class', 'E-Class', 'GLA', 'GLC', 'GLE', 'S-Class', 'A-Class Limousine', 'GLS', 'CLA', 'G-Wagon', 'EQE', 'EQS'],
  'BMW': ['3 Series', '5 Series', 'X1', 'X3', 'X5', '2 Series Gran Coupe', '7 Series', 'Z4', 'X7', 'iX1', 'i4', 'iX'],
  'Audi': ['A4', 'A6', 'Q3', 'Q5', 'Q7', 'A3', 'Q8', 'A8 L', 'e-tron', 'RS5'],
  'Volvo': ['XC40', 'XC60', 'XC90', 'S60', 'S90', 'C40 Recharge', 'EX40'],
  'Jaguar': ['XE', 'XF', 'XJ', 'F-Pace', 'E-Pace', 'F-Type', 'I-Pace'],
  'Land Rover': ['Defender', 'Range Rover Evoque', 'Range Rover Velar', 'Range Rover Sport', 'Discovery Sport', 'Discovery', 'Range Rover'],
  'Porsche': ['Cayenne', 'Macan', 'Panamera', '911 Carrera', '718 Cayman', '718 Boxster', 'Taycan'],
  'Rolls-Royce': ['Ghost', 'Phantom', 'Cullinan', 'Wraith', 'Dawn', 'Spectre'],
  'Ferrari': ['488 GTB', 'F8 Tributo', 'Roma', 'Portofino', '296 GTB', '812 Superfast', 'California T', 'Purosangue'],
  'Lamborghini': ['Urus', 'Huracan', 'Aventador', 'Gallardo', 'Revuelto'],
  'Bugatti': ['Chiron', 'Veyron', 'Divo', 'Bolide', 'Tourbillon'],
};

export interface CarColourOption {
  name: string;
  hex: string;
  borderOnly?: boolean;
}

export const CAR_COLOURS: CarColourOption[] = [
  { name: 'White', hex: '#FFFFFF', borderOnly: true },
  { name: 'Silver', hex: '#C0C0C0' },
  { name: 'Grey', hex: '#808080' },
  { name: 'Black', hex: '#1A1A1A' },
  { name: 'Red', hex: '#CC2200' },
  { name: 'Blue', hex: '#1A4DA0' },
  { name: 'Dark Blue', hex: '#0A1F5C' },
  { name: 'Brown', hex: '#7B4F2E' },
  { name: 'Maroon', hex: '#6B1414' },
  { name: 'Gold', hex: '#C89B3C' },
  { name: 'Green', hex: '#2E6B3C' },
  { name: 'Orange', hex: '#D45A00' },
];

export const FUEL_TYPES = [
  { value: 'PETROL', label: 'Petrol' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'CNG', label: 'CNG' },
  { value: 'ELECTRIC', label: 'Electric' },
  { value: 'HYBRID', label: 'Hybrid' },
] as const;

export const TRANSMISSIONS = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'AUTOMATIC', label: 'Automatic' },
] as const;

export const OWNERSHIP_TYPES = [
  { value: 'OWNER', label: 'Primary Owner' },
  { value: 'FAMILY', label: 'Family Member' },
  { value: 'COMPANY', label: 'Company / Corporate' },
  { value: 'AUTHORIZED_DRIVER', label: 'Authorized Driver' },
] as const;

// Quick year generation from next year down to 1995
const CURRENT_YEAR = new Date().getFullYear();
export const QUICK_YEARS: string[] = [
  String(CURRENT_YEAR + 1),
  String(CURRENT_YEAR),
  String(CURRENT_YEAR - 1),
  String(CURRENT_YEAR - 2),
  String(CURRENT_YEAR - 3),
  String(CURRENT_YEAR - 4),
  String(CURRENT_YEAR - 5),
  String(CURRENT_YEAR - 6),
  String(CURRENT_YEAR - 7),
  String(CURRENT_YEAR - 8),
  String(CURRENT_YEAR - 9),
  String(CURRENT_YEAR - 10),
];

export const ALL_YEARS: string[] = [];
for (let y = CURRENT_YEAR + 1; y >= 1990; y--) {
  ALL_YEARS.push(String(y));
}
