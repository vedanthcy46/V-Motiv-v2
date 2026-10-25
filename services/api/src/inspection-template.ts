export type InspectionFuelType = 'PETROL' | 'DIESEL' | 'CNG' | 'ELECTRIC' | 'HYBRID';

export type InspectionTemplateSection = {
  key: string;
  title: string;
  description: string;
  conditionalFuel?: InspectionFuelType[];
};

export type InspectionTemplateItem = {
  key: string;
  section: string;
  label: string;
  required: boolean;
  applicableFuel?: InspectionFuelType[];
  requiresPhoto?: boolean;
  unit?: string;
  inputType?: 'SELECT' | 'NUMBER' | 'TEXT' | 'BOOLEAN';
  description?: string;
};

export const vehicleStandardTemplate = {
  key: 'vehicle-standard',
  version: 2,
  title: 'V MOTIV Comprehensive Vehicle Inspection Template',
  sections: [
    { key: 'identity', title: '1. Vehicle Identity & Documents', description: 'Cross-reference physical markings with declared seller information and documents.' },
    { key: 'exterior', title: '2. Exterior Panels & Paint', description: 'Systematic panel-by-panel assessment of paint condition, panel gaps, dents, and corrosion.' },
    { key: 'glass_lights', title: '3. Glass, Lamps & Mirrors', description: 'Integrity of windscreens, windows, headlights, taillights, and mirrors.' },
    { key: 'structural', title: '4. Structural & Underbody', description: 'Chassis rails, pillar integrity, underbody corrosion, and flood damage indicators.' },
    { key: 'interior', title: '5. Interior & Cabin', description: 'Condition of seats, roof liner, dashboard, trims, and seatbelts.' },
    { key: 'cabin_systems', title: '6. Cabin Systems & Electrical', description: 'HVAC cooling/heating, infotainment, power windows, wipers, and horn.' },
    { key: 'engine', title: '7. Engine & Powertrain (ICE)', description: 'Cold start, idle quality, fluid leaks, exhaust observations, and mounts.', conditionalFuel: ['PETROL', 'DIESEL', 'CNG', 'HYBRID'] },
    { key: 'transmission', title: '8. Transmission & Drivetrain', description: 'Gear shift action, clutch feel, automatic shift response, and driveshafts.' },
    { key: 'suspension_steering', title: '9. Suspension & Steering', description: 'Shock absorbers, suspension bushings, ride rebound, and steering free play.' },
    { key: 'brakes', title: '10. Braking System', description: 'Pedal firmness, visible pad wear, parking brake hold, and ABS indicators.' },
    { key: 'tyres_wheels', title: '11. Tyres & Wheels', description: 'Tread depth, sidewall cuts/bulges, alloy rim condition, and spare wheel.' },
    { key: 'electrical_safety', title: '12. Electrical & Safety Warnings', description: 'Instrument warning lights, battery condition, alternator charge, and airbags.' },
    { key: 'road_test', title: '13. Road Test Observations', description: 'Dynamic performance, high-speed vibrations, steering pull, and road noise.' },
    { key: 'ev_hybrid', title: '14. EV / Hybrid Systems', description: 'Charge port physical state, charge display, and high-voltage warnings.', conditionalFuel: ['ELECTRIC', 'HYBRID'] },
    { key: 'defects', title: '15. Defect Summary & Evidence', description: 'Itemized defects with severity rating, symptoms, location, and supporting photos.' },
    { key: 'declaration', title: '16. Inspector Declaration', description: 'Truthful confirmation of physical checks conducted.' },
  ] satisfies InspectionTemplateSection[],
  items: [
    // 1. Identity & Documents
    { key: 'identity.registration', section: 'identity', label: 'Registration plate matches declared enquiry', required: true, requiresPhoto: true },
    { key: 'identity.vin', section: 'identity', label: 'VIN / Chassis number physically verified against RC', required: true, requiresPhoto: true },
    { key: 'identity.engine_number', section: 'identity', label: 'Engine number verified where safely accessible', required: false, applicableFuel: ['PETROL', 'DIESEL', 'CNG', 'HYBRID'] },
    { key: 'identity.odometer', section: 'identity', label: 'Odometer reading observed and documented', required: true, requiresPhoto: true, inputType: 'NUMBER', unit: 'km' },
    { key: 'identity.rc_document', section: 'identity', label: 'RC (Registration Certificate) original/copy verified', required: true },
    { key: 'identity.insurance', section: 'identity', label: 'Insurance policy validity verified', required: true },
    { key: 'identity.hypothecation', section: 'identity', label: 'Bank hypothecation / loan declaration verified', required: true },
    { key: 'identity.discrepancy_flag', section: 'identity', label: 'No unexplained identity discrepancies found', required: true },

    // 2. Exterior Panels & Paint
    { key: 'exterior.bonnet', section: 'exterior', label: 'Bonnet paint, alignment, and latch condition', required: true },
    { key: 'exterior.front_bumper', section: 'exterior', label: 'Front bumper fitment, scrapes, and brackets', required: true },
    { key: 'exterior.rear_bumper', section: 'exterior', label: 'Rear bumper fitment and impact observations', required: true },
    { key: 'exterior.roof', section: 'exterior', label: 'Roof panel paint condition, hail/dent check', required: true },
    { key: 'exterior.doors_left', section: 'exterior', label: 'Left front & rear doors paint, alignment & hinges', required: true },
    { key: 'exterior.doors_right', section: 'exterior', label: 'Right front & rear doors paint, alignment & hinges', required: true },
    { key: 'exterior.boot_tailgate', section: 'exterior', label: 'Boot lid / tailgate operation and panel alignment', required: true },
    { key: 'exterior.fenders_quarters', section: 'exterior', label: 'Front fenders and rear quarter panels paint/gaps', required: true },
    { key: 'exterior.repaint_indicators', section: 'exterior', label: 'Signs of aftermarket repaint or panel filler checked', required: true },
    { key: 'exterior.corrosion', section: 'exterior', label: 'Body panel rust / corrosion inspection', required: true },

    // 3. Glass, Lamps & Mirrors
    { key: 'glass_lights.windscreen_front', section: 'glass_lights', label: 'Front windscreen chips, cracks, and wiper wipe area', required: true },
    { key: 'glass_lights.windscreen_rear', section: 'glass_lights', label: 'Rear windscreen and defogger lines intact', required: true },
    { key: 'glass_lights.side_windows', section: 'glass_lights', label: 'Door window glass condition and OEM markings', required: true },
    { key: 'glass_lights.headlights', section: 'glass_lights', label: 'Headlights (low/high beam) clarity and operation', required: true },
    { key: 'glass_lights.taillights', section: 'glass_lights', label: 'Tail lights, brake lights, and reverse lamps', required: true },
    { key: 'glass_lights.indicators', section: 'glass_lights', label: 'Turn indicators and hazard lamp synchronization', required: true },
    { key: 'glass_lights.mirrors', section: 'glass_lights', label: 'Left and right ORVM mirror glass and adjustment', required: true },

    // 4. Structural & Underbody
    { key: 'structural.apron_pillars', section: 'structural', label: 'Front apron, A/B/C pillars factory spot-welds intact', required: true },
    { key: 'structural.chassis_rails', section: 'structural', label: 'Front & rear chassis longitudinal rails deformation check', required: true },
    { key: 'structural.underbody_rust', section: 'structural', label: 'Underbody floor pan rust and corrosion assessment', required: true },
    { key: 'structural.welding_repairs', section: 'structural', label: 'Absence of unauthorized cut-and-weld body repairs', required: true },
    { key: 'structural.flood_indicators', section: 'structural', label: 'Flood immersion check (rust under dash, silt in carpets)', required: true },

    // 5. Interior & Cabin
    { key: 'interior.seats_upholstery', section: 'interior', label: 'Front and rear seats fabric/leather wear and adjustments', required: true },
    { key: 'interior.dashboard_trims', section: 'interior', label: 'Dashboard, console, and door trims fitment and scratches', required: true },
    { key: 'interior.roof_liner', section: 'interior', label: 'Roof headliner cleanliness and sagging check', required: true },
    { key: 'interior.seatbelts', section: 'interior', label: 'All seatbelts retract cleanly and latch securely', required: true },
    { key: 'interior.floor_carpets', section: 'interior', label: 'Carpets, floor mats, and boot space condition', required: true },

    // 6. Cabin Systems & Electrical
    { key: 'cabin_systems.ac_cooling', section: 'cabin_systems', label: 'Air conditioning cooling effectiveness', required: true },
    { key: 'cabin_systems.heater_blower', section: 'cabin_systems', label: 'Cabin heater and blower speeds operation', required: true },
    { key: 'cabin_systems.infotainment', section: 'cabin_systems', label: 'Touchscreen / audio system / Bluetooth connectivity', required: true },
    { key: 'cabin_systems.power_windows', section: 'cabin_systems', label: 'All power windows raise and lower smoothly', required: true },
    { key: 'cabin_systems.central_locking', section: 'cabin_systems', label: 'Central locking and remote key fob operation', required: true },
    { key: 'cabin_systems.wipers_washers', section: 'cabin_systems', label: 'Front and rear wiper blades and washer spray', required: true },
    { key: 'cabin_systems.horn', section: 'cabin_systems', label: 'Horn audibility and steering pad switch operation', required: true },

    // 7. Engine & Powertrain (ICE)
    { key: 'engine.cold_start', section: 'engine', label: 'Engine starting behaviour and cranking duration', required: true, applicableFuel: ['PETROL', 'DIESEL', 'CNG', 'HYBRID'] },
    { key: 'engine.idle_quality', section: 'engine', label: 'Idle RPM stability and engine vibration check', required: true, applicableFuel: ['PETROL', 'DIESEL', 'CNG', 'HYBRID'] },
    { key: 'engine.leaks_oil_coolant', section: 'engine', label: 'Visible oil, coolant, or fuel leaks around head/block', required: true, applicableFuel: ['PETROL', 'DIESEL', 'CNG', 'HYBRID'] },
    { key: 'engine.exhaust_smoke', section: 'engine', label: 'Exhaust smoke observation (white/blue/black smoke)', required: true, applicableFuel: ['PETROL', 'DIESEL', 'CNG', 'HYBRID'] },
    { key: 'engine.abnormal_noise', section: 'engine', label: 'Tappet, belt, timing chain, or bearing abnormal sounds', required: true, applicableFuel: ['PETROL', 'DIESEL', 'CNG', 'HYBRID'] },
    { key: 'engine.cooling_radiator', section: 'engine', label: 'Radiator fin condition, hose firmness, and coolant level', required: true, applicableFuel: ['PETROL', 'DIESEL', 'CNG', 'HYBRID'] },
    { key: 'engine.mounts', section: 'engine', label: 'Engine and gearbox rubber mounts condition', required: true, applicableFuel: ['PETROL', 'DIESEL', 'CNG', 'HYBRID'] },

    // 8. Transmission & Drivetrain
    { key: 'transmission.shift_smoothness', section: 'transmission', label: 'Gear selector engagement and shifting smoothness', required: true },
    { key: 'transmission.clutch_operation', section: 'transmission', label: 'Clutch pedal bite point and slip check (Manual)', required: false, applicableFuel: ['PETROL', 'DIESEL', 'CNG', 'HYBRID'] },
    { key: 'transmission.auto_response', section: 'transmission', label: 'Automatic transmission creep and shift lag check', required: false },
    { key: 'transmission.driveshafts', section: 'transmission', label: 'Driveshaft CV boots torn or grease leakage check', required: true },

    // 9. Suspension & Steering
    { key: 'suspension_steering.shocks_struts', section: 'suspension_steering', label: 'Front and rear shock absorber oil leakage and rebound', required: true },
    { key: 'suspension_steering.bushings_arms', section: 'suspension_steering', label: 'Lower arm bushings and stabilizer links wear', required: true },
    { key: 'suspension_steering.free_play', section: 'suspension_steering', label: 'Steering rack free play and center feel', required: true },
    { key: 'suspension_steering.abnormal_noise', section: 'suspension_steering', label: 'Suspension clunk or squeak on uneven surfaces', required: true },

    // 10. Braking System
    { key: 'brakes.pedal_feel', section: 'brakes', label: 'Brake pedal firmness and stroke reserve', required: true },
    { key: 'brakes.pad_thickness', section: 'brakes', label: 'Visible brake pad friction lining thickness', required: true },
    { key: 'brakes.disc_drums', section: 'brakes', label: 'Brake discs scoring, lip wear, or drum condition', required: true },
    { key: 'brakes.parking_brake', section: 'brakes', label: 'Handbrake / electronic parking brake hold on incline', required: true },

    // 11. Tyres & Wheels
    { key: 'tyres_wheels.front_left', section: 'tyres_wheels', label: 'Front-Left tyre tread depth and sidewall condition', required: true },
    { key: 'tyres_wheels.front_right', section: 'tyres_wheels', label: 'Front-Right tyre tread depth and sidewall condition', required: true },
    { key: 'tyres_wheels.rear_left', section: 'tyres_wheels', label: 'Rear-Left tyre tread depth and sidewall condition', required: true },
    { key: 'tyres_wheels.rear_right', section: 'tyres_wheels', label: 'Rear-Right tyre tread depth and sidewall condition', required: true },
    { key: 'tyres_wheels.spare_wheel', section: 'tyres_wheels', label: 'Spare tyre, jack, and wheel wrench availability', required: true },
    { key: 'tyres_wheels.alloys_rims', section: 'tyres_wheels', label: 'Wheel rims / alloy wheels bends, cracks, or curb rash', required: true },

    // 12. Electrical & Safety Warnings
    { key: 'electrical_safety.battery', section: 'electrical_safety', label: '12V battery physical condition, terminal corrosion', required: true },
    { key: 'electrical_safety.warning_lights', section: 'electrical_safety', label: 'Instrument cluster warning lights (Check Engine, Airbag, ABS)', required: true },
    { key: 'electrical_safety.airbags_indicator', section: 'electrical_safety', label: 'Airbag indicator cycle on ignition key-on', required: true },
    { key: 'electrical_safety.alternator_charge', section: 'electrical_safety', label: 'Battery charge warning light extinguishes upon engine run', required: true },

    // 13. Road Test Observations
    { key: 'road_test.performed', section: 'road_test', label: 'Dynamic road test conducted (or reason documented)', required: true },
    { key: 'road_test.acceleration', section: 'road_test', label: 'Acceleration response under load', required: false },
    { key: 'road_test.braking_stability', section: 'road_test', label: 'Braking straight-line stability without pulling', required: false },
    { key: 'road_test.vibrations', section: 'road_test', label: 'Absence of high-speed steering wobble or cabin shudder', required: false },

    // 14. EV / Hybrid Systems
    { key: 'ev_hybrid.charging_port', section: 'ev_hybrid', label: 'EV/Hybrid charge port pin condition and locking flap', required: true, applicableFuel: ['ELECTRIC', 'HYBRID'] },
    { key: 'ev_hybrid.cable_accessories', section: 'ev_hybrid', label: 'Portable charging cable and adapter supplied', required: true, applicableFuel: ['ELECTRIC', 'HYBRID'] },
    { key: 'ev_hybrid.cluster_soc', section: 'ev_hybrid', label: 'State-of-charge (SoC) % and estimated range displayed', required: true, applicableFuel: ['ELECTRIC', 'HYBRID'] },
    { key: 'ev_hybrid.hv_warning_lights', section: 'ev_hybrid', label: 'Absence of high-voltage / electrical drive malfunction indicators', required: true, applicableFuel: ['ELECTRIC', 'HYBRID'] },

    // 15. Defects & Material Findings
    { key: 'defects.recorded', section: 'defects', label: 'All material defects, damages, or discrepancies recorded', required: true },

    // 16. Final Declaration
    { key: 'declaration.inspector_confirmed', section: 'declaration', label: 'Inspector confirms physical inspection performed truthfully according to standard', required: true },
  ] satisfies InspectionTemplateItem[],
} as const;

// Backward compatibility with version 1 if needed
export const legacyStandardTemplate = {
  key: 'vehicle-standard',
  version: 1,
  title: 'V MOTIV Standard Vehicle Inspection (Legacy)',
  sections: [
    { key: 'identity', title: 'Vehicle identity and documents', description: 'Legacy identity' },
    { key: 'exterior', title: 'Exterior and structure', description: 'Legacy exterior' },
    { key: 'interior', title: 'Interior and electrical', description: 'Legacy interior' },
    { key: 'safety', title: 'Safety and roadworthiness', description: 'Legacy safety' },
    { key: 'powertrain', title: 'Engine / powertrain', description: 'Legacy powertrain' },
    { key: 'ev', title: 'EV / hybrid system', description: 'Legacy ev' },
  ],
  items: vehicleStandardTemplate.items.slice(0, 15),
};

export function templateFor(key: string, version: number) {
  if (key === vehicleStandardTemplate.key) {
    if (version === 2 || version === undefined) return vehicleStandardTemplate;
    if (version === 1) return legacyStandardTemplate;
  }
  return undefined;
}

export function currentTemplate() {
  return vehicleStandardTemplate;
}

export function knownTemplateItem(key: string, version: number, itemKey: string) {
  const t = templateFor(key, version);
  return Boolean(t?.items.some(item => item.key === itemKey));
}

export function isItemApplicable(item: InspectionTemplateItem, fuelType?: string | null): boolean {
  if (!item.applicableFuel || !fuelType) return true;
  const normalized = fuelType.toUpperCase() as InspectionFuelType;
  return item.applicableFuel.includes(normalized);
}
