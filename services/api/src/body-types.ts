// Body type of a car: one canonical code per vehicle so the "Body type" filter works for every listing.
// The codes are the BODY_TYPE master-data codes (Admin portal > Master data). A model's body type is looked up from
// the catalogue below when staff do not set it by hand, and existing vehicles were back-filled the same way.

export const BODY_TYPE_CODES = ['HATCHBACK', 'SEDAN', 'SUV', 'MUV', 'COUPE', 'CONVERTIBLE'] as const;
export type BodyTypeCode = (typeof BODY_TYPE_CODES)[number];

const ALIASES: Record<string, BodyTypeCode> = {
  HATCHBACK: 'HATCHBACK', HATCH: 'HATCHBACK',
  SEDAN: 'SEDAN', SALOON: 'SEDAN',
  SUV: 'SUV', 'COMPACT SUV': 'SUV', 'COMPACT_SUV': 'SUV', CROSSOVER: 'SUV', 'SUB-4M SUV': 'SUV',
  MUV: 'MUV', MPV: 'MUV', 'MINI VAN': 'MUV', MINIVAN: 'MUV', VAN: 'MUV',
  COUPE: 'COUPE', 'COUPÉ': 'COUPE', SPORTS: 'COUPE', 'SPORTS CAR': 'COUPE',
  CONVERTIBLE: 'CONVERTIBLE', CABRIOLET: 'CONVERTIBLE', ROADSTER: 'CONVERTIBLE',
};

/** Maps any spelling ("Hatchback", "hatch_back", "MPV", "Compact SUV") to the canonical code, or null when unknown. */
export function normalizeBodyType(value?: string | null): BodyTypeCode | null {
  if (!value) return null;
  const key = value.trim().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
  return ALIASES[key] ?? ALIASES[key.replace(/ /g, '')] ?? null;
}

const BY_BODY: Record<BodyTypeCode, Record<string, string[]>> = {
  HATCHBACK: {
    'maruti suzuki': ['Swift', 'Baleno', 'Alto', 'WagonR', 'Celerio', 'Ignis'],
    hyundai: ['i20', 'i10', 'Grand i10 Nios'],
    tata: ['Altroz', 'Tiago', 'Tiago EV'],
    honda: ['Jazz', 'Brio'],
    toyota: ['Glanza'],
    renault: ['Kwid'],
    volkswagen: ['Polo'],
    ford: ['Figo', 'Freestyle'],
    mg: ['Comet EV'],
    byd: ['Dolphin'],
    nissan: ['Micra'],
    citroen: ['C3', 'eC3'],
    datsun: ['Go', 'Redi-GO'],
    'mercedes-benz': ['A-Class Limousine'],
    audi: ['A3'],
  },
  SEDAN: {
    'maruti suzuki': ['Dzire', 'Ciaz'],
    hyundai: ['Verna', 'Aura'],
    tata: ['Tigor'],
    honda: ['City', 'Amaze', 'Civic'],
    toyota: ['Camry', 'Corolla Altis'],
    skoda: ['Slavia', 'Octavia', 'Superb', 'Rapid'],
    volkswagen: ['Virtus', 'Vento', 'Jetta', 'Passat'],
    ford: ['Aspire', 'Fiesta'],
    byd: ['Seal', 'e6'],
    nissan: ['Sunny'],
    'mercedes-benz': ['C-Class', 'E-Class', 'S-Class', 'CLA', 'EQE', 'EQS'],
    bmw: ['3 Series', '5 Series', '7 Series', 'i4', '2 Series Gran Coupe'],
    audi: ['A4', 'A6', 'A8 L'],
    volvo: ['S60', 'S90'],
    jaguar: ['XE', 'XF', 'XJ'],
    porsche: ['Panamera', 'Taycan'],
    'rolls-royce': ['Ghost', 'Phantom', 'Spectre'],
  },
  SUV: {
    'maruti suzuki': ['Vitara Brezza', 'S-Cross', 'Grand Vitara', 'Fronx', 'Jimny'],
    hyundai: ['Creta', 'Venue', 'Tucson', 'Alcazar', 'Exter', 'Ioniq 5', 'Kona Electric'],
    tata: ['Nexon', 'Harrier', 'Safari', 'Punch', 'Curvv', 'Nexon EV', 'Punch EV', 'Sierra'],
    mahindra: ['XUV700', 'XUV300', 'XUV 3XO', 'Thar', 'Scorpio', 'Scorpio-N', 'Bolero', 'Bolero Neo', 'XUV400', 'Alturas G4', 'BE 6e', 'XEV 9e'],
    honda: ['Elevate', 'WR-V', 'CR-V'],
    toyota: ['Fortuner', 'Urban Cruiser', 'Hyryder', 'Hilux', 'Land Cruiser'],
    kia: ['Seltos', 'Sonet', 'EV6', 'EV9'],
    renault: ['Kiger', 'Duster', 'Captur'],
    skoda: ['Kushaq', 'Kodiaq', 'Kylaq'],
    volkswagen: ['Taigun', 'Tiguan'],
    ford: ['EcoSport', 'Endeavour'],
    mg: ['Hector', 'Astor', 'Gloster', 'ZS EV', 'Windsor EV'],
    byd: ['Atto 3', 'Sealion 6'],
    jeep: ['Compass', 'Meridian', 'Wrangler', 'Grand Cherokee'],
    nissan: ['Magnite', 'Kicks', 'Terrano', 'X-Trail'],
    citroen: ['C3 Aircross', 'Basalt', 'C5 Aircross'],
    'mercedes-benz': ['GLA', 'GLC', 'GLE', 'GLS', 'G-Wagon'],
    bmw: ['X1', 'X3', 'X5', 'X7', 'iX1', 'iX'],
    audi: ['Q3', 'Q5', 'Q7', 'Q8', 'e-tron'],
    volvo: ['XC40', 'XC60', 'XC90', 'C40 Recharge', 'EX40'],
    jaguar: ['F-Pace', 'E-Pace', 'I-Pace'],
    'land rover': ['Defender', 'Range Rover Evoque', 'Range Rover Velar', 'Range Rover Sport', 'Discovery Sport', 'Discovery', 'Range Rover'],
    porsche: ['Cayenne', 'Macan'],
    'rolls-royce': ['Cullinan'],
    ferrari: ['Purosangue'],
    lamborghini: ['Urus'],
  },
  MUV: {
    'maruti suzuki': ['Ertiga', 'XL6', 'Invicto'],
    mahindra: ['Marazzo'],
    honda: ['BR-V'],
    toyota: ['Innova Crysta', 'Innova Hycross', 'Vellfire'],
    kia: ['Carens', 'Carnival'],
    renault: ['Triber', 'Lodgy'],
    byd: ['eMax 7'],
    nissan: ['Evalia'],
    datsun: ['Go+'],
  },
  COUPE: {
    ford: ['Mustang'],
    bmw: ['Z4'],
    audi: ['RS5'],
    jaguar: ['F-Type'],
    porsche: ['911 Carrera', '718 Cayman'],
    'rolls-royce': ['Wraith'],
    ferrari: ['488 GTB', 'F8 Tributo', 'Roma', '296 GTB', '812 Superfast'],
    lamborghini: ['Huracan', 'Aventador', 'Gallardo', 'Revuelto'],
    bugatti: ['Chiron', 'Veyron', 'Divo', 'Bolide', 'Tourbillon'],
  },
  CONVERTIBLE: {
    porsche: ['718 Boxster'],
    'rolls-royce': ['Dawn'],
    ferrari: ['Portofino', 'California T'],
  },
};

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9+]/g, '');
const makeKey = (make: string) => squash(make === 'Mercedes Benz' ? 'mercedes-benz' : make);
const LOOKUP = new Map<string, BodyTypeCode>();
for (const [body, makes] of Object.entries(BY_BODY) as Array<[BodyTypeCode, Record<string, string[]>]>) {
  for (const [make, models] of Object.entries(makes)) for (const model of models) LOOKUP.set(`${makeKey(make)}|${squash(model)}`, body);
}

/** Body type for a make + model from the catalogue, ignoring case, spacing and punctuation. Null when the car is not catalogued. */
export function inferBodyType(make?: string | null, model?: string | null): BodyTypeCode | null {
  if (!make || !model) return null;
  return LOOKUP.get(`${makeKey(make)}|${squash(model)}`) ?? null;
}

/** What to store: the staff member's choice if it is valid, else the catalogue's answer for the car, else nothing. */
export function resolveBodyType(input: { bodyType?: string | null; make?: string | null; model?: string | null }): BodyTypeCode | null {
  return normalizeBodyType(input.bodyType) ?? inferBodyType(input.make, input.model);
}

/** Every spelling that should match a body-type filter (the code, its name, and the legacy "MPV"). */
export function bodyTypeFilterValues(value: string): string[] {
  const code = normalizeBodyType(value);
  if (!code) return [value];
  const names: Record<BodyTypeCode, string[]> = {
    HATCHBACK: ['Hatchback'], SEDAN: ['Sedan'], SUV: ['SUV'], MUV: ['MUV', 'MPV'], COUPE: ['Coupe'], CONVERTIBLE: ['Convertible'],
  };
  return [code, ...names[code]];
}

/** Every catalogued [make, model, body type] row (used to write the back-fill migration and to check it). */
export function bodyTypeCatalog(): Array<{ make: string; model: string; bodyType: BodyTypeCode }> {
  const rows: Array<{ make: string; model: string; bodyType: BodyTypeCode }> = [];
  for (const [bodyType, makes] of Object.entries(BY_BODY) as Array<[BodyTypeCode, Record<string, string[]>]>) {
    for (const [make, models] of Object.entries(makes)) for (const model of models) rows.push({ make, model, bodyType });
  }
  return rows;
}
