import {
  PrismaClient,
  type CustomerVehicle,
  type ServiceHub,
  type ServiceIssueTemplate,
  type ServiceRequest,
  type ServiceCustodyRecord,
  type ServiceDiagnosis,
  type ServiceEstimate,
  type ServiceEstimateItem,
  type ServiceWorkOrder,
  type ServiceQCRecord,
  type ServicePaymentRecord,
  type ServiceHistoryEvent,
  type ServiceInvoice,
  type ServicePaymentPolicy,
  ServiceRequestStatus,
  ServiceFulfillmentType,
  ServiceEstimateStatus,
  ServiceWorkOrderStatus,
  ServiceQCResult,
  ServicePaymentStatus,
  Prisma,
} from '@prisma/client';
import { currentCalendarYear } from './calendar.js';
import crypto from 'node:crypto';
import { HttpError } from './errors.js';
import { assertGatewayPaymentSignature } from './payment-signature.js';
import { calculateEstimateTotals, formatApprovedScope } from './estimate-totals.js';
import { assertCapturedAmount } from './razorpay-gateway.js';
import type { Identity } from './auth.js';
import type { NotificationService } from './notification/index.js';

export function safeParseJson<T = any>(val: any, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val as T;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'string') {
        try {
          return JSON.parse(parsed) as T;
        } catch {
          return parsed as unknown as T;
        }
      }
      return parsed as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export interface CreateVehicleInput {
  make: string;
  model: string;
  year: number;
  variant?: string | null;
  fuelType: string;
  transmission: string;
  color?: string | null;
  registrationNumber?: string | null;
  odometerKm?: number | null;
  vin?: string | null;
  declaredOwnership?: string | null;
  photoUrls?: string[] | null;
  notes?: string | null;
  isPreferred?: boolean | null;
}

export interface UpdateVehicleInput {
  variant?: string | null;
  color?: string | null;
  registrationNumber?: string | null;
  odometerKm?: number | null;
  vin?: string | null;
  declaredOwnership?: string | null;
  photoUrls?: string[] | null;
  notes?: string | null;
  isPreferred?: boolean | null;
  lastServiceDate?: string | null;
  nextServiceDueKm?: number | null;
  nextServiceDueDate?: string | null;
}

export interface CreateServiceRequestInput {
  vehicleId: string;
  hubId: string;
  categoryKey: string;
  customerSymptoms: string;
  questionAnswers: Record<string, unknown>;
  mediaUrls?: string[];
  fulfillmentType: ServiceFulfillmentType;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTimeSlot: string; // e.g. "09:00-11:00"
  pickupAddress?: {
    line1: string;
    line2?: string;
    city: string;
    pincode: string;
    instructions?: string;
  };
  returnAddress?: {
    line1: string;
    line2?: string;
    city: string;
    pincode: string;
    instructions?: string;
  };
  paymentPlanId?: 'ZERO_UPFRONT' | 'ADVANCE_25' | 'FULL_100' | 'DIAGNOSTIC_FEE';
  paymentGateway?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewaySignature?: string;
}

export interface CustodyInput {
  type: 'CHECK_IN' | 'CHECK_OUT';
  odometerKm: number;
  fuelChargeLevel: string;
  keyCount?: number;
  accessories?: Record<string, boolean | string>;
  preExistingDamageNotes?: string;
  damagePhotoUrls?: string[];
  handoverByPerson: string;
  customerAcknowledged?: boolean;
  customerSignatureUrl?: string;
  discrepancyNotes?: string;
}

export interface DiagnosisInput {
  diagnosticSummary: string;
  detailedFindings: string;
  recommendedAction: string;
  photosAndScans?: string[];
  diagnosticFeePaise?: number | bigint;
  isRoadTestNeeded?: boolean;
}

export interface EstimateItemInput {
  category: 'PARTS' | 'LABOUR' | 'CONSUMABLES' | 'DIAGNOSTICS' | 'LOGISTICS';
  description: string;
  partNumber?: string;
  quantity?: number;
  unitPricePaise: number | bigint;
  isMandatory?: boolean;
}

export interface EstimateInput {
  items: EstimateItemInput[];
  pickupDropFeePaise?: number | bigint;
  diagnosticFeePaise?: number | bigint;
  discountPaise?: number | bigint;
  customerNotes?: string;
  internalNotes?: string;
  validDays?: number;
}

export interface WorkOrderInput {
  instructions: string;
  assignedTechnicianId?: string;
}

export interface QCInput {
  result: ServiceQCResult;
  checklistResults: Record<string, boolean | string>;
  reworkReason?: string;
  notes?: string;
}

export const DEFAULT_SERVICE_CATEGORIES: Array<{
  categoryKey: string;
  title: string;
  description: string;
  icon: string;
  fixedPackageAvailable: boolean;
  packagePricePaise?: bigint;
  pricingType?: string;
  diagnosticFeePaise?: bigint;
  packageFeatures?: string[];
  questions: Array<{
    stableId: string;
    label: string;
    explanation?: string;
    responseType: 'SINGLE_SELECT' | 'MULTI_SELECT' | 'TEXT' | 'NUMBER' | 'BOOLEAN';
    options?: string[];
    required: boolean;
    isSafetyCritical?: boolean;
  }>;
}> = [
  {
    categoryKey: 'REGULAR_SERVICE',
    title: 'Regular Maintenance Service',
    description: 'Scheduled periodic servicing to keep your car running smooth, reliable and fuel-efficient.',
    icon: 'wrench',
    fixedPackageAvailable: true,
    packagePricePaise: 499900n,
    packageFeatures: [
      'Engine Oil Replacement (Synthetic Grade)',
      'Oil Filter Replacement (OEM Genuine)',
      'Air Filter & Cabin AC Filter Clean / Inspect',
      '40-Point Comprehensive Vehicle Health Check',
      'Brake Pad, Disc & Fluid Inspection',
      'Coolant, Windshield Washer & Battery Fluid Top-up',
      'Wheel Alignment & Balancing Check',
      'Complete Exterior Foam Wash & Interior Vacuuming',
    ],
    questions: [
      {
        stableId: 'q_last_service',
        label: 'When was your vehicle last serviced?',
        responseType: 'SINGLE_SELECT',
        options: ['Less than 6 months ago', '6 - 12 months ago', 'Over 1 year ago', 'First service / Not sure'],
        required: true,
      },
      {
        stableId: 'q_current_odo',
        label: 'Approximate current odometer reading (km)?',
        explanation: 'Helps us determine factory service intervals and schedule recommended maintenance.',
        responseType: 'NUMBER',
        required: true,
      },
      {
        stableId: 'q_oil_preference',
        label: 'Engine oil grade preference',
        responseType: 'SINGLE_SELECT',
        options: ['Standard Synthetic 5W-30', 'Fully Synthetic 0W-20 Long-Life', 'OEM Factory Spec', 'No preference'],
        required: false,
      },
      {
        stableId: 'q_additional_concerns',
        label: 'Any specific areas you would like our technician to look at?',
        responseType: 'TEXT',
        required: false,
      },
    ],
  },
  {
    categoryKey: 'AC_SERVICE',
    title: 'AC Service & Cooling Issue',
    description: 'Complete climate control diagnostic, refrigerant gas refill, filter replacement and odor sanitization.',
    icon: 'wind',
    fixedPackageAvailable: true,
    packagePricePaise: 249900n,
    packageFeatures: [
      'Refrigerant (Gas) Pressure Measurement & Top-Up',
      'AC Compressor, Belt & Condenser Coil Inspection',
      'Cabin Micro-Air Filter Clean / Replace',
      'Cooling Coil Anti-Bacterial Sanitization Treatment',
      'Dashboard Vent Airflow Speed & Temperature Verification',
    ],
    questions: [
      {
        stableId: 'q_ac_airflow',
        label: 'How is the air blowing out of the dashboard vents?',
        responseType: 'SINGLE_SELECT',
        options: ['Normal strong airflow', 'Very weak airflow even on max speed', 'No air blowing at all (blower silent)'],
        required: true,
      },
      {
        stableId: 'q_ac_cooling',
        label: 'How cold does the air feel?',
        responseType: 'SINGLE_SELECT',
        options: ['Completely warm / room temperature', 'Slightly cool but takes 20+ mins', 'Cool only when driving fast', 'Cools intermittently / cuts off'],
        required: true,
      },
      {
        stableId: 'q_ac_noise_smell',
        label: 'Do you notice any noise or foul smell when the AC is turned on?',
        responseType: 'SINGLE_SELECT',
        options: ['Musty / foul damp smell', 'Hissing or high-pitched squeak', 'Rattling or grinding noise', 'No unusual smell or sound'],
        required: false,
      },
    ],
  },
  {
    categoryKey: 'BATTERY_STARTING',
    title: 'Battery & Starting Trouble',
    description: 'Jump-start assistance, battery load test, starter motor check and charging system diagnosis.',
    icon: 'zap',
    fixedPackageAvailable: false,
    questions: [
      {
        stableId: 'q_dash_lights',
        label: 'Does the dashboard turn on when you insert the key or press start?',
        responseType: 'SINGLE_SELECT',
        options: ['Yes, normal cluster lights', 'Flickering or very dim lights', 'Completely dark / dead'],
        required: true,
      },
      {
        stableId: 'q_starting_sound',
        label: 'What sound occurs when you attempt to start the engine?',
        responseType: 'SINGLE_SELECT',
        options: ['Rapid clicking sound', 'Single click and nothing', 'Engine cranks sluggishly but won’t ignite', 'Complete silence'],
        required: true,
      },
      {
        stableId: 'q_last_started',
        label: 'When did the car last start and drive normally?',
        responseType: 'SINGLE_SELECT',
        options: ['Earlier today', 'Yesterday / 1-2 days ago', 'About a week ago', 'Parked unused for over 3 weeks'],
        required: true,
      },
      {
        stableId: 'q_battery_warning',
        label: 'Is the red battery/alternator light illuminated while driving?',
        responseType: 'BOOLEAN',
        required: false,
      },
    ],
  },
  {
    categoryKey: 'BRAKE_ISSUE',
    title: 'Brakes & Stopping System',
    description: 'Brake pads, rotors, drums, calipers, ABS sensors and hydraulic fluid inspection.',
    icon: 'disc',
    fixedPackageAvailable: false,
    questions: [
      {
        stableId: 'q_brake_feel',
        label: 'How does the brake pedal feel when pressed?',
        responseType: 'SINGLE_SELECT',
        options: ['Normal pedal resistance', 'Soft / spongy / sinks to the floor', 'Extremely hard / stiff', 'Vibrates / pulses under foot'],
        required: true,
      },
      {
        stableId: 'q_brake_sound',
        label: 'Do you hear any sounds during braking?',
        responseType: 'SINGLE_SELECT',
        options: ['High-pitched squealing or chirping', 'Harsh metal-on-metal grinding', 'Thumping / knocking sound', 'No unusual sound'],
        required: true,
      },
      {
        stableId: 'q_brake_warning',
        label: 'Are any brake or ABS warning symbols illuminated?',
        responseType: 'BOOLEAN',
        required: true,
      },
      {
        stableId: 'q_brake_safe',
        label: 'Is the vehicle safe to drive right now?',
        explanation: 'If braking power is compromised, we strongly advise flatbed towing rather than road driving.',
        responseType: 'SINGLE_SELECT',
        options: ['Yes, drives and stops safely for short trips', 'Uncertain / feels sluggish', 'NO - Brakes feel dangerous / do not drive'],
        required: true,
        isSafetyCritical: true,
      },
    ],
  },
  {
    categoryKey: 'TYRES_WHEELS',
    title: 'Tyres, Wheels & Alignment',
    description: 'Laser wheel alignment, computer wheel balancing, tyre rotation, puncture repair and rim repair.',
    icon: 'circle-dot',
    fixedPackageAvailable: true,
    packagePricePaise: 149900n,
    packageFeatures: [
      'Computerized 4-Wheel Laser Alignment',
      'Dynamic Wheel Balancing (4 Wheels with weights)',
      'Tread Depth & Wear Pattern Analysis',
      'Tyre Pressure Optimization & Nitrogen Fill',
      'Tyre Rotation according to OEM pattern',
    ],
    questions: [
      {
        stableId: 'q_tyre_issue_type',
        label: 'What tyre or wheel symptom are you experiencing?',
        responseType: 'MULTI_SELECT',
        options: [
          'Vehicle pulls to left or right',
          'Steering wheel vibrates at 70-100 km/h',
          'Uneven tyre tread wear',
          'Frequent pressure loss / slow puncture',
          'Visible tyre bulge, crack or rim bend',
        ],
        required: true,
      },
      {
        stableId: 'q_tyre_count',
        label: 'Which wheels seem affected?',
        responseType: 'SINGLE_SELECT',
        options: ['Front wheels only', 'Rear wheels only', 'All 4 wheels', 'One specific tyre'],
        required: true,
      },
    ],
  },
  {
    categoryKey: 'NOISE_VIBRATION',
    title: 'Noise, Rattle & Vibration',
    description: 'Suspension bushings, shock absorbers, ball joints, wheel bearings and engine mount diagnosis.',
    icon: 'activity',
    fixedPackageAvailable: false,
    questions: [
      {
        stableId: 'q_noise_type',
        label: 'Describe the noise or vibration:',
        responseType: 'SINGLE_SELECT',
        options: [
          'Thudding / clunking over speed bumps',
          'Humming / roaring sound that gets louder with speed',
          'High whining / whirring sound linked to engine RPM',
          'Interior dashboard or door rattle',
          'Creaking sound when turning steering wheel',
        ],
        required: true,
      },
      {
        stableId: 'q_noise_when',
        label: 'When does the noise most clearly occur?',
        responseType: 'SINGLE_SELECT',
        options: [
          'While idling at a stoplight',
          'During acceleration',
          'At highway cruising speeds (60+ km/h)',
          'When turning or parking',
          'Only when traversing rough surfaces',
        ],
        required: true,
      },
      {
        stableId: 'q_noise_location',
        label: 'Where does the sound seem to originate from?',
        responseType: 'SINGLE_SELECT',
        options: ['Front suspension / engine bay', 'Underbody / passenger floor', 'Rear axle / luggage trunk', 'Driver wheel area', 'Hard to pinpoint'],
        required: false,
      },
    ],
  },
  {
    categoryKey: 'ENGINE_OVERHEATING',
    title: 'Engine Warning & Overheating',
    description: 'OBD-II scanner diagnostics, radiator leaks, thermostat, water pump and cooling fan assessment.',
    icon: 'alert-triangle',
    fixedPackageAvailable: false,
    questions: [
      {
        stableId: 'q_temp_gauge',
        label: 'Is the engine temperature gauge unusually high or warning light active?',
        responseType: 'SINGLE_SELECT',
        options: [
          'Red temperature warning light ON',
          'Gauge in the red / high zone',
          'Steam or smoke visible from the bonnet',
          'Gauge is normal, but Check Engine light is on',
        ],
        required: true,
        isSafetyCritical: true,
      },
      {
        stableId: 'q_engine_light',
        label: 'Is the Check Engine light flashing or solid?',
        explanation: 'A flashing check engine light indicates an active misfire that can damage the catalytic converter.',
        responseType: 'SINGLE_SELECT',
        options: ['Flashing repeatedly (CRITICAL)', 'Solid ON constantly', 'Comes on intermittently', 'Not illuminated'],
        required: true,
        isSafetyCritical: true,
      },
      {
        stableId: 'q_engine_running',
        label: 'How is the car driving currently?',
        responseType: 'SINGLE_SELECT',
        options: ['Severe power loss / car won’t accelerate (limp mode)', 'Jerking / rough engine idle', 'Drives normally with warning light', 'Engine shuts off unexpectedly'],
        required: true,
      },
    ],
  },
  {
    categoryKey: 'ELECTRICAL_ISSUE',
    title: 'Electrical, Lights & Electronics',
    description: 'Headlights, horn, power windows, central locking, wiper motors, alternator and wiring harness repair.',
    icon: 'cpu',
    fixedPackageAvailable: false,
    questions: [
      {
        stableId: 'q_electrical_component',
        label: 'Which electrical components are malfunctioning?',
        responseType: 'MULTI_SELECT',
        options: [
          'Headlights, taillights or indicators',
          'Power windows or mirror controls',
          'Central locking or keyless entry',
          'Infotainment screen, audio or reverse camera',
          'Horn, windshield wipers or washer pump',
          'AC blower fan or cabin illumination',
        ],
        required: true,
      },
      {
        stableId: 'q_electrical_onset',
        label: 'When did this issue first emerge?',
        responseType: 'SINGLE_SELECT',
        options: ['Suddenly after heavy rain or water wash', 'Immediately after a jump-start or battery change', 'Gradually got worse', 'Right after installing an aftermarket accessory'],
        required: false,
      },
    ],
  },
  {
    categoryKey: 'BODY_PAINT',
    title: 'Bodywork, Denting & Paint',
    description: 'Precision dent removal, panel repaint, scratch buffing, bumper restoration and insurance cashless claims.',
    icon: 'shield',
    fixedPackageAvailable: false,
    questions: [
      {
        stableId: 'q_body_panels',
        label: 'Which body panels require attention?',
        responseType: 'MULTI_SELECT',
        options: ['Front Bumper', 'Rear Bumper', 'Bonnet / Hood', 'Doors (Left or Right)', 'Fenders / Quarter Panels', 'Boot Lid / Tailgate', 'Roof'],
        required: true,
      },
      {
        stableId: 'q_body_damage_type',
        label: 'What type of damage is present?',
        responseType: 'SINGLE_SELECT',
        options: ['Minor surface scuff / scratch (paint intact)', 'Dent without paint damage (PDR candidate)', 'Deep scratch down to primer or metal', 'Cracked bumper or crumpled panel'],
        required: true,
      },
      {
        stableId: 'q_insurance_claim',
        label: 'Would you like to explore an insurance claim?',
        responseType: 'SINGLE_SELECT',
        options: ['Yes, cashless insurance claim preferred', 'No, private out-of-pocket payment', 'Need advisor estimate first before deciding'],
        required: true,
      },
    ],
  },
  {
    categoryKey: 'OTHER_PROBLEM',
    title: 'Other Issue / General Diagnostics',
    description: 'Not sure what’s wrong? Describe the issue and our senior technician will run a complete diagnostic.',
    icon: 'help-circle',
    fixedPackageAvailable: false,
    questions: [
      {
        stableId: 'q_other_description',
        label: 'Please describe the issue or work needed in your own words:',
        explanation: 'Be as detailed as you like — symptoms, when it occurs, and any recent repairs.',
        responseType: 'TEXT',
        required: true,
      },
      {
        stableId: 'q_other_drivable',
        label: 'Is the vehicle currently drivable safely?',
        responseType: 'SINGLE_SELECT',
        options: ['Yes, drives fine without immediate hazard', 'Drivable with caution for short distance', 'NO - Vehicle is not drivable / requires towing'],
        required: true,
        isSafetyCritical: true,
      },
    ],
  },
];

export const DEFAULT_SERVICE_HUBS = [
  {
    code: 'HUB-CHN-01',
    name: 'V MOTIV Central Service Hub — Chennai',
    city: 'Chennai',
    address: 'Plot 42, Guindy Industrial Estate, Guindy, Chennai, Tamil Nadu 600032',
    latitude: 13.0067,
    longitude: 80.2023,
    operatingHours: '08:00 - 19:30 Mon-Sat',
    phone: '+91 44 2250 8800',
    capacityPerSlot: 6,
    pickupRadiusKm: 30.0,
    pickupFeePaise: 49900n,
    diagnosticFeePaise: 79900n,
  },
  {
    code: 'HUB-BLR-01',
    name: 'V MOTIV Tech Service Hub — Bengaluru',
    city: 'Bengaluru',
    address: 'Survey 112/1, Outer Ring Road, Bellandur, Bengaluru, Karnataka 560103',
    latitude: 12.9260,
    longitude: 77.6762,
    operatingHours: '08:00 - 20:00 Mon-Sat',
    phone: '+91 80 4455 9900',
    capacityPerSlot: 6,
    pickupRadiusKm: 35.0,
    pickupFeePaise: 49900n,
    diagnosticFeePaise: 79900n,
  },
  {
    code: 'HUB-HYD-01',
    name: 'V MOTIV Premium Hub — Hyderabad',
    city: 'Hyderabad',
    address: 'Road No. 36, Jubilee Hills, Hyderabad, Telangana 500033',
    latitude: 17.4319,
    longitude: 78.4073,
    operatingHours: '08:30 - 19:30 Mon-Sat',
    phone: '+91 40 3322 1100',
    capacityPerSlot: 5,
    pickupRadiusKm: 30.0,
    pickupFeePaise: 49900n,
    diagnosticFeePaise: 79900n,
  },
  {
    code: 'HUB-COI-01',
    name: 'V MOTIV City Hub — Coimbatore',
    city: 'Coimbatore',
    address: 'Avinashi Road, Near Hope College, Peelamedu, Coimbatore, Tamil Nadu 641004',
    latitude: 11.0284,
    longitude: 77.0084,
    operatingHours: '08:30 - 19:00 Mon-Sat',
    phone: '+91 422 257 6600',
    capacityPerSlot: 4,
    pickupRadiusKm: 25.0,
    pickupFeePaise: 39900n,
    diagnosticFeePaise: 69900n,
  },
];

function safeParsePhotoUrls(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(x => String(x)).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(x => String(x)).filter(Boolean);
      if (typeof parsed === 'string' && parsed.trim()) return [parsed.trim()];
    } catch {
      if (raw.trim()) return [raw.trim()];
    }
  }
  return [];
}

function formatCustomerVehicleRecord(v: any, activeServiceRequest?: any) {
  return {
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    variant: v.variant ?? undefined,
    fuelType: v.fuelType,
    transmission: v.transmission,
    color: v.color ?? undefined,
    registrationNumber: v.registrationNumber ?? undefined,
    odometerKm: v.odometerKm ?? undefined,
    vin: v.vin ?? undefined,
    declaredOwnership: v.declaredOwnership || 'OWNER',
    photoUrls: safeParsePhotoUrls(v.photoUrls),
    notes: v.notes ?? undefined,
    isPreferred: Boolean(v.isPreferred),
    isArchived: Boolean(v.isArchived),
    lastServiceDate: v.lastServiceDate ? (v.lastServiceDate instanceof Date ? v.lastServiceDate.toISOString() : String(v.lastServiceDate)) : null,
    nextServiceDueKm: v.nextServiceDueKm ?? null,
    nextServiceDueDate: v.nextServiceDueDate ? (v.nextServiceDueDate instanceof Date ? v.nextServiceDueDate.toISOString() : String(v.nextServiceDueDate)) : null,
    connectDeviceId: v.connectDeviceId || null,
    connectStatus: v.connectStatus || 'NOT_CONNECTED',
    activeServiceRequest: activeServiceRequest ?? null,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
    updatedAt: v.updatedAt instanceof Date ? v.updatedAt.toISOString() : String(v.updatedAt),
  };
}

export function parseFeaturesAndHubPricing(raw: any): {
  features: string[];
  hubPricing: Record<string, { packagePricePaise?: string; diagnosticFeePaise?: string; fixedPackageAvailable?: boolean }>;
} {
  const parsed = safeParseJson<any>(raw, null);
  if (!parsed) {
    return { features: [], hubPricing: {} };
  }
  if (Array.isArray(parsed)) {
    return { features: parsed.filter((item: any) => typeof item === 'string'), hubPricing: {} };
  }
  if (typeof parsed === 'object') {
    const features = Array.isArray(parsed.features) ? parsed.features.filter((item: any) => typeof item === 'string') : [];
    const hubPricing = (parsed.hubPricing && typeof parsed.hubPricing === 'object') ? parsed.hubPricing : {};
    return { features, hubPricing };
  }
  return { features: [], hubPricing: {} };
}

export function resolveEffectiveCategoryPricing(
  item: {
    packagePricePaise: bigint | null;
    diagnosticFeePaise: bigint;
    fixedPackageAvailable: boolean;
    packageFeatures: any;
  },
  hubId?: string
) {
  const { features, hubPricing } = parseFeaturesAndHubPricing(item.packageFeatures);

  let effectivePackagePricePaise = item.packagePricePaise;
  let effectiveDiagnosticFeePaise = item.diagnosticFeePaise ?? 50000n;
  let effectiveFixedAvailable = item.fixedPackageAvailable;

  if (hubId && hubPricing[hubId]) {
    const override = hubPricing[hubId];
    if (override.packagePricePaise !== undefined && override.packagePricePaise !== null) {
      effectivePackagePricePaise = BigInt(override.packagePricePaise);
    }
    if (override.diagnosticFeePaise !== undefined && override.diagnosticFeePaise !== null) {
      effectiveDiagnosticFeePaise = BigInt(override.diagnosticFeePaise);
    }
    if (override.fixedPackageAvailable !== undefined) {
      effectiveFixedAvailable = override.fixedPackageAvailable;
    }
  }

  return {
    packagePricePaise: effectivePackagePricePaise,
    diagnosticFeePaise: effectiveDiagnosticFeePaise,
    fixedPackageAvailable: effectiveFixedAvailable,
    packageFeatures: features,
    hubPricing,
  };
}

/** Request states in which estimate actions are meaningless (job ended or already billed/returned). */
export const ESTIMATE_LOCKED_STATUSES: ServiceRequestStatus[] = [
  ServiceRequestStatus.CANCELLED,
  ServiceRequestStatus.COMPLETED,
  ServiceRequestStatus.PAID,
  ServiceRequestStatus.RETURN_DISPATCHED,
  ServiceRequestStatus.READY_FOR_COLLECTION,
];

export const ESTIMATE_DECLINE_REASONS = ['TOO_EXPENSIVE', 'WANT_SECOND_OPINION', 'NOT_NEEDED_NOW', 'OTHER'] as const;

export class PrismaServiceStore {
  private seedPromise: Promise<void> | null = null;
  private isSeeded = false;
  constructor(
    private readonly db: PrismaClient,
    private readonly notifications?: NotificationService
  ) {}

  // -------------------------------------------------------------
  // SEED & METADATA
  // -------------------------------------------------------------
  async ensureSeedData(): Promise<void> {
    if (this.isSeeded) return;
    if (this.seedPromise) return this.seedPromise;

    this.seedPromise = (async () => {
      try {
        const [templateCount, hubCount] = await Promise.all([
          this.db.serviceIssueTemplate.count({ where: { isActive: true } }),
          this.db.serviceHub.count({ where: { isActive: true } }),
        ]);

        if (templateCount >= DEFAULT_SERVICE_CATEGORIES.length && hubCount >= DEFAULT_SERVICE_HUBS.length) {
          this.isSeeded = true;
          return;
        }

        // 1. Seed Templates
        for (const cat of DEFAULT_SERVICE_CATEGORIES) {
          try {
            await this.db.serviceIssueTemplate.upsert({
              where: { categoryKey: cat.categoryKey },
              update: {
                title: cat.title,
                description: cat.description,
                icon: cat.icon,
                isActive: true,
              },
              create: {
                categoryKey: cat.categoryKey,
                version: 1,
                title: cat.title,
                description: cat.description,
                icon: cat.icon,
                fixedPackageAvailable: cat.fixedPackageAvailable,
                packagePricePaise: cat.packagePricePaise ?? null,
                packageFeatures: cat.packageFeatures ? JSON.stringify(cat.packageFeatures) : Prisma.JsonNull,
                questionsJson: JSON.stringify(cat.questions),
                isActive: true,
              },
            });
          } catch (err: any) {
            if (err?.code !== 'P2002') throw err;
          }
        }

        // 2. Seed Hubs
        for (const hub of DEFAULT_SERVICE_HUBS) {
          try {
            const existingBranch = await this.db.branch.findFirst({
              where: { city: { equals: hub.city, mode: 'insensitive' } },
            });
            await this.db.serviceHub.upsert({
              where: { code: hub.code },
              update: {
                name: hub.name,
                city: hub.city,
                address: hub.address,
                latitude: hub.latitude,
                longitude: hub.longitude,
                operatingHours: hub.operatingHours,
                phone: hub.phone,
                capacityPerSlot: hub.capacityPerSlot,
                pickupRadiusKm: hub.pickupRadiusKm,
                pickupFeePaise: hub.pickupFeePaise,
                diagnosticFeePaise: hub.diagnosticFeePaise,
                branchId: existingBranch?.id ?? null,
                isActive: true,
              },
              create: {
                code: hub.code,
                name: hub.name,
                city: hub.city,
                address: hub.address,
                latitude: hub.latitude,
                longitude: hub.longitude,
                operatingHours: hub.operatingHours,
                phone: hub.phone,
                capacityPerSlot: hub.capacityPerSlot,
                pickupRadiusKm: hub.pickupRadiusKm,
                pickupFeePaise: hub.pickupFeePaise,
                diagnosticFeePaise: hub.diagnosticFeePaise,
                branchId: existingBranch?.id ?? null,
                isActive: true,
              },
            });
          } catch (err: any) {
            if (err?.code !== 'P2002') throw err;
          }
        }

        // 3. Seed Service Payment Policy
        const policy = await this.db.servicePaymentPolicy.findUnique({
          where: { version: 'VMS-POL-2026.1' },
        });
        if (!policy) {
          await this.db.servicePaymentPolicy.create({
            data: {
              version: 'VMS-POL-2026.1',
              name: 'V MOTIV Standard Service Payment Policy',
              description: 'Configurable booking payment options including zero upfront, partial advance, diagnostic fee and 100% full payment.',
              isActive: true,
              isApproved: true,
              allowZeroAdvance: true,
              allowPartialAdvance: true,
              defaultPartialAdvancePercent: 25,
              diagnosticFeePaise: 50000n,
              diagnosticFeeCreditedToInvoice: true,
              partsAdvancePercent: 50,
              partialPlans: [
                { id: 'ADVANCE_25', percentage: 25, label: '25% Package Advance' },
                { id: 'ADVANCE_50', percentage: 50, label: '50% Package Advance' },
              ],
            },
          });
        }

        this.isSeeded = true;
      } finally {
        this.seedPromise = null;
      }
    })();

    return this.seedPromise;
  }

  async ensurePaymentPolicy(): Promise<ServicePaymentPolicy> {
    await this.ensureSeedData();
    const policy = await this.db.servicePaymentPolicy.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (policy) return policy;

    return this.db.servicePaymentPolicy.create({
      data: {
        version: 'VMS-POL-2026.1',
        name: 'V MOTIV Standard Service Payment Policy',
        description: 'Default tiered service payment policy',
        isActive: true,
        isApproved: true,
        allowZeroAdvance: true,
        allowPartialAdvance: true,
        defaultPartialAdvancePercent: 25,
        diagnosticFeePaise: 50000n,
        diagnosticFeeCreditedToInvoice: true,
        partsAdvancePercent: 50,
        partialPlans: [
          { id: 'ADVANCE_25', percentage: 25, label: '25% Package Advance' },
          { id: 'ADVANCE_50', percentage: 50, label: '50% Package Advance' },
        ],
      },
    });
  }

  async getIssueCategories(hubId?: string) {
    await this.ensureSeedData();
    const list = await this.db.serviceIssueTemplate.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return list.map(item => {
      const resolved = resolveEffectiveCategoryPricing(item, hubId);
      return {
        categoryKey: item.categoryKey,
        version: item.version,
        title: item.title,
        description: item.description,
        icon: item.icon,
        fixedPackageAvailable: resolved.fixedPackageAvailable,
        packagePricePaise: resolved.packagePricePaise ? resolved.packagePricePaise.toString() : null,
        pricingType: item.pricingType || (resolved.fixedPackageAvailable ? 'FIXED' : 'QUOTE_REQUIRED'),
        diagnosticFeePaise: resolved.diagnosticFeePaise.toString(),
        packageFeatures: resolved.packageFeatures,
        hubPricing: resolved.hubPricing,
      };
    });
  }

  async getIssueTemplate(categoryKey: string, hubId?: string) {
    await this.ensureSeedData();
    const item = await this.db.serviceIssueTemplate.findUnique({
      where: { categoryKey },
    });
    if (!item || !item.isActive) {
      throw new HttpError(404, 'CATEGORY_NOT_FOUND');
    }
    const resolved = resolveEffectiveCategoryPricing(item, hubId);
    return {
      categoryKey: item.categoryKey,
      version: item.version,
      title: item.title,
      description: item.description,
      icon: item.icon,
      fixedPackageAvailable: resolved.fixedPackageAvailable,
      packagePricePaise: resolved.packagePricePaise ? resolved.packagePricePaise.toString() : null,
      pricingType: item.pricingType || (resolved.fixedPackageAvailable ? 'FIXED' : 'QUOTE_REQUIRED'),
      diagnosticFeePaise: resolved.diagnosticFeePaise.toString(),
      packageFeatures: resolved.packageFeatures,
      hubPricing: resolved.hubPricing,
      questions: safeParseJson(item.questionsJson, []),
    };
  }

  async updateCategoryPricing(
    actorId: string,
    categoryKey: string,
    input: {
      hubId?: string;
      title?: string;
      description?: string;
      fixedPackageAvailable?: boolean;
      packagePriceRupees?: number | null;
      packagePricePaise?: bigint | number | null;
      pricingType?: string;
      diagnosticFeeRupees?: number;
      diagnosticFeePaise?: bigint | number;
      packageFeatures?: string[];
      isActive?: boolean;
    }
  ) {
    await this.ensureSeedData();
    const existing = await this.db.serviceIssueTemplate.findUnique({ where: { categoryKey } });
    if (!existing) throw new HttpError(404, 'CATEGORY_NOT_FOUND');

    const { features: existingFeatures, hubPricing } = parseFeaturesAndHubPricing(existing.packageFeatures);

    // Resolve target package price in Paise from rupees or paise input
    let targetPricePaise: bigint | null | undefined = undefined;
    if (input.packagePriceRupees !== undefined) {
      targetPricePaise = input.packagePriceRupees === null ? null : BigInt(Math.round(input.packagePriceRupees * 100));
    } else if (input.packagePricePaise !== undefined) {
      targetPricePaise = input.packagePricePaise === null ? null : BigInt(input.packagePricePaise);
    }

    // Resolve target diagnostic fee in Paise from rupees or paise input
    let targetDiagFeePaise: bigint | undefined = undefined;
    if (input.diagnosticFeeRupees !== undefined) {
      targetDiagFeePaise = BigInt(Math.round(input.diagnosticFeeRupees * 100));
    } else if (input.diagnosticFeePaise !== undefined) {
      targetDiagFeePaise = BigInt(input.diagnosticFeePaise);
    }

    const nextFeatures = input.packageFeatures !== undefined ? input.packageFeatures : existingFeatures;

    if (input.hubId && input.hubId.trim() && input.hubId !== 'all') {
      const cleanHubId = input.hubId.trim();
      hubPricing[cleanHubId] = {
        packagePricePaise: targetPricePaise !== undefined ? (targetPricePaise === null ? '0' : targetPricePaise.toString()) : (hubPricing[cleanHubId]?.packagePricePaise || existing.packagePricePaise?.toString() || '0'),
        diagnosticFeePaise: targetDiagFeePaise !== undefined ? targetDiagFeePaise.toString() : (hubPricing[cleanHubId]?.diagnosticFeePaise || existing.diagnosticFeePaise?.toString() || '50000'),
        fixedPackageAvailable: input.fixedPackageAvailable !== undefined ? input.fixedPackageAvailable : (hubPricing[cleanHubId]?.fixedPackageAvailable ?? existing.fixedPackageAvailable),
      };

      const updated = await this.db.serviceIssueTemplate.update({
        where: { categoryKey },
        data: {
          packageFeatures: JSON.stringify({ features: nextFeatures, hubPricing }),
          updatedByEmployeeId: actorId,
          version: { increment: 1 },
        },
      });

      const res = resolveEffectiveCategoryPricing(updated, cleanHubId);
      return {
        categoryKey: updated.categoryKey,
        version: updated.version,
        title: updated.title,
        description: updated.description,
        icon: updated.icon,
        fixedPackageAvailable: res.fixedPackageAvailable,
        packagePricePaise: res.packagePricePaise ? res.packagePricePaise.toString() : null,
        pricingType: updated.pricingType,
        diagnosticFeePaise: res.diagnosticFeePaise.toString(),
        packageFeatures: res.packageFeatures,
        hubPricing: res.hubPricing,
        hubId: cleanHubId,
        isActive: updated.isActive,
      };
    }

    // Default base update for all hubs
    const updated = await this.db.serviceIssueTemplate.update({
      where: { categoryKey },
      data: {
        title: input.title !== undefined ? input.title.trim() : existing.title,
        description: input.description !== undefined ? input.description.trim() : existing.description,
        fixedPackageAvailable: input.fixedPackageAvailable !== undefined ? input.fixedPackageAvailable : existing.fixedPackageAvailable,
        packagePricePaise: targetPricePaise !== undefined ? targetPricePaise : existing.packagePricePaise,
        pricingType: input.pricingType !== undefined ? input.pricingType : existing.pricingType,
        diagnosticFeePaise: targetDiagFeePaise !== undefined ? targetDiagFeePaise : existing.diagnosticFeePaise,
        packageFeatures: JSON.stringify({ features: nextFeatures, hubPricing }),
        isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
        updatedByEmployeeId: actorId,
        version: { increment: 1 },
      },
    });

    const res = resolveEffectiveCategoryPricing(updated);
    return {
      categoryKey: updated.categoryKey,
      version: updated.version,
      title: updated.title,
      description: updated.description,
      icon: updated.icon,
      fixedPackageAvailable: res.fixedPackageAvailable,
      packagePricePaise: res.packagePricePaise ? res.packagePricePaise.toString() : null,
      pricingType: updated.pricingType,
      diagnosticFeePaise: res.diagnosticFeePaise.toString(),
      packageFeatures: res.packageFeatures,
      hubPricing: res.hubPricing,
      isActive: updated.isActive,
    };
  }

  async getServicePaymentPolicy() {
    const policy = await this.ensurePaymentPolicy();
    return {
      id: policy.id,
      version: policy.version,
      name: policy.name,
      description: policy.description,
      isActive: policy.isActive,
      isApproved: policy.isApproved,
      allowZeroAdvance: policy.allowZeroAdvance,
      allowPartialAdvance: policy.allowPartialAdvance,
      defaultPartialAdvancePercent: policy.defaultPartialAdvancePercent,
      diagnosticFeePaise: policy.diagnosticFeePaise.toString(),
      diagnosticFeeCreditedToInvoice: policy.diagnosticFeeCreditedToInvoice,
      partsAdvancePercent: policy.partsAdvancePercent,
      partialPlans: safeParseJson(policy.partialPlans, []),
    };
  }

  async updateServicePaymentPolicy(
    adminId: string,
    input: {
      name?: string;
      description?: string;
      allowZeroAdvance?: boolean;
      allowPartialAdvance?: boolean;
      defaultPartialAdvancePercent?: number;
      diagnosticFeePaise?: bigint | number;
      diagnosticFeeCreditedToInvoice?: boolean;
      partsAdvancePercent?: number;
      partialPlans?: Array<{ id: string; percentage: number; label: string }>;
    }
  ) {
    const current = await this.ensurePaymentPolicy();
    const updated = await this.db.servicePaymentPolicy.update({
      where: { id: current.id },
      data: {
        name: input.name !== undefined ? input.name.trim() : current.name,
        description: input.description !== undefined ? input.description.trim() : current.description,
        allowZeroAdvance: input.allowZeroAdvance !== undefined ? input.allowZeroAdvance : current.allowZeroAdvance,
        allowPartialAdvance: input.allowPartialAdvance !== undefined ? input.allowPartialAdvance : current.allowPartialAdvance,
        defaultPartialAdvancePercent: input.defaultPartialAdvancePercent !== undefined ? input.defaultPartialAdvancePercent : current.defaultPartialAdvancePercent,
        diagnosticFeePaise: input.diagnosticFeePaise !== undefined ? BigInt(input.diagnosticFeePaise) : current.diagnosticFeePaise,
        diagnosticFeeCreditedToInvoice: input.diagnosticFeeCreditedToInvoice !== undefined ? input.diagnosticFeeCreditedToInvoice : current.diagnosticFeeCreditedToInvoice,
        partsAdvancePercent: input.partsAdvancePercent !== undefined ? input.partsAdvancePercent : current.partsAdvancePercent,
        partialPlans: input.partialPlans !== undefined ? JSON.stringify(input.partialPlans) : (current.partialPlans as Prisma.InputJsonValue),
      },
    });

    return {
      id: updated.id,
      version: updated.version,
      name: updated.name,
      description: updated.description,
      isActive: updated.isActive,
      isApproved: updated.isApproved,
      allowZeroAdvance: updated.allowZeroAdvance,
      allowPartialAdvance: updated.allowPartialAdvance,
      defaultPartialAdvancePercent: updated.defaultPartialAdvancePercent,
      diagnosticFeePaise: updated.diagnosticFeePaise.toString(),
      diagnosticFeeCreditedToInvoice: updated.diagnosticFeeCreditedToInvoice,
      partsAdvancePercent: updated.partsAdvancePercent,
      partialPlans: safeParseJson(updated.partialPlans, []),
    };
  }

  async getPaymentOptionsForCategory(categoryKey: string, hubId?: string) {
    await this.ensureSeedData();
    const template = await this.db.serviceIssueTemplate.findUnique({ where: { categoryKey } });
    if (!template || !template.isActive) throw new HttpError(404, 'CATEGORY_NOT_FOUND');

    const policy = await this.ensurePaymentPolicy();
    const resolved = resolveEffectiveCategoryPricing(template, hubId);

    const isPackage = resolved.fixedPackageAvailable && resolved.packagePricePaise && resolved.packagePricePaise > 0n;
    const packagePricePaise = resolved.packagePricePaise || 0n;
    const diagnosticFeePaise = resolved.diagnosticFeePaise > 0n ? resolved.diagnosticFeePaise : policy.diagnosticFeePaise;

    const options: Array<{
      id: 'ZERO_UPFRONT' | 'ADVANCE_25' | 'FULL_100' | 'DIAGNOSTIC_FEE';
      planId: 'ZERO_UPFRONT' | 'ADVANCE_25' | 'FULL_100' | 'DIAGNOSTIC_FEE';
      title: string;
      description: string;
      badge?: string;
      payNowPaise: string;
      balancePaise: string;
      isRecommended: boolean;
    }> = [];

    if (isPackage) {
      if (policy.allowZeroAdvance) {
        options.push({
          id: 'ZERO_UPFRONT',
          planId: 'ZERO_UPFRONT',
          title: 'Pay After Service / At Workshop',
          description: 'Zero upfront cost. Inspect work first and pay total package charges upon vehicle delivery.',
          payNowPaise: '0',
          balancePaise: packagePricePaise.toString(),
          isRecommended: false,
        });
      }

      if (policy.allowPartialAdvance) {
        const advancePaise = (packagePricePaise * BigInt(policy.defaultPartialAdvancePercent)) / 100n;
        const remainingPaise = packagePricePaise - advancePaise;
        options.push({
          id: 'ADVANCE_25',
          planId: 'ADVANCE_25',
          title: `${policy.defaultPartialAdvancePercent}% Priority Advance`,
          description: `Pay ₹${(Number(advancePaise) / 100).toLocaleString('en-IN')} now to lock in genuine OEM parts and technician bay. Balance due at pickup.`,
          badge: 'POPULAR',
          payNowPaise: advancePaise.toString(),
          balancePaise: remainingPaise.toString(),
          isRecommended: true,
        });
      }

      options.push({
        id: 'FULL_100',
        planId: 'FULL_100',
        title: 'Pay 100% In Full',
        description: `Pay total package charges of ₹${(Number(packagePricePaise) / 100).toLocaleString('en-IN')} now for express vehicle release without cashier delay.`,
        badge: 'EXPRESS PICKUP',
        payNowPaise: packagePricePaise.toString(),
        balancePaise: '0',
        isRecommended: false,
      });
    } else {
      options.push({
        id: 'ZERO_UPFRONT',
        planId: 'ZERO_UPFRONT',
        title: 'Free Diagnostic Booking',
        description: 'Zero upfront charges. Our master technician will diagnose vehicle symptoms and provide an itemized estimate.',
        badge: 'RECOMMENDED',
        payNowPaise: '0',
        balancePaise: '0',
        isRecommended: true,
      });

      options.push({
        id: 'DIAGNOSTIC_FEE',
        planId: 'DIAGNOSTIC_FEE',
        title: `Diagnostic Fee Advance (₹${(Number(diagnosticFeePaise) / 100).toLocaleString('en-IN')})`,
        description: `Pay diagnostic fee now. 100% credited against your final service invoice when repair work is approved.`,
        payNowPaise: diagnosticFeePaise.toString(),
        balancePaise: '0',
        isRecommended: false,
      });
    }

    return {
      categoryKey: template.categoryKey,
      title: template.title,
      fixedPackageAvailable: resolved.fixedPackageAvailable,
      packagePricePaise: resolved.packagePricePaise ? resolved.packagePricePaise.toString() : null,
      pricingType: template.pricingType,
      diagnosticFeePaise: diagnosticFeePaise.toString(),
      packageFeatures: resolved.packageFeatures,
      hubPricing: resolved.hubPricing,
      policy: {
        version: policy.version,
        allowZeroAdvance: policy.allowZeroAdvance,
        allowPartialAdvance: policy.allowPartialAdvance,
        defaultPartialAdvancePercent: policy.defaultPartialAdvancePercent,
        diagnosticFeeCreditedToInvoice: policy.diagnosticFeeCreditedToInvoice,
      },
      options,
    };
  }

  async listHubs(city?: string) {
    await this.ensureSeedData();
    const where: Prisma.ServiceHubWhereInput = { isActive: true, supportsService: true };
    if (city) {
      const c = city.trim().toLowerCase();
      if (c === 'bengaluru' || c === 'bangalore') {
        where.city = { in: ['Bengaluru', 'Bangalore'], mode: 'insensitive' };
      } else {
        where.city = { equals: city.trim(), mode: 'insensitive' };
      }
    }
    const hubs = await this.db.serviceHub.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return hubs.map(h => ({
      id: h.id,
      code: h.code,
      name: h.name,
      city: h.city,
      address: h.address,
      latitude: h.latitude,
      longitude: h.longitude,
      operatingHours: h.operatingHours,
      phone: h.phone,
      capacityPerSlot: h.capacityPerSlot,
      pickupRadiusKm: h.pickupRadiusKm,
      pickupFeePaise: h.pickupFeePaise.toString(),
      diagnosticFeePaise: h.diagnosticFeePaise.toString(),
    }));
  }

  async getSlotAvailability(hubId: string, date: string) {
    const hub = await this.db.serviceHub.findUnique({ where: { id: hubId } });
    if (!hub || !hub.isActive) throw new HttpError(404, 'HUB_NOT_FOUND');

    const standardSlots = ['09:00-11:00', '11:00-13:00', '14:00-16:00', '16:00-18:00'];
    const existing = await this.db.serviceSlotCapacity.findMany({
      where: { hubId, slotDate: date },
    });
    const map = new Map(existing.map(s => [s.slotTime, s]));

    return standardSlots.map(time => {
      const rec = map.get(time);
      const booked = rec ? rec.bookedCount : 0;
      const max = rec ? rec.maxCapacity : hub.capacityPerSlot;
      const available = Math.max(0, max - booked);
      return {
        slotDate: date,
        slotTime: time,
        maxCapacity: max,
        bookedCount: booked,
        isAvailable: available > 0,
        availableCount: available,
      };
    });
  }

  // -------------------------------------------------------------
  // MY GARAGE (Customer Vehicles)
  // -------------------------------------------------------------
  async listCustomerVehicles(firebaseUid: string) {
    const user = await this.db.user.findUnique({ where: { firebaseUid } });
    if (!user) {
      return [];
    }

    const vehicles = await this.db.customerVehicle.findMany({
      where: { userId: user.id, isArchived: false },
      orderBy: [{ isPreferred: 'desc' }, { createdAt: 'desc' }],
    });

    // A customer's Garage is core data and must remain available even while an
    // optional service-history migration is being rolled out. Keeping this
    // query independent from ServiceRequest prevents a missing service table
    // from making already-saved vehicles appear to disappear after an app
    // restart.
    const activeRequestByVehicleId = new Map<string, ServiceRequest>();
    if (vehicles.length > 0) {
      try {
        const activeRequests = await this.db.serviceRequest.findMany({
          where: {
            vehicleId: { in: vehicles.map(vehicle => vehicle.id) },
            status: { notIn: [ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED] },
          },
          orderBy: { createdAt: 'desc' },
        });

        for (const request of activeRequests) {
          if (!activeRequestByVehicleId.has(request.vehicleId)) {
            activeRequestByVehicleId.set(request.vehicleId, request);
          }
        }
      } catch (error) {
        // P2021 means the service module has not yet been migrated. Do not hide
        // the Garage itself; the service card can simply be unavailable until
        // that independent deployment is complete.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021')) {
          throw error;
        }
      }
    }

    return vehicles.map(vehicle => {
      const request = activeRequestByVehicleId.get(vehicle.id);
      return formatCustomerVehicleRecord(
        vehicle,
        request
          ? {
              id: request.id,
              requestNumber: request.requestNumber,
              categoryKey: request.categoryKey,
              status: request.status,
              scheduledDate: request.scheduledDate,
              scheduledTimeSlot: request.scheduledTimeSlot,
            }
          : null
      );
    });
  }

  async getCustomerVehicle(firebaseUid: string, vehicleId: string) {
    const user = await this.db.user.findUnique({ where: { firebaseUid } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');

    const vehicle = await this.db.customerVehicle.findFirst({
      where: { id: vehicleId, userId: user.id },
      include: {
        serviceRequests: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!vehicle) throw new HttpError(404, 'VEHICLE_NOT_FOUND');

    return {
      ...formatCustomerVehicleRecord(vehicle),
      serviceRequests: vehicle.serviceRequests.map(sr => ({
        id: sr.id,
        requestNumber: sr.requestNumber,
        categoryKey: sr.categoryKey,
        status: sr.status,
        fulfillmentType: sr.fulfillmentType,
        scheduledDate: sr.scheduledDate,
        scheduledTimeSlot: sr.scheduledTimeSlot,
        createdAt: sr.createdAt.toISOString(),
      })),
    };
  }

  async createCustomerVehicle(firebaseUid: string, input: CreateVehicleInput, identity?: Identity) {
    let user = await this.db.user.findUnique({ where: { firebaseUid } });
    if (!user) {
      if (identity?.email) {
        user = await this.db.user.create({
          data: {
            firebaseUid,
            email: identity.email.toLowerCase().trim(),
            displayName: identity.name?.trim() || null,
          },
        });
      } else {
        throw new HttpError(404, 'USER_NOT_FOUND');
      }
    }

    const existingCount = await this.db.customerVehicle.count({
      where: { userId: user.id, isArchived: false },
    });
    const shouldBePreferred = input.isPreferred ?? existingCount === 0;

    return this.db.$transaction(async tx => {
      if (shouldBePreferred) {
        await tx.customerVehicle.updateMany({
          where: { userId: user.id },
          data: { isPreferred: false },
        });
      }

      const vehicle = await tx.customerVehicle.create({
        data: {
          userId: user.id,
          make: input.make.trim(),
          model: input.model.trim(),
          year: input.year,
          variant: input.variant ? input.variant.trim() : null,
          fuelType: input.fuelType.toUpperCase(),
          transmission: input.transmission.toUpperCase(),
          color: input.color ? input.color.trim() : null,
          registrationNumber: input.registrationNumber ? input.registrationNumber.trim().toUpperCase() : null,
          odometerKm: typeof input.odometerKm === 'number' ? input.odometerKm : null,
          vin: input.vin ? input.vin.trim().toUpperCase() : null,
          declaredOwnership: input.declaredOwnership || 'OWNER',
          photoUrls: input.photoUrls ? (Array.isArray(input.photoUrls) ? input.photoUrls : [input.photoUrls]) : Prisma.JsonNull,
          notes: input.notes ? input.notes.trim() : null,
          isPreferred: shouldBePreferred,
          // Estimate next service: +10,000 km or 6 months if odometer provided
          nextServiceDueKm: input.odometerKm ? input.odometerKm + 10000 : null,
          nextServiceDueDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        },
      });

      return formatCustomerVehicleRecord(vehicle);
    });
  }

  async updateCustomerVehicle(firebaseUid: string, vehicleId: string, input: UpdateVehicleInput) {
    const user = await this.db.user.findUnique({ where: { firebaseUid } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');

    const vehicle = await this.db.customerVehicle.findFirst({
      where: { id: vehicleId, userId: user.id, isArchived: false },
    });
    if (!vehicle) throw new HttpError(404, 'VEHICLE_NOT_FOUND');

    return this.db.$transaction(async tx => {
      if (input.isPreferred) {
        await tx.customerVehicle.updateMany({
          where: { userId: user.id },
          data: { isPreferred: false },
        });
      }

      const updated = await tx.customerVehicle.update({
        where: { id: vehicleId },
        data: {
          variant: input.variant !== undefined ? input.variant?.trim() : undefined,
          color: input.color !== undefined ? input.color?.trim() : undefined,
          registrationNumber: input.registrationNumber !== undefined ? input.registrationNumber?.trim().toUpperCase() : undefined,
          odometerKm: input.odometerKm !== undefined ? input.odometerKm : undefined,
          vin: input.vin !== undefined ? input.vin?.trim().toUpperCase() : undefined,
          declaredOwnership: input.declaredOwnership ? input.declaredOwnership : undefined,
          photoUrls: input.photoUrls !== undefined ? (input.photoUrls ? (Array.isArray(input.photoUrls) ? input.photoUrls : [input.photoUrls]) : Prisma.JsonNull) : undefined,
          notes: input.notes !== undefined ? (input.notes ? input.notes.trim() : null) : undefined,
          isPreferred: typeof input.isPreferred === 'boolean' ? input.isPreferred : undefined,
          lastServiceDate: input.lastServiceDate ? new Date(input.lastServiceDate) : undefined,
          nextServiceDueKm: input.nextServiceDueKm !== undefined ? input.nextServiceDueKm : undefined,
          nextServiceDueDate: input.nextServiceDueDate ? new Date(input.nextServiceDueDate) : undefined,
        },
      });

      return formatCustomerVehicleRecord(updated);
    });
  }

  async archiveCustomerVehicle(firebaseUid: string, vehicleId: string) {
    const user = await this.db.user.findUnique({ where: { firebaseUid } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');

    const vehicle = await this.db.customerVehicle.findFirst({
      where: { id: vehicleId, userId: user.id, isArchived: false },
    });
    if (!vehicle) throw new HttpError(404, 'VEHICLE_NOT_FOUND');

    // Prevent archiving if active non-completed service request exists
    const activeRequests = await this.db.serviceRequest.count({
      where: {
        vehicleId,
        status: { notIn: [ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED] },
      },
    });
    if (activeRequests > 0) {
      throw new HttpError(409, 'CANNOT_ARCHIVE_VEHICLE_WITH_ACTIVE_SERVICE');
    }

    return this.db.$transaction(async tx => {
      await tx.customerVehicle.update({
        where: { id: vehicleId },
        data: {
          isArchived: true,
          archivedAt: new Date(),
          isPreferred: false,
        },
      });

      if (vehicle.isPreferred) {
        const remaining = await tx.customerVehicle.findFirst({
          where: { userId: user.id, isArchived: false },
          orderBy: { createdAt: 'desc' },
        });
        if (remaining) {
          await tx.customerVehicle.update({
            where: { id: remaining.id },
            data: { isPreferred: true },
          });
        }
      }

      return { success: true };
    });
  }

  // -------------------------------------------------------------
  // CUSTOMER SERVICE BOOKING & TRACKING
  // -------------------------------------------------------------
  async createServiceRequest(firebaseUid: string, input: CreateServiceRequestInput) {
    const user = await this.db.user.findUnique({ where: { firebaseUid } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');

    const vehicle = await this.db.customerVehicle.findFirst({
      where: { id: input.vehicleId, userId: user.id, isArchived: false },
    });
    if (!vehicle) throw new HttpError(404, 'VEHICLE_NOT_FOUND');

    let hub = await this.db.serviceHub.findUnique({ where: { id: input.hubId } }).catch(() => null);
    if (!hub) {
      hub = await this.db.serviceHub.findFirst({ where: { branchId: input.hubId, isActive: true } }).catch(() => null);
    }
    if (!hub) {
      hub = await this.db.serviceHub.findFirst({ where: { code: input.hubId, isActive: true } }).catch(() => null);
    }
    if (!hub) {
      const branch = await this.db.branch.findUnique({ where: { id: input.hubId } }).catch(() => null);
      if (branch) {
        hub = await this.db.serviceHub.upsert({
          where: { code: branch.code },
          update: { branchId: branch.id, name: branch.name, city: branch.city, isActive: branch.active },
          create: {
            branchId: branch.id,
            code: branch.code,
            name: branch.name,
            city: branch.city,
            address: branch.address || `${branch.city} Hub Facility`,
            isActive: branch.active,
          },
        }).catch(() => null);
      }
    }
    if (!hub || !hub.isActive) {
      hub = await this.db.serviceHub.findFirst({ where: { isActive: true } });
    }
    if (!hub) throw new HttpError(404, 'HUB_NOT_FOUND');
    input.hubId = hub.id;

    const template = await this.db.serviceIssueTemplate.findUnique({
      where: { categoryKey: input.categoryKey },
    });
    if (!template || !template.isActive) throw new HttpError(404, 'CATEGORY_NOT_FOUND');

    // Detect emergency / critical safety flags in question answers
    const questions = JSON.parse(template.questionsJson as string) as Array<{ stableId: string; isSafetyCritical?: boolean }>;
    let hasSafetyCriticalWarning = false;
    let safetyNotes = '';

    for (const q of questions) {
      if (q.isSafetyCritical && input.questionAnswers[q.stableId]) {
        const val = String(input.questionAnswers[q.stableId]);
        if (val.includes('NO') || val.includes('CRITICAL') || val.includes('Flashing') || val.includes('Red') || val.includes('dangerous')) {
          hasSafetyCriticalWarning = true;
          safetyNotes += `[CRITICAL SAFETY: ${q.stableId}=${val}] `;
        }
      }
    }

    // Generate Human-Readable Request Number: SR-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = Math.floor(1000 + Math.random() * 9000).toString();
    const requestNumber = `SR-${dateStr}-${randomHex}`;

    return this.db.$transaction(async tx => {
      // Check and update slot capacity atomically
      const slot = await tx.serviceSlotCapacity.findUnique({
        where: {
          hubId_slotDate_slotTime: {
            hubId: input.hubId,
            slotDate: input.scheduledDate,
            slotTime: input.scheduledTimeSlot,
          },
        },
      });

      const maxCap = slot ? slot.maxCapacity : hub.capacityPerSlot;
      const currentBooked = slot ? slot.bookedCount : 0;
      if (currentBooked >= maxCap) {
        throw new HttpError(409, 'SLOT_FULL');
      }

      await tx.serviceSlotCapacity.upsert({
        where: {
          hubId_slotDate_slotTime: {
            hubId: input.hubId,
            slotDate: input.scheduledDate,
            slotTime: input.scheduledTimeSlot,
          },
        },
        update: { bookedCount: { increment: 1 } },
        create: {
          hubId: input.hubId,
          slotDate: input.scheduledDate,
          slotTime: input.scheduledTimeSlot,
          maxCapacity: hub.capacityPerSlot,
          bookedCount: 1,
        },
      });

      // Calculate payment plan and snapshot
      const planId = input.paymentPlanId || 'ZERO_UPFRONT';
      let payNowPaise = 0n;
      let balancePaise = 0n;
      const resolved = resolveEffectiveCategoryPricing(template, input.hubId);
      const isFixed = resolved.fixedPackageAvailable && resolved.packagePricePaise && resolved.packagePricePaise > 0n;
      const packagePrice = resolved.packagePricePaise || 0n;
      const diagFee = resolved.diagnosticFeePaise > 0n ? resolved.diagnosticFeePaise : 50000n;

      if (isFixed) {
        if (planId === 'FULL_100') {
          payNowPaise = packagePrice;
          balancePaise = 0n;
        } else if (planId === 'ADVANCE_25') {
          payNowPaise = (packagePrice * 25n) / 100n;
          balancePaise = packagePrice - payNowPaise;
        } else {
          payNowPaise = 0n;
          balancePaise = packagePrice;
        }
      } else {
        if (planId === 'DIAGNOSTIC_FEE') {
          payNowPaise = diagFee;
          balancePaise = 0n;
        } else {
          payNowPaise = 0n;
          balancePaise = 0n;
        }
      }

      let isPaidNow = false;
      if (payNowPaise > 0n && input.gatewayPaymentId && input.gatewayOrderId) {
        assertGatewayPaymentSignature(input);
        await assertCapturedAmount(input, payNowPaise, { exact: true });
        isPaidNow = true;
      }

      const initialVerifiedPaid = isPaidNow ? payNowPaise : 0n;
      const initialOutstanding = isPaidNow ? balancePaise : (isFixed ? packagePrice : 0n);
      const initialPaymentStatus = isPaidNow ? (balancePaise === 0n ? 'PAID_IN_FULL' : 'PARTIALLY_PAID') : 'UNPAID';
      const initialDepositStatus = isPaidNow ? (planId === 'DIAGNOSTIC_FEE' ? 'DIAGNOSTIC_PAID' : 'ADVANCE_PAID') : 'NOT_COLLECTED';

      const planSnapshot = {
        planId,
        payNowPaise: payNowPaise.toString(),
        balancePaise: balancePaise.toString(),
        categoryTitle: template.title,
        paidAt: isPaidNow ? new Date().toISOString() : null,
      };

      const sr = await tx.serviceRequest.create({
        data: {
          requestNumber,
          customerId: user.id,
          vehicleId: vehicle.id,
          hubId: hub.id,
          categoryKey: input.categoryKey,
          templateVersion: template.version,
          customerSymptoms: input.customerSymptoms.trim(),
          questionAnswers: JSON.stringify(input.questionAnswers),
          mediaUrls: input.mediaUrls ? JSON.stringify(input.mediaUrls) : Prisma.JsonNull,
          fulfillmentType: input.fulfillmentType,
          status: ServiceRequestStatus.APPOINTMENT_SCHEDULED,
          scheduledDate: input.scheduledDate,
          scheduledTimeSlot: input.scheduledTimeSlot,
          pickupAddress: input.pickupAddress ? JSON.stringify(input.pickupAddress) : Prisma.JsonNull,
          returnAddress: input.returnAddress ? JSON.stringify(input.returnAddress) : Prisma.JsonNull,
          emergencySafetyFlag: hasSafetyCriticalWarning,
          safetyNotes: safetyNotes.trim() || null,
          paymentPlanSnapshot: JSON.stringify(planSnapshot),
          servicePaymentStatus: initialPaymentStatus,
          depositStatus: initialDepositStatus,
          verifiedPaidPaise: initialVerifiedPaid,
          outstandingBalancePaise: initialOutstanding,
        },
      });

      if (isPaidNow) {
        await tx.servicePaymentRecord.create({
          data: {
            serviceRequestId: sr.id,
            type: planId === 'DIAGNOSTIC_FEE' ? 'DIAGNOSTIC_FEE' : 'BOOKING_ADVANCE',
            installmentType: planId,
            amountPaise: payNowPaise,
            status: ServicePaymentStatus.PAID_VERIFIED,
            paymentGateway: input.paymentGateway || 'RAZORPAY',
            gatewayOrderId: input.gatewayOrderId,
            gatewayPaymentId: input.gatewayPaymentId,
            gatewaySignature: input.gatewaySignature,
            idempotencyKey: `booking_${sr.id}_${input.gatewayPaymentId}`,
            verifiedAt: new Date(),
          },
        });
      }

      // Insert Initial Audit / History Event
      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: null,
          toStatus: ServiceRequestStatus.APPOINTMENT_SCHEDULED,
          title: isPaidNow ? 'Service Booked with Advance Payment' : 'Service Appointment Booked',
          description: `Appointment confirmed for ${input.scheduledDate} (${input.scheduledTimeSlot}) at ${hub.name}. Plan: ${planId}.${isPaidNow ? ` Payment of ₹${(Number(payNowPaise) / 100).toLocaleString('en-IN')} verified.` : ' Zero upfront fee.'}`,
          actorRole: 'CUSTOMER',
          actorId: user.id,
        },
      });

      // Dispatch Notifications
      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'SERVICE_REQUEST_SUBMITTED',
          actorId: user.id,
          referenceId: sr.id,
          entityType: 'ServiceRequest',
          title: 'Car Service Request Received',
          body: `Your service booking ${sr.requestNumber} for ${vehicle.make} ${vehicle.model} has been confirmed for ${input.scheduledDate}.`,
          category: 'SERVICE',
          recipientUserIds: [user.id],
          recipientRoles: ['SERVICE_ADVISOR', 'HUB_MANAGER'],
          deepLink: `vmotiv://service-requests/${sr.id}`,
        });
      }

      return sr;
    });
  }

  async listCustomerServiceRequests(firebaseUid: string) {
    const user = await this.db.user.findUnique({ where: { firebaseUid } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');

    const requests = await this.db.serviceRequest.findMany({
      where: { customerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        vehicle: true,
        hub: true,
        estimates: {
          where: { status: { in: [ServiceEstimateStatus.SENT_TO_CUSTOMER, ServiceEstimateStatus.APPROVED] } },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    return requests.map(r => ({
      id: r.id,
      requestNumber: r.requestNumber,
      categoryKey: r.categoryKey,
      status: r.status,
      fulfillmentType: r.fulfillmentType,
      scheduledDate: r.scheduledDate,
      scheduledTimeSlot: r.scheduledTimeSlot,
      emergencySafetyFlag: r.emergencySafetyFlag,
      servicePaymentStatus: r.servicePaymentStatus || 'UNPAID',
      depositStatus: r.depositStatus || 'NOT_COLLECTED',
      verifiedPaidPaise: r.verifiedPaidPaise ? r.verifiedPaidPaise.toString() : '0',
      outstandingBalancePaise: r.outstandingBalancePaise ? r.outstandingBalancePaise.toString() : '0',
      paymentPlanSnapshot: safeParseJson(r.paymentPlanSnapshot, null),
      vehicle: {
        id: r.vehicle.id,
        make: r.vehicle.make,
        model: r.vehicle.model,
        year: r.vehicle.year,
        registrationNumber: r.vehicle.registrationNumber,
      },
      hub: {
        id: r.hub.id,
        name: r.hub.name,
        city: r.hub.city,
        address: r.hub.address,
      },
      activeEstimate: r.estimates[0]
        ? {
            id: r.estimates[0].id,
            version: r.estimates[0].version,
            status: r.estimates[0].status,
            totalAmountPaise: r.estimates[0].totalAmountPaise.toString(),
          }
        : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getCustomerServiceRequest(firebaseUid: string, requestId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');
    }
    const user = await this.db.user.findUnique({ where: { firebaseUid } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');

    const r = await this.db.serviceRequest.findFirst({
      where: { id: requestId, customerId: user.id },
      include: {
        vehicle: true,
        hub: true,
        custodyRecords: { orderBy: { recordedAt: 'asc' } },
        diagnoses: { orderBy: { createdAt: 'desc' } },
        estimates: {
          include: { items: true },
          orderBy: { version: 'desc' },
        },
        workOrders: { orderBy: { createdAt: 'desc' } },
        qcRecords: { orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' } },
        historyEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!r) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    return {
      id: r.id,
      requestNumber: r.requestNumber,
      categoryKey: r.categoryKey,
      status: r.status,
      fulfillmentType: r.fulfillmentType,
      customerSymptoms: r.customerSymptoms,
      questionAnswers: safeParseJson(r.questionAnswers, {}),
      mediaUrls: safeParseJson(r.mediaUrls, []),
      scheduledDate: r.scheduledDate,
      scheduledTimeSlot: r.scheduledTimeSlot,
      pickupAddress: safeParseJson(r.pickupAddress, null),
      returnAddress: safeParseJson(r.returnAddress, null),
      emergencySafetyFlag: r.emergencySafetyFlag,
      safetyNotes: r.safetyNotes,
      estimatedCompletionDate: r.estimatedCompletionDate?.toISOString() || null,
      cancellationReason: r.cancellationReason,
      cancelledAt: r.cancelledAt?.toISOString() || null,
      vehicle: {
        id: r.vehicle.id,
        make: r.vehicle.make,
        model: r.vehicle.model,
        year: r.vehicle.year,
        fuelType: r.vehicle.fuelType,
        registrationNumber: r.vehicle.registrationNumber,
        odometerKm: r.vehicle.odometerKm,
      },
      hub: {
        id: r.hub.id,
        code: r.hub.code,
        name: r.hub.name,
        city: r.hub.city,
        address: r.hub.address,
        phone: r.hub.phone,
        operatingHours: r.hub.operatingHours,
      },
      custodyRecords: r.custodyRecords.map(c => ({
        id: c.id,
        type: c.type,
        odometerKm: c.odometerKm,
        fuelChargeLevel: c.fuelChargeLevel,
        keyCount: c.keyCount,
        accessories: c.accessoriesJson ? JSON.parse(c.accessoriesJson as string) : null,
        preExistingDamageNotes: c.preExistingDamageNotes,
        damagePhotoUrls: c.damagePhotoUrls ? JSON.parse(c.damagePhotoUrls as string) : [],
        handoverByPerson: c.handoverByPerson,
        customerAcknowledged: c.customerAcknowledged,
        recordedAt: c.recordedAt.toISOString(),
      })),
      diagnoses: r.diagnoses.map(d => ({
        id: d.id,
        diagnosticSummary: d.diagnosticSummary,
        detailedFindings: d.detailedFindings,
        recommendedAction: d.recommendedAction,
        photosAndScans: d.photosAndScans ? JSON.parse(d.photosAndScans as string) : [],
        diagnosticFeePaise: d.diagnosticFeePaise.toString(),
        isRoadTestNeeded: d.isRoadTestNeeded,
        createdAt: d.createdAt.toISOString(),
      })),
      estimates: r.estimates.map(e => ({
        id: e.id,
        version: e.version,
        status: e.status,
        subtotalPaise: e.subtotalPaise.toString(),
        pickupDropFeePaise: e.pickupDropFeePaise.toString(),
        diagnosticFeePaise: e.diagnosticFeePaise.toString(),
        discountPaise: e.discountPaise.toString(),
        cgstPaise: e.cgstPaise.toString(),
        sgstPaise: e.sgstPaise.toString(),
        totalAmountPaise: e.totalAmountPaise.toString(),
        customerNotes: e.customerNotes,
        responseNotes: e.responseNotes,
        validUntil: e.validUntil.toISOString(),
        respondedAt: e.respondedAt?.toISOString() || null,
        items: e.items.map(i => ({
          id: i.id,
          category: i.category,
          description: i.description,
          partNumber: i.partNumber,
          quantity: i.quantity,
          unitPricePaise: i.unitPricePaise.toString(),
          totalPricePaise: i.totalPricePaise.toString(),
          isMandatory: i.isMandatory,
          isApprovedByCustomer: i.isApprovedByCustomer,
        })),
        createdAt: e.createdAt.toISOString(),
      })),
      workOrders: r.workOrders.map(w => ({
        id: w.id,
        status: w.status,
        instructions: w.instructions,
        actualHoursSpent: w.actualHoursSpent,
        startedAt: w.startedAt?.toISOString() || null,
        completedAt: w.completedAt?.toISOString() || null,
      })),
      qcRecords: r.qcRecords.map(q => ({
        id: q.id,
        result: q.result,
        checklistResults: JSON.parse(q.checklistResults as string),
        notes: q.notes,
        passedAt: q.passedAt?.toISOString() || null,
      })),
      payments: r.payments.map(p => ({
        id: p.id,
        type: p.type,
        amountPaise: p.amountPaise.toString(),
        status: p.status,
        paymentGateway: p.paymentGateway,
        gatewayPaymentId: p.gatewayPaymentId,
        verifiedAt: p.verifiedAt?.toISOString() || null,
      })),
      historyEvents: r.historyEvents.map(h => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        title: h.title,
        description: h.description,
        actorRole: h.actorRole,
        createdAt: h.createdAt.toISOString(),
      })),
      servicePaymentStatus: r.servicePaymentStatus || 'UNPAID',
      depositStatus: r.depositStatus || 'NOT_COLLECTED',
      verifiedPaidPaise: r.verifiedPaidPaise ? r.verifiedPaidPaise.toString() : '0',
      outstandingBalancePaise: r.outstandingBalancePaise ? r.outstandingBalancePaise.toString() : '0',
      finalInvoiceId: r.finalInvoiceId || null,
      paymentPlanSnapshot: safeParseJson(r.paymentPlanSnapshot, null),
      invoices: (r.invoices || []).map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        subtotalPaise: inv.subtotalPaise.toString(),
        diagnosticFeeCreditPaise: inv.diagnosticFeeCreditPaise.toString(),
        priorPaymentsCreditedPaise: inv.priorPaymentsCreditedPaise.toString(),
        cgstPaise: inv.cgstPaise.toString(),
        sgstPaise: inv.sgstPaise.toString(),
        totalAmountPaise: inv.totalAmountPaise.toString(),
        outstandingPaise: inv.outstandingPaise.toString(),
        status: inv.status,
        issuedAt: inv.issuedAt.toISOString(),
      })),
      createdAt: r.createdAt.toISOString(),
    };
  }

  async respondToEstimate(
    firebaseUid: string,
    estimateId: string,
    decision: 'APPROVE' | 'DECLINE',
    notes?: string,
    reasonCode?: (typeof ESTIMATE_DECLINE_REASONS)[number],
    declinedItemIds?: string[]
  ) {
    const user = await this.db.user.findUnique({ where: { firebaseUid } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');

    const estimate = await this.db.serviceEstimate.findUnique({
      where: { id: estimateId },
      include: { serviceRequest: true, items: true },
    });
    if (!estimate || estimate.serviceRequest.customerId !== user.id) {
      throw new HttpError(404, 'ESTIMATE_NOT_FOUND');
    }
    if (ESTIMATE_LOCKED_STATUSES.includes(estimate.serviceRequest.status)) {
      throw new HttpError(409, 'SERVICE_REQUEST_CLOSED_NO_ESTIMATE_ACTION');
    }
    // A declined estimate can be reconsidered until the workshop issues a revised one
    // (which supersedes it) or the request moves on.
    const reconsidering =
      estimate.status === ServiceEstimateStatus.DECLINED &&
      estimate.serviceRequest.status === ServiceRequestStatus.ESTIMATE_REJECTED;
    if (estimate.status !== ServiceEstimateStatus.SENT_TO_CUSTOMER && !reconsidering) {
      throw new HttpError(409, 'ESTIMATE_ALREADY_RESPONDED');
    }
    if (estimate.validUntil.getTime() < Date.now()) {
      throw new HttpError(409, 'ESTIMATE_EXPIRED_ASK_FOR_REVISED_ESTIMATE');
    }

    // Per-line approval: the customer may defer optional (recommended) items but never required ones.
    const declinedIds = new Set(decision === 'APPROVE' ? declinedItemIds ?? [] : []);
    let approvedTotals: ReturnType<typeof calculateEstimateTotals> | null = null;
    if (declinedIds.size > 0) {
      const known = new Set(estimate.items.map(i => i.id));
      if ([...declinedIds].some(id => !known.has(id))) throw new HttpError(400, 'UNKNOWN_ESTIMATE_ITEM');
      if (estimate.items.some(i => declinedIds.has(i.id) && i.isMandatory)) {
        throw new HttpError(409, 'REQUIRED_ESTIMATE_ITEMS_CANNOT_BE_DEFERRED');
      }
      const kept = estimate.items.filter(i => !declinedIds.has(i.id));
      if (kept.length === 0) throw new HttpError(400, 'USE_DECLINE_TO_REJECT_ALL_ITEMS');
      approvedTotals = calculateEstimateTotals({
        items: kept,
        pickupDropFeePaise: estimate.pickupDropFeePaise,
        diagnosticFeePaise: estimate.diagnosticFeePaise,
        discountPaise: estimate.discountPaise,
      });
    }

    const nextEstimateStatus = decision === 'APPROVE' ? ServiceEstimateStatus.APPROVED : ServiceEstimateStatus.DECLINED;
    const nextRequestStatus = decision === 'APPROVE' ? ServiceRequestStatus.ESTIMATE_APPROVED : ServiceRequestStatus.ESTIMATE_REJECTED;
    const reasonText = decision === 'DECLINE' && reasonCode ? `Reason: ${reasonCode.replace(/_/g, ' ').toLowerCase()}. ` : '';
    const storedNotes = `${reasonText}${notes?.trim() || ''}`.trim() || null;

    return this.db.$transaction(async tx => {
      await tx.serviceEstimate.update({
        where: { id: estimateId },
        data: {
          status: nextEstimateStatus,
          respondedAt: new Date(),
          responseNotes: storedNotes,
          // Approved scope only: invoices and balances are built from these stored totals.
          ...(approvedTotals ? { ...approvedTotals } : {}),
        },
      });
      if (decision === 'APPROVE') {
        await tx.serviceEstimateItem.updateMany({ where: { estimateId }, data: { isApprovedByCustomer: true } });
        if (declinedIds.size > 0) {
          await tx.serviceEstimateItem.updateMany({ where: { estimateId, id: { in: [...declinedIds] } }, data: { isApprovedByCustomer: false } });
        }
      }

      await tx.serviceRequest.update({
        where: { id: estimate.serviceRequestId },
        data: { status: nextRequestStatus },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: estimate.serviceRequestId,
          fromStatus: estimate.serviceRequest.status,
          toStatus: nextRequestStatus,
          title: decision === 'APPROVE' ? (reconsidering ? 'Customer Reconsidered and Approved Estimate' : 'Estimate Approved by Customer') : 'Estimate Declined by Customer',
          description: decision === 'APPROVE'
            ? approvedTotals
              ? `Customer approved ${estimate.items.length - declinedIds.size} of ${estimate.items.length} items of estimate v${estimate.version}; deferred ${declinedIds.size} optional item(s). Approved total ₹${(Number(approvedTotals.totalAmountPaise) / 100).toLocaleString('en-IN')} (quoted ₹${(Number(estimate.totalAmountPaise) / 100).toLocaleString('en-IN')}). Work proceeding.`
              : `Customer approved estimate v${estimate.version} totaling ₹${(Number(estimate.totalAmountPaise) / 100).toLocaleString('en-IN')}. Work proceeding.`
            : `Customer declined estimate v${estimate.version}. ${storedNotes || 'No reason provided'}. Contact the customer to negotiate, issue a revised estimate or cancel the service.`,
          actorRole: 'CUSTOMER',
          actorId: user.id,
        },
      });

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: decision === 'APPROVE' ? 'SERVICE_ESTIMATE_APPROVED' : 'SERVICE_ESTIMATE_DECLINED',
          actorId: user.id,
          referenceId: estimate.serviceRequestId,
          entityType: 'ServiceEstimate',
          title: decision === 'APPROVE' ? 'Service Estimate Approved' : 'Service Estimate Declined',
          body: `Customer ${decision === 'APPROVE' ? 'approved' : 'declined'} estimate for request ${estimate.serviceRequest.requestNumber}.${decision === 'DECLINE' && storedNotes ? ' ' + storedNotes : ''}`,
          category: 'SERVICE',
          recipientRoles: ['SERVICE_ADVISOR', 'HUB_MANAGER'],
        });
      }

      return { success: true, status: nextRequestStatus };
    });
  }

  async cancelServiceRequest(firebaseUid: string, requestId: string, reason: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');
    }
    const user = await this.db.user.findUnique({ where: { firebaseUid } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');

    const sr = await this.db.serviceRequest.findFirst({
      where: { id: requestId, customerId: user.id },
    });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    const cancellableStatuses: ServiceRequestStatus[] = [
      ServiceRequestStatus.DRAFT,
      ServiceRequestStatus.SUBMITTED,
      ServiceRequestStatus.APPOINTMENT_SCHEDULED,
      // Declining or hesitating over an estimate must never trap the customer in the job.
      ServiceRequestStatus.ESTIMATE_PENDING_APPROVAL,
      ServiceRequestStatus.ESTIMATE_REJECTED,
    ];
    if (!cancellableStatuses.includes(sr.status)) {
      throw new HttpError(409, 'CANNOT_CANCEL_REQUEST_AFTER_DISPATCH');
    }

    return this.db.$transaction(async tx => {
      // Release slot count
      const slot = await tx.serviceSlotCapacity.findUnique({
        where: {
          hubId_slotDate_slotTime: {
            hubId: sr.hubId,
            slotDate: sr.scheduledDate,
            slotTime: sr.scheduledTimeSlot,
          },
        },
      });
      if (slot && slot.bookedCount > 0) {
        await tx.serviceSlotCapacity.update({
          where: { id: slot.id },
          data: { bookedCount: { decrement: 1 } },
        });
      }

      // The job is over: a live estimate must not stay open for review or approval.
      await tx.serviceEstimate.updateMany({
        where: { serviceRequestId: sr.id, status: ServiceEstimateStatus.SENT_TO_CUSTOMER },
        data: { status: ServiceEstimateStatus.SUPERSEDED, respondedAt: new Date(), responseNotes: 'Voided: service request cancelled' },
      });

      const updated = await tx.serviceRequest.update({
        where: { id: requestId },
        data: {
          status: ServiceRequestStatus.CANCELLED,
          cancellationReason: reason.trim(),
          cancelledAt: new Date(),
          // A cancelled booking owes nothing; anything already paid is flagged for refund.
          outstandingBalancePaise: 0n,
          servicePaymentStatus: sr.verifiedPaidPaise > 0n ? 'CANCELLED_REFUND_DUE' : 'CANCELLED',
        },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: ServiceRequestStatus.CANCELLED,
          title: 'Service Request Cancelled',
          description: `Cancelled by customer. Reason: ${reason.trim()}`,
          actorRole: 'CUSTOMER',
          actorId: user.id,
        },
      });

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'SERVICE_CANCELLED',
          actorId: user.id,
          referenceId: sr.id,
          entityType: 'ServiceRequest',
          title: 'Service Request Cancelled',
          body: `Request ${sr.requestNumber} was cancelled by the customer.`,
          category: 'SERVICE',
          recipientRoles: ['SERVICE_ADVISOR', 'HUB_MANAGER'],
        });
      }

      return updated;
    });
  }

  // -------------------------------------------------------------

  async createWalkInServiceJob(
    actorId: string,
    input: {
      hubId: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      vehicleMake: string;
      vehicleModel: string;
      vehicleYear: number;
      fuelType?: string;
      transmission?: string;
      registrationNumber?: string;
      odometerKm?: number;
      categoryKey: string;
      customerSymptoms?: string;
      scheduledDate?: string;
      scheduledTimeSlot?: string;
      immediateIntake?: boolean;
      intakeOdometerKm?: number;
      intakeFuelPercent?: number;
      intakeNotes?: string;
      advancePaymentAmountRupees?: number;
      paymentMethod?: string;
      transactionReference?: string;
    }
  ) {
    let hub = await this.db.serviceHub.findUnique({ where: { id: input.hubId } }).catch(() => null);
    if (!hub) {
      hub = await this.db.serviceHub.findFirst({ where: { branchId: input.hubId, isActive: true } }).catch(() => null);
    }
    if (!hub) {
      hub = await this.db.serviceHub.findFirst({ where: { code: input.hubId, isActive: true } }).catch(() => null);
    }
    if (!hub) {
      const branch = await this.db.branch.findUnique({ where: { id: input.hubId } }).catch(() => null);
      if (branch) {
        hub = await this.db.serviceHub.upsert({
          where: { code: branch.code },
          update: { branchId: branch.id, name: branch.name, city: branch.city, isActive: branch.active },
          create: {
            branchId: branch.id,
            code: branch.code,
            name: branch.name,
            city: branch.city,
            address: branch.address || `${branch.city} Hub Facility`,
            isActive: branch.active,
          },
        }).catch(() => null);
      }
    }
    if (!hub || !hub.isActive) {
      hub = await this.db.serviceHub.findFirst({ where: { isActive: true } });
    }
    if (!hub) throw new HttpError(404, 'HUB_NOT_FOUND');
    input.hubId = hub.id;

    await this.ensureSeedData();
    let template = await this.db.serviceIssueTemplate.findUnique({
      where: { categoryKey: input.categoryKey },
    });
    if (!template) {
      template = await this.db.serviceIssueTemplate.findFirst({ where: { isActive: true } });
    }
    if (!template) throw new HttpError(404, 'CATEGORY_NOT_FOUND');

    return this.db.$transaction(async tx => {
      // 1. Find or create Customer User
      let customer = await tx.user.findFirst({
        where: {
          OR: [
            { phone: input.customerPhone.trim() },
            ...(input.customerEmail ? [{ email: input.customerEmail.toLowerCase().trim() }] : []),
          ],
        },
      });

      if (!customer) {
        const email =
          input.customerEmail?.toLowerCase().trim() ||
          `walkin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@service.vmotiv.in`;
        customer = await tx.user.create({
          data: {
            firebaseUid: `walkin_service_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            email,
            phone: input.customerPhone.trim(),
            displayName: input.customerName.trim(),
          },
        });
      }

      // 2. Find or create Vehicle
      let vehicle = await tx.customerVehicle.findFirst({
        where: {
          userId: customer.id,
          ...(input.registrationNumber
            ? { registrationNumber: input.registrationNumber.trim().toUpperCase() }
            : { make: input.vehicleMake.trim(), model: input.vehicleModel.trim() }),
          isArchived: false,
        },
      });

      if (!vehicle) {
        vehicle = await tx.customerVehicle.create({
          data: {
            userId: customer.id,
            make: input.vehicleMake.trim(),
            model: input.vehicleModel.trim(),
            year: input.vehicleYear || currentCalendarYear(),
            fuelType: (input.fuelType || 'PETROL').toUpperCase(),
            transmission: (input.transmission || 'MANUAL').toUpperCase(),
            registrationNumber: input.registrationNumber?.trim().toUpperCase() || null,
            odometerKm: input.odometerKm || input.intakeOdometerKm || 0,
            declaredOwnership: 'OWNER',
          },
        });
      }

      // 3. Generate Request Number
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomHex = Math.floor(1000 + Math.random() * 9000).toString();
      const requestNumber = `SR-${dateStr}-${randomHex}`;

      const scheduledDate = input.scheduledDate || new Date().toISOString().slice(0, 10);
      const scheduledTimeSlot = input.scheduledTimeSlot || '10:00-12:00';
      const initialStatus = input.immediateIntake
        ? ServiceRequestStatus.CHECKED_IN
        : ServiceRequestStatus.APPOINTMENT_SCHEDULED;

      // 4. Create Service Request
      const sr = await tx.serviceRequest.create({
        data: {
          requestNumber,
          customerId: customer.id,
          vehicleId: vehicle.id,
          hubId: hub.id,
          categoryKey: template.categoryKey,
          templateVersion: template.version,
          customerSymptoms: input.customerSymptoms?.trim() || 'Walk-in service booking at workshop counter',
          questionAnswers: JSON.stringify({
            bookingChannel: 'WALK_IN_OFFLINE',
            requirements: input.customerSymptoms?.trim() || 'Walk-in customer intake at workshop desk',
          }),
          fulfillmentType: ServiceFulfillmentType.SELF_DROP_AT_HUB,
          status: initialStatus,
          scheduledDate,
          scheduledTimeSlot,
        },
      });

      // 5. If immediate intake, create intake custody record
      if (input.immediateIntake) {
        await tx.serviceCustodyRecord.create({
          data: {
            serviceRequestId: sr.id,
            type: 'CHECK_IN',
            odometerKm: input.intakeOdometerKm || input.odometerKm || vehicle.odometerKm || 0,
            fuelChargeLevel: `${input.intakeFuelPercent || 50}%`,
            keyCount: 1,
            preExistingDamageNotes: input.intakeNotes?.trim() || 'Walk-in intake inspected at service desk',
            custodyOfficerId: actorId,
            handoverByPerson: input.customerName.trim(),
            customerAcknowledged: true,
          },
        });
      }

      // 6. Optional Walk-In Counter Advance Payment / Deposit
      if (input.advancePaymentAmountRupees && input.advancePaymentAmountRupees > 0) {
        const amountPaise = BigInt(Math.round(input.advancePaymentAmountRupees * 100));
        await tx.servicePaymentRecord.create({
          data: {
            serviceRequestId: sr.id,
            amountPaise,
            type: 'ADVANCE' as any,
            status: ServicePaymentStatus.PAID_VERIFIED,
            paymentGateway: input.paymentMethod || 'COUNTER',
            gatewayPaymentId: input.transactionReference?.trim() || `WALKIN-${Date.now()}`,
            verifiedByFinanceId: actorId,
            verifiedAt: new Date(),
          },
        });

        await tx.serviceHistoryEvent.create({
          data: {
            serviceRequestId: sr.id,
            fromStatus: initialStatus,
            toStatus: initialStatus,
            title: 'Walk-In Advance Payment Collected',
            description: `Counter payment of ₹${input.advancePaymentAmountRupees.toLocaleString('en-IN')} collected via ${input.paymentMethod || 'COUNTER'} (Ref: ${input.transactionReference || 'WALKIN'}).`,
            actorRole: 'SERVICE_ADVISOR',
            actorId,
          },
        });
      }

      // 7. History Event
      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: null,
          toStatus: initialStatus,
          title: 'Walk-In Service Booking Registered',
          description: `Offline customer ${input.customerName} registered at ${hub.name} workshop desk.${
            input.immediateIntake ? ' Immediate vehicle intake inspection recorded.' : ''
          }${input.advancePaymentAmountRupees && input.advancePaymentAmountRupees > 0 ? ` Advance of ₹${input.advancePaymentAmountRupees.toLocaleString('en-IN')} collected.` : ''}`,
          actorRole: 'SERVICE_ADVISOR',
          actorId,
        },
      });

      return sr;
    });
  }

  async approveServiceEstimateByStaff(
    actorId: string,
    requestId: string,
    estimateId: string,
    input: { decision: 'APPROVE' | 'DECLINE'; notes?: string; channel?: string }
  ) {
    const estimate = await this.db.serviceEstimate.findUnique({
      where: { id: estimateId },
      include: { serviceRequest: true },
    });
    if (!estimate || estimate.serviceRequestId !== requestId) {
      throw new HttpError(404, 'ESTIMATE_NOT_FOUND');
    }
    if (ESTIMATE_LOCKED_STATUSES.includes(estimate.serviceRequest.status)) {
      throw new HttpError(409, 'SERVICE_REQUEST_CLOSED_NO_ESTIMATE_ACTION');
    }
    // Only the live estimate can be answered: awaiting the customer, or declined and being negotiated.
    if (estimate.status !== ServiceEstimateStatus.SENT_TO_CUSTOMER && estimate.status !== ServiceEstimateStatus.DECLINED) {
      throw new HttpError(409, 'ESTIMATE_NOT_ACTIVE');
    }

    const nextEstimateStatus = input.decision === 'APPROVE' ? ServiceEstimateStatus.APPROVED : ServiceEstimateStatus.DECLINED;
    const nextRequestStatus = input.decision === 'APPROVE' ? ServiceRequestStatus.ESTIMATE_APPROVED : ServiceRequestStatus.ESTIMATE_REJECTED;

    return this.db.$transaction(async tx => {
      await tx.serviceEstimate.update({
        where: { id: estimateId },
        data: {
          status: nextEstimateStatus,
          respondedAt: new Date(),
          responseNotes: input.notes?.trim() || `Approved in-person by customer via ${input.channel || 'workshop desk'}`,
        },
      });

      await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status: nextRequestStatus },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: requestId,
          fromStatus: estimate.serviceRequest.status,
          toStatus: nextRequestStatus,
          title: input.decision === 'APPROVE' ? 'Estimate Approved (In-Person / Phone)' : 'Estimate Declined by Customer',
          description: input.decision === 'APPROVE'
            ? `Estimate v${estimate.version} totaling ₹${(Number(estimate.totalAmountPaise) / 100).toLocaleString('en-IN')} approved by customer via ${input.channel || 'workshop counter'}.`
            : `Estimate v${estimate.version} declined. Notes: ${input.notes || 'None'}.`,
          actorRole: 'SERVICE_ADVISOR',
          actorId,
        },
      });

      return { success: true, status: nextRequestStatus };
    });
  }

  async cancelOperationsServiceJob(employeeUserId: string, requestId: string, reason: string) {
    const sr = await this.db.serviceRequest.findUnique({
      where: { id: requestId },
      include: {
        customer: { select: { id: true, email: true, displayName: true } },
        vehicle: true,
      },
    });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');
    if (sr.status === ServiceRequestStatus.CANCELLED) {
      throw new HttpError(400, 'SERVICE_REQUEST_ALREADY_CANCELLED');
    }
    if (sr.status === ServiceRequestStatus.COMPLETED) {
      throw new HttpError(400, 'CANNOT_CANCEL_COMPLETED_SERVICE_REQUEST');
    }

    return this.db.$transaction(async tx => {
      // Release slot count if applicable
      const slot = await tx.serviceSlotCapacity.findUnique({
        where: {
          hubId_slotDate_slotTime: {
            hubId: sr.hubId,
            slotDate: sr.scheduledDate,
            slotTime: sr.scheduledTimeSlot,
          },
        },
      });
      if (slot && slot.bookedCount > 0) {
        await tx.serviceSlotCapacity.update({
          where: { id: slot.id },
          data: { bookedCount: { decrement: 1 } },
        });
      }

      // The job is over: a live estimate must not stay open for review or approval.
      await tx.serviceEstimate.updateMany({
        where: { serviceRequestId: sr.id, status: ServiceEstimateStatus.SENT_TO_CUSTOMER },
        data: { status: ServiceEstimateStatus.SUPERSEDED, respondedAt: new Date(), responseNotes: 'Voided: service request cancelled' },
      });

      const updated = await tx.serviceRequest.update({
        where: { id: requestId },
        data: {
          status: ServiceRequestStatus.CANCELLED,
          cancellationReason: reason.trim(),
          cancelledAt: new Date(),
          // A cancelled booking owes nothing; anything already paid is flagged for refund.
          outstandingBalancePaise: 0n,
          servicePaymentStatus: sr.verifiedPaidPaise > 0n ? 'CANCELLED_REFUND_DUE' : 'CANCELLED',
        },
        include: {
          customer: { select: { id: true, displayName: true, email: true, phone: true } },
          vehicle: true,
          hub: true,
          estimates: true,
        },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: ServiceRequestStatus.CANCELLED,
          title: 'Service Request Cancelled by Operations',
          description: `Cancelled by staff. Reason: ${reason.trim()}`,
          actorRole: 'SERVICE_MANAGER',
          actorId: employeeUserId,
        },
      });

      // Send email to customer
      if (sr.customer?.email) {
        const vehicleTitle = `${sr.vehicle.year} ${sr.vehicle.make} ${sr.vehicle.model}`.trim();
        await tx.emailOutbox.create({
          data: {
            userId: sr.customerId,
            recipient: sr.customer.email,
            templateVersion: 'service-cancelled-v1',
            eventKey: `service-cancelled/${sr.id}`,
            subject: `Service Request Cancelled [${sr.requestNumber}] · ${vehicleTitle}`,
            text: `Your workshop service booking has been cancelled.\n\nBooking: ${sr.requestNumber}\nVehicle: ${vehicleTitle}\nReason: ${reason.trim()}\n\nIf you have any questions or wish to reschedule your service, please visit the V MOTIV mobile app or email support@vmotiv.in.`,
          },
        });
      }

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'SERVICE_CANCELLED',
          actorId: employeeUserId,
          referenceId: sr.id,
          entityType: 'ServiceRequest',
          title: 'Service Request Cancelled',
          body: `Service job ${sr.requestNumber} for ${sr.vehicle.make} ${sr.vehicle.model} was cancelled.`,
          category: 'SERVICE',
          recipientUserIds: [sr.customerId],
          recipientRoles: ['SERVICE_ADVISOR', 'HUB_MANAGER', 'SERVICE_MANAGER'],
          deepLink: `vmotiv://service-requests/${sr.id}`,
        });
      }

      return updated;
    });
  }

  // OPERATIONS SERVICE HUB (ops.vmotiv.in/service)
  // -------------------------------------------------------------
  async getOperationsQueue(filters: {
    hubId?: string;
    status?: ServiceRequestStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ServiceRequestWhereInput = {};
    if (filters.hubId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.hubId)) {
      where.hubId = filters.hubId;
    }
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { requestNumber: { contains: filters.search, mode: 'insensitive' } },
        { customer: { displayName: { contains: filters.search, mode: 'insensitive' } } },
        { vehicle: { registrationNumber: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const [total, items] = await Promise.all([
      this.db.serviceRequest.count({ where }),
      this.db.serviceRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ emergencySafetyFlag: 'desc' }, { createdAt: 'desc' }],
        include: {
          customer: { select: { id: true, displayName: true, email: true, phone: true } },
          vehicle: { select: { id: true, make: true, model: true, year: true, registrationNumber: true, odometerKm: true } },
          hub: { select: { id: true, code: true, name: true, city: true } },
          estimates: {
            where: { status: { in: [ServiceEstimateStatus.SENT_TO_CUSTOMER, ServiceEstimateStatus.APPROVED] } },
            orderBy: { version: 'desc' },
            take: 1,
          },
          payments: {
            orderBy: { createdAt: 'desc' },
          },
          invoices: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      items: items.map(r => ({
        id: r.id,
        requestNumber: r.requestNumber,
        categoryKey: r.categoryKey,
        customerSymptoms: r.customerSymptoms,
        status: r.status,
        fulfillmentType: r.fulfillmentType,
        scheduledDate: r.scheduledDate,
        scheduledTimeSlot: r.scheduledTimeSlot,
        emergencySafetyFlag: r.emergencySafetyFlag,
        safetyNotes: r.safetyNotes,
        customer: r.customer,
        vehicle: r.vehicle,
        hub: r.hub,
        assignedAdvisorId: r.assignedAdvisorId,
        assignedTechnicianId: r.assignedTechnicianId,
        assignedPickupDriverId: r.assignedPickupDriverId,
        questionAnswers: safeParseJson(r.questionAnswers, {}),
        mediaUrls: safeParseJson(r.mediaUrls, []),
        activeEstimate: r.estimates[0]
          ? {
              id: r.estimates[0].id,
              version: r.estimates[0].version,
              status: r.estimates[0].status,
              totalAmountPaise: r.estimates[0].totalAmountPaise.toString(),
            }
          : null,
        estimates: r.estimates.map(e => ({
          id: e.id,
          version: e.version,
          status: e.status,
          totalAmountPaise: e.totalAmountPaise.toString(),
        })),
        payments: r.payments.map(p => ({
          id: p.id,
          type: p.type,
          amountPaise: p.amountPaise.toString(),
          status: p.status,
          paymentGateway: p.paymentGateway,
          gatewayPaymentId: p.gatewayPaymentId,
          createdAt: p.createdAt.toISOString(),
        })),
        servicePaymentStatus: r.servicePaymentStatus || 'UNPAID',
        depositStatus: r.depositStatus || 'NOT_COLLECTED',
        verifiedPaidPaise: r.verifiedPaidPaise ? r.verifiedPaidPaise.toString() : '0',
        outstandingBalancePaise: r.outstandingBalancePaise ? r.outstandingBalancePaise.toString() : '0',
        paymentPlanSnapshot: safeParseJson(r.paymentPlanSnapshot, null),
        finalInvoiceId: r.finalInvoiceId || null,
        finalInvoice: r.invoices?.[0]
          ? {
              id: r.invoices[0].id,
              invoiceNumber: r.invoices[0].invoiceNumber,
              totalAmountPaise: r.invoices[0].totalAmountPaise.toString(),
              outstandingPaise: r.invoices[0].outstandingPaise.toString(),
              status: r.invoices[0].status,
            }
          : null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async getOperationsJobDetails(requestId: string) {
    const r = await this.db.serviceRequest.findUnique({
      where: { id: requestId },
      include: {
        customer: true,
        vehicle: true,
        hub: true,
        custodyRecords: { orderBy: { recordedAt: 'asc' } },
        diagnoses: { orderBy: { createdAt: 'desc' } },
        estimates: {
          include: { items: true },
          orderBy: { version: 'desc' },
        },
        workOrders: { orderBy: { createdAt: 'desc' } },
        qcRecords: { orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' } },
        historyEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!r) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    return {
      ...r,
      questionAnswers: safeParseJson(r.questionAnswers, {}),
      mediaUrls: safeParseJson(r.mediaUrls, []),
      pickupAddress: safeParseJson(r.pickupAddress, null),
      returnAddress: safeParseJson(r.returnAddress, null),
      servicePaymentStatus: r.servicePaymentStatus || 'UNPAID',
      depositStatus: r.depositStatus || 'NOT_COLLECTED',
      verifiedPaidPaise: r.verifiedPaidPaise ? r.verifiedPaidPaise.toString() : '0',
      outstandingBalancePaise: r.outstandingBalancePaise ? r.outstandingBalancePaise.toString() : '0',
      paymentPlanSnapshot: safeParseJson(r.paymentPlanSnapshot, null),
      finalInvoiceId: r.finalInvoiceId || null,
      invoices: (r.invoices || []).map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        subtotalPaise: inv.subtotalPaise.toString(),
        diagnosticFeeCreditPaise: inv.diagnosticFeeCreditPaise.toString(),
        priorPaymentsCreditedPaise: inv.priorPaymentsCreditedPaise.toString(),
        cgstPaise: inv.cgstPaise.toString(),
        sgstPaise: inv.sgstPaise.toString(),
        totalAmountPaise: inv.totalAmountPaise.toString(),
        outstandingPaise: inv.outstandingPaise.toString(),
        status: inv.status,
        issuedAt: inv.issuedAt.toISOString(),
      })),
      estimates: r.estimates.map(e => ({
        ...e,
        subtotalPaise: e.subtotalPaise.toString(),
        pickupDropFeePaise: e.pickupDropFeePaise.toString(),
        diagnosticFeePaise: e.diagnosticFeePaise.toString(),
        discountPaise: e.discountPaise.toString(),
        cgstPaise: e.cgstPaise.toString(),
        sgstPaise: e.sgstPaise.toString(),
        totalAmountPaise: e.totalAmountPaise.toString(),
        items: e.items.map(i => ({
          ...i,
          unitPricePaise: i.unitPricePaise.toString(),
          totalPricePaise: i.totalPricePaise.toString(),
        })),
      })),
      payments: r.payments.map(p => ({
        ...p,
        amountPaise: p.amountPaise.toString(),
      })),
    };
  }

  async scheduleAppointment(
    actorId: string,
    requestId: string,
    input: { advisorId?: string; scheduledDate?: string; scheduledTimeSlot?: string }
  ) {
    const sr = await this.db.serviceRequest.findUnique({ where: { id: requestId } });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    return this.db.$transaction(async tx => {
      const updated = await tx.serviceRequest.update({
        where: { id: requestId },
        data: {
          assignedAdvisorId: input.advisorId !== undefined ? input.advisorId : sr.assignedAdvisorId,
          scheduledDate: input.scheduledDate || sr.scheduledDate,
          scheduledTimeSlot: input.scheduledTimeSlot || sr.scheduledTimeSlot,
          status: ServiceRequestStatus.APPOINTMENT_SCHEDULED,
        },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: ServiceRequestStatus.APPOINTMENT_SCHEDULED,
          title: 'Appointment Scheduled & Advisor Assigned',
          description: `Appointment confirmed for ${updated.scheduledDate} (${updated.scheduledTimeSlot}).`,
          actorRole: 'SERVICE_ADVISOR',
          actorId,
        },
      });

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'SERVICE_APPOINTMENT_SCHEDULED',
          actorId,
          referenceId: sr.id,
          entityType: 'ServiceRequest',
          title: 'Appointment Scheduled',
          body: `Your service appointment has been scheduled for ${updated.scheduledDate} at ${updated.scheduledTimeSlot}.`,
          category: 'SERVICE',
          recipientUserIds: [sr.customerId],
        });
      }

      return updated;
    });
  }

  async dispatchPickup(actorId: string, requestId: string, driverId: string) {
    const sr = await this.db.serviceRequest.findUnique({ where: { id: requestId } });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    return this.db.$transaction(async tx => {
      const updated = await tx.serviceRequest.update({
        where: { id: requestId },
        data: {
          assignedPickupDriverId: driverId,
          status: ServiceRequestStatus.PICKUP_DISPATCHED,
        },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: ServiceRequestStatus.PICKUP_DISPATCHED,
          title: 'Pickup Driver Dispatched',
          description: 'Driver assigned and dispatched to customer pickup location.',
          actorRole: 'SERVICE_DISPATCH',
          actorId,
        },
      });

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'SERVICE_PICKUP_DISPATCHED',
          actorId,
          referenceId: sr.id,
          entityType: 'ServiceRequest',
          title: 'Pickup Driver En Route',
          body: `Our pickup driver has been dispatched to collect your vehicle.`,
          category: 'SERVICE',
          recipientUserIds: [sr.customerId],
        });
      }

      return updated;
    });
  }

  async recordCustodyCheckIn(actorId: string, requestId: string, input: CustodyInput) {
    const sr = await this.db.serviceRequest.findUnique({ where: { id: requestId } });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    return this.db.$transaction(async tx => {
      const record = await tx.serviceCustodyRecord.create({
        data: {
          serviceRequestId: sr.id,
          type: input.type,
          odometerKm: input.odometerKm,
          fuelChargeLevel: input.fuelChargeLevel,
          keyCount: input.keyCount || 1,
          accessoriesJson: input.accessories ? JSON.stringify(input.accessories) : Prisma.JsonNull,
          preExistingDamageNotes: input.preExistingDamageNotes?.trim(),
          damagePhotoUrls: input.damagePhotoUrls ? JSON.stringify(input.damagePhotoUrls) : Prisma.JsonNull,
          custodyOfficerId: actorId,
          handoverByPerson: input.handoverByPerson.trim(),
          customerAcknowledged: input.customerAcknowledged ?? true,
          customerSignatureUrl: input.customerSignatureUrl,
          discrepancyNotes: input.discrepancyNotes?.trim(),
        },
      });

      // Update vehicle odometer
      await tx.customerVehicle.update({
        where: { id: sr.vehicleId },
        data: { odometerKm: input.odometerKm },
      });

      const nextStatus = ServiceRequestStatus.CHECKED_IN;
      await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status: nextStatus },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: nextStatus,
          title: 'Vehicle Custody Handover Verified (Check-In)',
          description: `Vehicle checked in at ${input.odometerKm} km, fuel/charge: ${input.fuelChargeLevel}, keys: ${input.keyCount || 1}. Condition inspect completed.`,
          actorRole: 'SERVICE_ADVISOR',
          actorId,
        },
      });

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'SERVICE_CUSTODY_CHECKIN',
          actorId,
          referenceId: sr.id,
          entityType: 'ServiceCustodyRecord',
          title: 'Vehicle Safely Checked In',
          body: `Your car has safely arrived and checked in at our service hub (${input.odometerKm} km recorded).`,
          category: 'SERVICE',
          recipientUserIds: [sr.customerId],
        });
      }

      return record;
    });
  }

  async submitDiagnosis(actorId: string, requestId: string, input: DiagnosisInput) {
    const sr = await this.db.serviceRequest.findUnique({ where: { id: requestId } });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    return this.db.$transaction(async tx => {
      const diag = await tx.serviceDiagnosis.create({
        data: {
          serviceRequestId: sr.id,
          technicianId: actorId,
          diagnosticSummary: input.diagnosticSummary.trim(),
          detailedFindings: input.detailedFindings.trim(),
          recommendedAction: input.recommendedAction.trim(),
          photosAndScans: input.photosAndScans ? JSON.stringify(input.photosAndScans) : Prisma.JsonNull,
          diagnosticFeePaise: BigInt(input.diagnosticFeePaise || 0),
          isRoadTestNeeded: input.isRoadTestNeeded ?? false,
        },
      });

      await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status: ServiceRequestStatus.DIAGNOSIS_IN_PROGRESS },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: ServiceRequestStatus.DIAGNOSIS_IN_PROGRESS,
          title: 'Technical Diagnosis Completed',
          description: `Technician findings: ${input.diagnosticSummary.trim()}`,
          actorRole: 'TECHNICIAN',
          actorId,
        },
      });

      return diag;
    });
  }

  async createEstimate(actorId: string, requestId: string, input: EstimateInput) {
    const sr = await this.db.serviceRequest.findUnique({ where: { id: requestId } });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');
    if (ESTIMATE_LOCKED_STATUSES.includes(sr.status)) {
      throw new HttpError(409, 'SERVICE_REQUEST_CLOSED_NO_ESTIMATE_ACTION');
    }
    if (!input.items || input.items.length === 0) {
      throw new HttpError(400, 'ESTIMATE_REQUIRES_AT_LEAST_ONE_LINE_ITEM');
    }

    const pickupDrop = BigInt(input.pickupDropFeePaise || 0);
    const diagnostic = BigInt(input.diagnosticFeePaise || 0);
    const discount = BigInt(input.discountPaise || 0);
    // Same arithmetic is used when a customer defers optional items (estimate-totals.ts).
    const { subtotalPaise, cgstPaise, sgstPaise, totalAmountPaise } = calculateEstimateTotals({
      items: input.items,
      pickupDropFeePaise: pickupDrop,
      diagnosticFeePaise: diagnostic,
      discountPaise: discount,
    });

    const existingCount = await this.db.serviceEstimate.count({ where: { serviceRequestId: requestId } });
    const version = existingCount + 1;
    const validUntil = new Date(Date.now() + (input.validDays || 7) * 24 * 60 * 60 * 1000);

    return this.db.$transaction(async tx => {
      // A revised estimate replaces the live one, whether it is awaiting the customer or was declined.
      await tx.serviceEstimate.updateMany({
        where: { serviceRequestId: requestId, status: { in: [ServiceEstimateStatus.SENT_TO_CUSTOMER, ServiceEstimateStatus.DECLINED] } },
        data: { status: ServiceEstimateStatus.SUPERSEDED },
      });

      const estimate = await tx.serviceEstimate.create({
        data: {
          serviceRequestId: requestId,
          version,
          status: ServiceEstimateStatus.SENT_TO_CUSTOMER,
          subtotalPaise,
          pickupDropFeePaise: pickupDrop,
          diagnosticFeePaise: diagnostic,
          discountPaise: discount,
          cgstPaise,
          sgstPaise,
          totalAmountPaise,
          customerNotes: input.customerNotes?.trim(),
          internalNotes: input.internalNotes?.trim(),
          validUntil,
          createdById: actorId,
          items: {
            create: input.items.map(item => {
              const qty = item.quantity || 1;
              const unit = BigInt(item.unitPricePaise);
              return {
                category: item.category,
                description: item.description.trim(),
                partNumber: item.partNumber?.trim(),
                quantity: qty,
                unitPricePaise: unit,
                totalPricePaise: BigInt(qty) * unit,
                isMandatory: item.isMandatory ?? true,
                isApprovedByCustomer: true,
              };
            }),
          },
        },
        include: { items: true },
      });

      await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status: ServiceRequestStatus.ESTIMATE_PENDING_APPROVAL },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: ServiceRequestStatus.ESTIMATE_PENDING_APPROVAL,
          title: sr.status === ServiceRequestStatus.ESTIMATE_REJECTED ? `Revised Service Estimate (v${version}) Issued to Customer` : `Service Estimate (v${version}) Issued to Customer`,
          description: `Total amount: ₹${(Number(totalAmountPaise) / 100).toLocaleString('en-IN')} with ${input.items.length} items. Awaiting approval.`,
          actorRole: 'SERVICE_ADVISOR',
          actorId,
        },
      });

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'SERVICE_ESTIMATE_ISSUED',
          actorId,
          referenceId: estimate.id,
          entityType: 'ServiceEstimate',
          title: 'Service Estimate Ready for Review',
          body: `A service estimate of ₹${(Number(totalAmountPaise) / 100).toLocaleString('en-IN')} has been generated for your review and approval.`,
          category: 'SERVICE',
          recipientUserIds: [sr.customerId],
          deepLink: `vmotiv://service-requests/${sr.id}`,
        });
      }

      return estimate;
    });
  }

  async createWorkOrder(actorId: string, requestId: string, input: WorkOrderInput) {
    const sr = await this.db.serviceRequest.findUnique({ where: { id: requestId } });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    return this.db.$transaction(async tx => {
      // Technicians must only see work the customer approved; deferred lines are marked do-not-perform.
      const approved = await tx.serviceEstimate.findFirst({
        where: { serviceRequestId: requestId, status: ServiceEstimateStatus.APPROVED },
        orderBy: { version: 'desc' },
        include: { items: true },
      });
      const scope = approved ? formatApprovedScope(approved.items) : '';
      const wo = await tx.serviceWorkOrder.create({
        data: {
          serviceRequestId: requestId,
          status: ServiceWorkOrderStatus.IN_PROGRESS,
          instructions: input.instructions.trim() + scope,
          assignedTechnicianId: input.assignedTechnicianId,
          startedAt: new Date(),
        },
      });

      await tx.serviceRequest.update({
        where: { id: requestId },
        data: {
          status: ServiceRequestStatus.WORK_IN_PROGRESS,
          assignedTechnicianId: input.assignedTechnicianId || sr.assignedTechnicianId,
        },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: ServiceRequestStatus.WORK_IN_PROGRESS,
          title: 'Work Order Commenced',
          description: `Technician assigned. Repairs and servicing are actively underway.`,
          actorRole: 'SERVICE_ADVISOR',
          actorId,
        },
      });

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'SERVICE_WORK_STARTED',
          actorId,
          referenceId: wo.id,
          entityType: 'ServiceWorkOrder',
          title: 'Servicing & Repairs Started',
          body: `Our certified technician has commenced work on your vehicle.`,
          category: 'SERVICE',
          recipientUserIds: [sr.customerId],
        });
      }

      return wo;
    });
  }

  async updateWorkOrderStatus(
    actorId: string,
    workOrderId: string,
    status: ServiceWorkOrderStatus,
    notes?: string,
    actualHoursSpent?: number
  ) {
    const wo = await this.db.serviceWorkOrder.findUnique({
      where: { id: workOrderId },
      include: { serviceRequest: true },
    });
    if (!wo) throw new HttpError(404, 'WORK_ORDER_NOT_FOUND');

    return this.db.$transaction(async tx => {
      const updated = await tx.serviceWorkOrder.update({
        where: { id: workOrderId },
        data: {
          status,
          technicianNotes: notes?.trim() || wo.technicianNotes,
          actualHoursSpent: actualHoursSpent !== undefined ? actualHoursSpent : wo.actualHoursSpent,
          completedAt: status === ServiceWorkOrderStatus.COMPLETED ? new Date() : wo.completedAt,
        },
      });

      if (status === ServiceWorkOrderStatus.COMPLETED) {
        await tx.serviceRequest.update({
          where: { id: wo.serviceRequestId },
          data: { status: ServiceRequestStatus.QC_PENDING },
        });

        await tx.serviceHistoryEvent.create({
          data: {
            serviceRequestId: wo.serviceRequestId,
            fromStatus: ServiceRequestStatus.WORK_IN_PROGRESS,
            toStatus: ServiceRequestStatus.QC_PENDING,
            title: 'Mechanical Work Completed · Awaiting QC',
            description: `Work order completed by technician. Transferred to independent Quality Control.`,
            actorRole: 'TECHNICIAN',
            actorId,
          },
        });
      }

      return updated;
    });
  }

  async recordQC(actorId: string, requestId: string, input: QCInput) {
    const sr = await this.db.serviceRequest.findUnique({ where: { id: requestId } });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    const isPass = input.result === ServiceQCResult.PASS;
    const nextStatus = isPass ? ServiceRequestStatus.QC_PASSED : ServiceRequestStatus.QC_REWORK_REQUIRED;

    return this.db.$transaction(async tx => {
      const qc = await tx.serviceQCRecord.create({
        data: {
          serviceRequestId: requestId,
          inspectorId: actorId,
          result: input.result,
          checklistResults: JSON.stringify(input.checklistResults),
          reworkReason: input.reworkReason?.trim(),
          notes: input.notes?.trim(),
          passedAt: isPass ? new Date() : null,
        },
      });

      await tx.serviceRequest.update({
        where: { id: requestId },
        data: {
          status: isPass ? ServiceRequestStatus.INVOICE_GENERATED : ServiceRequestStatus.WORK_IN_PROGRESS,
        },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: nextStatus,
          title: isPass ? 'Quality Control Inspection Passed' : 'QC Rework Required',
          description: isPass
            ? 'Independent quality checks passed: road test, fluid levels, fastener torque and interior cleanliness verified.'
            : `Rework flagged by QC inspector: ${input.reworkReason || 'Adjustments needed'}. Returned to technician.`,
          actorRole: 'SERVICE_QC',
          actorId,
        },
      });

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: isPass ? 'SERVICE_QC_PASSED' : 'SERVICE_QC_REWORK',
          actorId,
          referenceId: qc.id,
          entityType: 'ServiceQCRecord',
          title: isPass ? 'Quality Inspection Passed' : 'Additional Quality Adjustment Needed',
          body: isPass
            ? 'Your vehicle has passed all multi-point quality and safety checks.'
            : 'Our QC team requested a quick adjustment to meet our stringent standards.',
          category: 'SERVICE',
          recipientUserIds: [sr.customerId],
        });
      }

      return qc;
    });
  }

  async recordCustodyReturn(actorId: string, requestId: string, input: CustodyInput) {
    const sr = await this.db.serviceRequest.findUnique({ where: { id: requestId } });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    return this.db.$transaction(async tx => {
      const record = await tx.serviceCustodyRecord.create({
        data: {
          serviceRequestId: sr.id,
          type: 'CHECK_OUT',
          odometerKm: input.odometerKm,
          fuelChargeLevel: input.fuelChargeLevel,
          keyCount: input.keyCount || 1,
          accessoriesJson: input.accessories ? JSON.stringify(input.accessories) : Prisma.JsonNull,
          preExistingDamageNotes: input.preExistingDamageNotes?.trim(),
          damagePhotoUrls: input.damagePhotoUrls ? JSON.stringify(input.damagePhotoUrls) : Prisma.JsonNull,
          custodyOfficerId: actorId,
          handoverByPerson: input.handoverByPerson.trim(),
          customerAcknowledged: input.customerAcknowledged ?? true,
          customerSignatureUrl: input.customerSignatureUrl,
          discrepancyNotes: input.discrepancyNotes?.trim(),
        },
      });

      // Update vehicle last service date and odometer
      await tx.customerVehicle.update({
        where: { id: sr.vehicleId },
        data: {
          odometerKm: input.odometerKm,
          lastServiceDate: new Date(),
          nextServiceDueKm: input.odometerKm + 10000,
          nextServiceDueDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        },
      });

      // Strict Release Readiness Gate Check
      const readiness = await this.computeServiceReleaseReadiness(requestId);
      if (!readiness.canRelease) {
        throw new HttpError(403, `VEHICLE_RELEASE_GATE_BLOCKED: ${readiness.reasons.join('; ')}`);
      }

      let nextStatus: ServiceRequestStatus;
      if (sr.fulfillmentType === ServiceFulfillmentType.PICKUP_AND_RETURN) {
        nextStatus = ServiceRequestStatus.RETURN_DISPATCHED;
      } else {
        nextStatus = ServiceRequestStatus.COMPLETED;
      }

      await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status: nextStatus },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: nextStatus,
          title: nextStatus === ServiceRequestStatus.RETURN_DISPATCHED
            ? 'Vehicle Dispatched for Customer Return'
            : 'Service Completed & Vehicle Handed Over',
          description: `Handover recorded at ${input.odometerKm} km. Vehicle returned in spotless condition. All invoices settled.`,
          actorRole: 'SERVICE_ADVISOR',
          actorId,
        },
      });

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: nextStatus === ServiceRequestStatus.RETURN_DISPATCHED ? 'SERVICE_RETURN_DISPATCHED' : 'SERVICE_COMPLETED',
          actorId,
          referenceId: sr.id,
          entityType: 'ServiceRequest',
          title: nextStatus === ServiceRequestStatus.RETURN_DISPATCHED ? 'Vehicle Out for Return Delivery' : 'Service Completed',
          body: `Your vehicle service is fully completed and released.`,
          category: 'SERVICE',
          recipientUserIds: [sr.customerId],
        });
      }

      return record;
    });
  }

  // -------------------------------------------------------------
  // RELEASE READINESS & INVOICE MANAGEMENT
  // -------------------------------------------------------------
  async computeServiceReleaseReadiness(requestId: string) {
    const sr = await this.db.serviceRequest.findUnique({
      where: { id: requestId },
      include: {
        qcRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
        estimates: { orderBy: { version: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' }, take: 1 },
        payments: { where: { status: ServicePaymentStatus.PAID_VERIFIED } },
      },
    });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    const reasons: string[] = [];
    const latestQc = sr.qcRecords[0];
    const isQcPassed = latestQc ? latestQc.result === ServiceQCResult.PASS : false;
    if (!isQcPassed) {
      reasons.push('Quality control inspection has not been completed and passed.');
    }

    const hasEstimates = sr.estimates.length > 0;
    const approvedEstimate = sr.estimates.find(e => e.status === ServiceEstimateStatus.APPROVED);
    const isEstimateApproved = !hasEstimates || Boolean(approvedEstimate);
    if (!isEstimateApproved) {
      reasons.push('Service estimate has not been approved by the customer.');
    }

    const latestInvoice = sr.invoices[0];
    const isInvoiceIssued = Boolean(latestInvoice);
    if (!isInvoiceIssued) {
      reasons.push('Final tax invoice has not been generated.');
    }

    const totalVerifiedPaid = sr.payments.reduce((acc, p) => acc + p.amountPaise, 0n);
    const billAmount = latestInvoice
      ? latestInvoice.totalAmountPaise
      : (approvedEstimate ? approvedEstimate.totalAmountPaise : sr.outstandingBalancePaise);
    const outstandingPaise = billAmount > totalVerifiedPaid ? billAmount - totalVerifiedPaid : 0n;
    const isPaymentSettled = billAmount > 0n ? outstandingPaise === 0n : totalVerifiedPaid > 0n;
    if (!isPaymentSettled && billAmount > 0n) {
      reasons.push(`Outstanding balance of ₹${(Number(outstandingPaise) / 100).toLocaleString('en-IN')} must be settled.`);
    }

    const canRelease = isQcPassed && isEstimateApproved && isInvoiceIssued && isPaymentSettled;

    return {
      canRelease,
      reasons,
      gateChecks: {
        qcPassed: isQcPassed,
        estimateApproved: isEstimateApproved,
        invoiceIssued: isInvoiceIssued,
        paymentSettled: isPaymentSettled,
      },
      billAmountPaise: billAmount.toString(),
      totalVerifiedPaidPaise: totalVerifiedPaid.toString(),
      outstandingBalancePaise: outstandingPaise.toString(),
    };
  }

  async generateServiceInvoice(
    officerId: string,
    requestId: string,
    input?: { customDiscountPaise?: bigint | number; notes?: string }
  ) {
    const sr = await this.db.serviceRequest.findUnique({
      where: { id: requestId },
      include: {
        customer: true,
        vehicle: true,
        hub: true,
        estimates: {
          include: { items: true },
          orderBy: { version: 'desc' },
        },
        payments: {
          where: { status: ServicePaymentStatus.PAID_VERIFIED },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    const approvedEstimate = sr.estimates.find(e => e.status === ServiceEstimateStatus.APPROVED) || sr.estimates[0];
    let subtotalPaise = 0n;
    let estimateId: string | null = null;

    if (approvedEstimate) {
      subtotalPaise = approvedEstimate.subtotalPaise;
      estimateId = approvedEstimate.id;
    } else {
      const template = await this.db.serviceIssueTemplate.findUnique({ where: { categoryKey: sr.categoryKey } });
      const resolved = template ? resolveEffectiveCategoryPricing(template, sr.hubId) : null;
      if (resolved && resolved.packagePricePaise) {
        subtotalPaise = resolved.packagePricePaise;
      } else {
        subtotalPaise = 0n;
      }
    }

    const customDiscount = input?.customDiscountPaise ? BigInt(input.customDiscountPaise) : 0n;

    // Diagnostic fee credit
    const diagnosticPayment = sr.payments.find(p => p.type === 'DIAGNOSTIC_FEE');
    const diagnosticFeeCreditPaise = diagnosticPayment ? diagnosticPayment.amountPaise : 0n;

    // Prepayments credited: booking advance, parts advance, walk-in advance
    const priorPaymentsCreditedPaise = sr.payments
      .filter(p => p.type !== 'DIAGNOSTIC_FEE')
      .reduce((acc, p) => acc + p.amountPaise, 0n);

    const totalCredits = diagnosticFeeCreditPaise + priorPaymentsCreditedPaise;

    // 18% GST (9% CGST + 9% SGST)
    const taxableBase = subtotalPaise > customDiscount ? subtotalPaise - customDiscount : 0n;
    const cgstPaise = (taxableBase * 9n) / 100n;
    const sgstPaise = (taxableBase * 9n) / 100n;
    const totalAmountPaise = taxableBase + cgstPaise + sgstPaise;

    const outstandingPaise = totalAmountPaise > totalCredits ? totalAmountPaise - totalCredits : 0n;

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = Math.floor(1000 + Math.random() * 9000).toString();
    const invoiceNumber = `INV-${sr.requestNumber}-${randomHex}`;

    return this.db.$transaction(async tx => {
      const invoice = await tx.serviceInvoice.create({
        data: {
          invoiceNumber,
          serviceRequestId: sr.id,
          customerId: sr.customerId,
          estimateId,
          subtotalPaise,
          diagnosticFeeCreditPaise,
          priorPaymentsCreditedPaise,
          cgstPaise,
          sgstPaise,
          totalAmountPaise,
          outstandingPaise,
          status: outstandingPaise === 0n ? 'PAID' : 'ISSUED',
          issuedById: officerId,
        },
      });

      const isFullyPaid = outstandingPaise === 0n;
      const nextPaymentStatus = isFullyPaid ? 'PAID_IN_FULL' : (totalCredits > 0n ? 'PARTIALLY_PAID' : 'UNPAID');
      const nextRequestStatus = isFullyPaid ? ServiceRequestStatus.PAID : ServiceRequestStatus.PAYMENT_PENDING;

      await tx.serviceRequest.update({
        where: { id: sr.id },
        data: {
          finalInvoiceId: invoice.id,
          outstandingBalancePaise: outstandingPaise,
          servicePaymentStatus: nextPaymentStatus,
          status: nextRequestStatus,
        },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: nextRequestStatus,
          title: 'Final Tax Invoice Generated',
          description: `Invoice ${invoiceNumber} issued for ₹${(Number(totalAmountPaise) / 100).toLocaleString('en-IN')}. Prior payments & diagnostic fee credited: ₹${(Number(totalCredits) / 100).toLocaleString('en-IN')}. Outstanding balance: ₹${(Number(outstandingPaise) / 100).toLocaleString('en-IN')}.`,
          actorRole: 'SERVICE_ADVISOR',
          actorId: officerId,
        },
      });

      return {
        ...invoice,
        subtotalPaise: invoice.subtotalPaise.toString(),
        diagnosticFeeCreditPaise: invoice.diagnosticFeeCreditPaise.toString(),
        priorPaymentsCreditedPaise: invoice.priorPaymentsCreditedPaise.toString(),
        cgstPaise: invoice.cgstPaise.toString(),
        sgstPaise: invoice.sgstPaise.toString(),
        totalAmountPaise: invoice.totalAmountPaise.toString(),
        outstandingPaise: invoice.outstandingPaise.toString(),
      };
    });
  }

  async getServicePaymentSummary(requestId: string) {
    const sr = await this.db.serviceRequest.findUnique({
      where: { id: requestId },
      include: {
        customer: true,
        vehicle: true,
        estimates: {
          include: { items: true },
          orderBy: { version: 'desc' },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    const template = await this.db.serviceIssueTemplate.findUnique({ where: { categoryKey: sr.categoryKey } });
    const resolved = template ? resolveEffectiveCategoryPricing(template, sr.hubId) : null;
    const packagePricePaise = resolved?.packagePricePaise || 0n;

    const approvedEstimate = sr.estimates.find(e => e.status === ServiceEstimateStatus.APPROVED) || sr.estimates[0];
    const latestInvoice = sr.invoices[0];

    const verifiedPayments = sr.payments.filter(p => p.status === ServicePaymentStatus.PAID_VERIFIED);
    const totalVerifiedPaidPaise = verifiedPayments.reduce((acc, p) => acc + p.amountPaise, 0n);

    const diagnosticPayment = verifiedPayments.find(p => p.type === 'DIAGNOSTIC_FEE');
    const diagnosticFeePaise = diagnosticPayment ? diagnosticPayment.amountPaise : 0n;

    const totalBillPaise = latestInvoice
      ? latestInvoice.totalAmountPaise
      : (approvedEstimate ? approvedEstimate.totalAmountPaise : packagePricePaise);

    const outstandingBalancePaise = totalBillPaise > totalVerifiedPaidPaise ? totalBillPaise - totalVerifiedPaidPaise : 0n;

    const readiness = await this.computeServiceReleaseReadiness(requestId);

    return {
      requestId: sr.id,
      requestNumber: sr.requestNumber,
      categoryKey: sr.categoryKey,
      categoryTitle: template?.title || sr.categoryKey,
      packagePricePaise: packagePricePaise.toString(),
      estimateTotalPaise: approvedEstimate ? approvedEstimate.totalAmountPaise.toString() : '0',
      totalBillPaise: totalBillPaise.toString(),
      diagnosticFeePaise: diagnosticFeePaise.toString(),
      diagnosticFeeCreditedPaise: latestInvoice ? latestInvoice.diagnosticFeeCreditPaise.toString() : diagnosticFeePaise.toString(),
      verifiedPaidPaise: totalVerifiedPaidPaise.toString(),
      outstandingBalancePaise: outstandingBalancePaise.toString(),
      servicePaymentStatus: sr.servicePaymentStatus || (outstandingBalancePaise === 0n && totalBillPaise > 0n ? 'PAID_IN_FULL' : (totalVerifiedPaidPaise > 0n ? 'PARTIALLY_PAID' : 'UNPAID')),
      depositStatus: sr.depositStatus || 'NOT_COLLECTED',
      paymentPlanSnapshot: safeParseJson(sr.paymentPlanSnapshot, null),
      finalInvoice: latestInvoice
        ? {
            id: latestInvoice.id,
            invoiceNumber: latestInvoice.invoiceNumber,
            subtotalPaise: latestInvoice.subtotalPaise.toString(),
            cgstPaise: latestInvoice.cgstPaise.toString(),
            sgstPaise: latestInvoice.sgstPaise.toString(),
            diagnosticFeeCreditPaise: latestInvoice.diagnosticFeeCreditPaise.toString(),
            priorPaymentsCreditedPaise: latestInvoice.priorPaymentsCreditedPaise.toString(),
            totalAmountPaise: latestInvoice.totalAmountPaise.toString(),
            outstandingPaise: latestInvoice.outstandingPaise.toString(),
            status: latestInvoice.status,
            issuedAt: latestInvoice.issuedAt.toISOString(),
          }
        : null,
      invoices: sr.invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        totalAmountPaise: inv.totalAmountPaise.toString(),
        outstandingPaise: inv.outstandingPaise.toString(),
        status: inv.status,
        issuedAt: inv.issuedAt.toISOString(),
      })),
      payments: sr.payments.map(p => ({
        id: p.id,
        type: p.type,
        installmentType: p.installmentType,
        amountPaise: p.amountPaise.toString(),
        status: p.status,
        paymentGateway: p.paymentGateway,
        gatewayOrderId: p.gatewayOrderId,
        gatewayPaymentId: p.gatewayPaymentId,
        createdAt: p.createdAt.toISOString(),
        verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
      })),
      releaseReadiness: readiness,
    };
  }

  async getServicePaymentHistory(requestId: string) {
    const payments = await this.db.servicePaymentRecord.findMany({
      where: { serviceRequestId: requestId },
      orderBy: { createdAt: 'desc' },
    });
    return payments.map(p => ({
      id: p.id,
      type: p.type,
      installmentType: p.installmentType,
      amountPaise: p.amountPaise.toString(),
      status: p.status,
      paymentGateway: p.paymentGateway,
      gatewayOrderId: p.gatewayOrderId,
      gatewayPaymentId: p.gatewayPaymentId,
      createdAt: p.createdAt.toISOString(),
      verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
    }));
  }

  async verifyCustomerGatewayPayment(
    customerId: string,
    requestId: string,
    input: {
      gatewayOrderId: string;
      gatewayPaymentId: string;
      gatewaySignature: string;
      paymentGateway?: string;
      installmentType?: string;
      amountPaise?: bigint | number;
    }
  ) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');
    }
    const sr = await this.db.serviceRequest.findFirst({
      where: { id: requestId, customerId },
      include: {
        payments: true,
        invoices: { orderBy: { createdAt: 'desc' }, take: 1 },
        estimates: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    // Idempotency check: if payment ID already verified
    const existingVerified = sr.payments.find(
      p => p.gatewayPaymentId === input.gatewayPaymentId && p.status === ServicePaymentStatus.PAID_VERIFIED
    );
    if (existingVerified) {
      return { success: true, paymentId: existingVerified.id, alreadyVerified: true };
    }

    // Signature verification
    assertGatewayPaymentSignature(input);

    // Determine amount
    const claimedPaise = input.amountPaise ? BigInt(input.amountPaise) : null;
    // Production: the recorded amount is what the gateway actually captured, never the client claim.
    const capturedPaise = await assertCapturedAmount(input, claimedPaise, { exact: claimedPaise !== null });
    const amountPaise = capturedPaise ?? claimedPaise ?? (sr.outstandingBalancePaise > 0n ? sr.outstandingBalancePaise : 0n);

    // A gateway payment id can settle exactly one service request.
    const reused = await this.db.servicePaymentRecord.findFirst({
      where: { gatewayPaymentId: input.gatewayPaymentId, serviceRequestId: { not: sr.id } },
      select: { id: true },
    });
    if (reused) throw new HttpError(409, 'PAYMENT_ALREADY_USED');


    return this.db.$transaction(async tx => {
      const payment = await tx.servicePaymentRecord.create({
        data: {
          serviceRequestId: sr.id,
          type: input.installmentType === 'DIAGNOSTIC_FEE' ? 'DIAGNOSTIC_FEE' : (input.installmentType === 'BALANCE' ? 'FINAL_SETTLEMENT' : 'BOOKING_ADVANCE'),
          installmentType: input.installmentType || 'BALANCE',
          amountPaise,
          status: ServicePaymentStatus.PAID_VERIFIED,
          paymentGateway: input.paymentGateway || 'RAZORPAY',
          gatewayOrderId: input.gatewayOrderId,
          gatewayPaymentId: input.gatewayPaymentId,
          gatewaySignature: input.gatewaySignature,
          idempotencyKey: `sig_${sr.id}_${input.gatewayPaymentId}`,
          verifiedAt: new Date(),
        },
      });

      const allVerified = await tx.servicePaymentRecord.findMany({
        where: { serviceRequestId: sr.id, status: ServicePaymentStatus.PAID_VERIFIED },
      });
      const totalVerified = allVerified.reduce((acc, p) => acc + p.amountPaise, 0n);

      const latestInvoice = sr.invoices[0];
      const totalBill = latestInvoice ? latestInvoice.totalAmountPaise : (sr.estimates[0] ? sr.estimates[0].totalAmountPaise : sr.outstandingBalancePaise);
      const newOutstanding = totalBill > totalVerified ? totalBill - totalVerified : 0n;

      const isFullyPaid = newOutstanding === 0n;
      const newPaymentStatus = isFullyPaid ? 'PAID_IN_FULL' : 'PARTIALLY_PAID';
      const nextRequestStatus = isFullyPaid ? ServiceRequestStatus.PAID : sr.status;

      await tx.serviceRequest.update({
        where: { id: sr.id },
        data: {
          verifiedPaidPaise: totalVerified,
          outstandingBalancePaise: newOutstanding,
          servicePaymentStatus: newPaymentStatus,
          status: nextRequestStatus,
        },
      });

      if (latestInvoice) {
        await tx.serviceInvoice.update({
          where: { id: latestInvoice.id },
          data: {
            outstandingPaise: newOutstanding,
            status: isFullyPaid ? 'PAID' : 'ISSUED',
          },
        });
      }

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: nextRequestStatus,
          title: 'Payment Verified Online',
          description: `Customer payment of ₹${(Number(amountPaise) / 100).toLocaleString('en-IN')} verified successfully via ${input.paymentGateway || 'Razorpay'}. Reference: ${input.gatewayPaymentId}. Outstanding balance: ₹${(Number(newOutstanding) / 100).toLocaleString('en-IN')}.`,
          actorRole: 'CUSTOMER',
          actorId: customerId,
        },
      });

      return {
        success: true,
        paymentId: payment.id,
        verifiedPaidPaise: totalVerified.toString(),
        outstandingBalancePaise: newOutstanding.toString(),
        servicePaymentStatus: newPaymentStatus,
        requestStatus: nextRequestStatus,
      };
    });
  }

  // -------------------------------------------------------------
  // FINANCE & PAYMENTS
  // -------------------------------------------------------------
  async recordPayment(
    actorId: string,
    requestId: string,
    input: {
      type: 'DIAGNOSTIC_FEE' | 'ADVANCE' | 'FINAL_SETTLEMENT';
      amountPaise: number | bigint;
      paymentGateway?: string;
      gatewayOrderId?: string;
      gatewayPaymentId?: string;
      autoVerify?: boolean;
      notes?: string;
    }
  ) {
    const sr = await this.db.serviceRequest.findUnique({
      where: { id: requestId },
      include: {
        invoices: { orderBy: { createdAt: 'desc' }, take: 1 },
        estimates: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!sr) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');

    return this.db.$transaction(async tx => {
      const isAutoVerify = Boolean(input.autoVerify ?? true);
      const paymentStatus = isAutoVerify ? ServicePaymentStatus.PAID_VERIFIED : ServicePaymentStatus.PENDING;
      const amountPaise = BigInt(input.amountPaise);

      const payment = await tx.servicePaymentRecord.create({
        data: {
          serviceRequestId: requestId,
          type: input.type,
          installmentType: input.type,
          amountPaise,
          status: paymentStatus,
          paymentGateway: input.paymentGateway || 'COUNTER',
          gatewayOrderId: input.gatewayOrderId,
          gatewayPaymentId: input.gatewayPaymentId || `COUNTER-${Date.now()}`,
          verifiedByFinanceId: isAutoVerify ? actorId : null,
          verifiedAt: isAutoVerify ? new Date() : null,
        },
      });

      // Recompute verified totals
      const allVerified = await tx.servicePaymentRecord.findMany({
        where: { serviceRequestId: requestId, status: ServicePaymentStatus.PAID_VERIFIED },
      });
      const totalVerifiedPaise = allVerified.reduce((acc, p) => acc + p.amountPaise, 0n);

      const latestInvoice = sr.invoices[0];
      const totalBill = latestInvoice ? latestInvoice.totalAmountPaise : (sr.estimates[0] ? sr.estimates[0].totalAmountPaise : sr.outstandingBalancePaise);
      const newOutstanding = totalBill > totalVerifiedPaise ? totalBill - totalVerifiedPaise : 0n;

      const isFullySettled = newOutstanding === 0n;
      const newPaymentStatus = isFullySettled ? 'PAID_IN_FULL' : (totalVerifiedPaise > 0n ? 'PARTIALLY_PAID' : 'UNPAID');

      // Check custody check-out
      const hasCheckout = await tx.serviceCustodyRecord.findFirst({
        where: { serviceRequestId: requestId, type: 'CHECK_OUT' },
      });

      let nextRequestStatus: ServiceRequestStatus = isFullySettled ? ServiceRequestStatus.PAID : ServiceRequestStatus.PAYMENT_PENDING;
      if (isFullySettled && hasCheckout) {
        nextRequestStatus = ServiceRequestStatus.COMPLETED;
      }

      await tx.serviceRequest.update({
        where: { id: requestId },
        data: {
          status: nextRequestStatus,
          verifiedPaidPaise: totalVerifiedPaise,
          outstandingBalancePaise: newOutstanding,
          servicePaymentStatus: newPaymentStatus,
        },
      });

      if (latestInvoice) {
        await tx.serviceInvoice.update({
          where: { id: latestInvoice.id },
          data: {
            outstandingPaise: newOutstanding,
            status: isFullySettled ? 'PAID' : 'ISSUED',
          },
        });
      }

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRequestId: sr.id,
          fromStatus: sr.status,
          toStatus: nextRequestStatus,
          title: isAutoVerify ? 'Counter Payment Recorded & Verified' : `Payment Initiated (${input.type})`,
          description: isAutoVerify
            ? `Counter payment of ₹${(Number(amountPaise) / 100).toLocaleString('en-IN')} recorded via ${input.paymentGateway || 'COUNTER'} (Ref: ${input.gatewayPaymentId || 'COUNTER'}). Balance remaining: ₹${(Number(newOutstanding) / 100).toLocaleString('en-IN')}.`
            : `Amount: ₹${(Number(amountPaise) / 100).toLocaleString('en-IN')}. Awaiting Finance verification.`,
          actorRole: 'SERVICE_ADVISOR',
          actorId,
        },
      });

      return payment;
    });
  }

  async verifyServicePayment(
    financeActorId: string,
    paymentId: string,
    input: { verified: boolean; notes?: string }
  ) {
    const payment = await this.db.servicePaymentRecord.findUnique({
      where: { id: paymentId },
      include: {
        serviceRequest: {
          include: {
            invoices: { orderBy: { createdAt: 'desc' }, take: 1 },
            estimates: { orderBy: { version: 'desc' }, take: 1 },
          },
        },
      },
    });
    if (!payment) throw new HttpError(404, 'PAYMENT_RECORD_NOT_FOUND');

    const newStatus = input.verified ? ServicePaymentStatus.PAID_VERIFIED : ServicePaymentStatus.FAILED;

    return this.db.$transaction(async tx => {
      const updatedPayment = await tx.servicePaymentRecord.update({
        where: { id: paymentId },
        data: {
          status: newStatus,
          verifiedByFinanceId: financeActorId,
          verifiedAt: new Date(),
        },
      });

      if (input.verified) {
        const sr = payment.serviceRequest;
        const allVerified = await tx.servicePaymentRecord.findMany({
          where: { serviceRequestId: sr.id, status: ServicePaymentStatus.PAID_VERIFIED },
        });
        const totalVerified = allVerified.reduce((acc, p) => acc + p.amountPaise, 0n);

        const latestInvoice = sr.invoices[0];
        const totalBill = latestInvoice ? latestInvoice.totalAmountPaise : (sr.estimates[0] ? sr.estimates[0].totalAmountPaise : sr.outstandingBalancePaise);
        const newOutstanding = totalBill > totalVerified ? totalBill - totalVerified : 0n;
        const isFullyPaid = newOutstanding === 0n;

        await tx.serviceRequest.update({
          where: { id: sr.id },
          data: {
            verifiedPaidPaise: totalVerified,
            outstandingBalancePaise: newOutstanding,
            servicePaymentStatus: isFullyPaid ? 'PAID_IN_FULL' : 'PARTIALLY_PAID',
            status: isFullyPaid ? ServiceRequestStatus.PAID : sr.status,
          },
        });

        if (latestInvoice) {
          await tx.serviceInvoice.update({
            where: { id: latestInvoice.id },
            data: {
              outstandingPaise: newOutstanding,
              status: isFullyPaid ? 'PAID' : 'ISSUED',
            },
          });
        }

        await tx.serviceHistoryEvent.create({
          data: {
            serviceRequestId: payment.serviceRequestId,
            fromStatus: payment.serviceRequest.status,
            toStatus: isFullyPaid ? ServiceRequestStatus.PAID : payment.serviceRequest.status,
            title: 'Payment Verified by Finance',
            description: `Payment of ₹${(Number(payment.amountPaise) / 100).toLocaleString('en-IN')} verified. Outstanding balance: ₹${(Number(newOutstanding) / 100).toLocaleString('en-IN')}.`,
            actorRole: 'FINANCE',
            actorId: financeActorId,
          },
        });

        if (this.notifications) {
          void this.notifications.dispatchDomainEvent({
            type: 'SERVICE_PAYMENT_VERIFIED',
            actorId: financeActorId,
            referenceId: payment.id,
            entityType: 'ServicePaymentRecord',
            title: 'Payment Verified',
            body: `Your payment of ₹${(Number(payment.amountPaise) / 100).toLocaleString('en-IN')} has been verified by our accounts department.`,
            category: 'SERVICE',
            recipientUserIds: [payment.serviceRequest.customerId],
          });
        }
      }

      return updatedPayment;
    });
  }
}
