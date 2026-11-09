// The order of a service job. Each step opens only when the one before it is done, so a job cannot be invoiced before it was
// diagnosed, or handed back before it was paid. The same table drives the API checks and the Operations portal, which greys
// out steps that are not open yet and says what to do first.
import type { ServiceFulfillmentType, ServiceRequestStatus } from '@prisma/client';
import { HttpError } from './errors.js';

export type ServiceStep = 'SCHEDULE' | 'DISPATCH_PICKUP' | 'CHECK_IN' | 'DIAGNOSIS' | 'ESTIMATE' | 'WORK_ORDER' | 'QC' | 'INVOICE' | 'RELEASE';

type Status = ServiceRequestStatus | string;
const S = (...statuses: string[]) => statuses;

/** Statuses in which each step may be done, and what the person must finish first when it may not. */
const RULES: Record<ServiceStep, { from: (fulfillment: string) => string[]; before: string }> = {
  SCHEDULE: { from: () => S('SUBMITTED', 'APPOINTMENT_SCHEDULED'), before: 'The appointment can only be set before the car arrives.' },
  DISPATCH_PICKUP: {
    from: fulfillment => (fulfillment === 'PICKUP_AND_RETURN' ? S('APPOINTMENT_SCHEDULED', 'PICKUP_DISPATCHED') : []),
    before: 'Schedule the appointment first. Pickup applies only to doorstep jobs.',
  },
  CHECK_IN: {
    from: fulfillment => (fulfillment === 'PICKUP_AND_RETURN' ? S('PICKUP_DISPATCHED', 'IN_TRANSIT_TO_HUB', 'ARRIVED_AT_HUB') : S('APPOINTMENT_SCHEDULED', 'ARRIVED_AT_HUB')),
    before: 'Schedule the appointment (and dispatch the pickup for a doorstep job) before checking the car in.',
  },
  DIAGNOSIS: { from: () => S('CHECKED_IN', 'DIAGNOSIS_IN_PROGRESS'), before: 'Check the car in before diagnosing it.' },
  ESTIMATE: {
    from: () => S('CHECKED_IN', 'DIAGNOSIS_IN_PROGRESS', 'ESTIMATE_PENDING_APPROVAL', 'ESTIMATE_REJECTED'),
    before: 'Check the car in before preparing an estimate.',
  },
  WORK_ORDER: {
    from: () => S('ESTIMATE_APPROVED', 'PARTS_ORDERED', 'WORK_IN_PROGRESS', 'QC_REWORK_REQUIRED'),
    before: 'The customer must accept the estimate before work starts.',
  },
  QC: {
    from: () => S('ESTIMATE_APPROVED', 'PARTS_ORDERED', 'WORK_IN_PROGRESS', 'QC_PENDING', 'QC_REWORK_REQUIRED'),
    before: 'The customer must accept the estimate, and the work must be done, before quality control.',
  },
  INVOICE: { from: () => S('QC_PASSED', 'INVOICE_GENERATED', 'PAYMENT_PENDING'), before: 'Quality control must pass before the invoice is raised.' },
  RELEASE: {
    from: () => S('QC_PASSED', 'INVOICE_GENERATED', 'PAYMENT_PENDING', 'PAID', 'RETURN_DISPATCHED', 'READY_FOR_COLLECTION'),
    before: 'Quality control, the invoice and payment must be done before the car goes back.',
  },
};

/** Where a status sits along the job, so a step can be told apart as not reached yet or already behind us. */
const ORDER = ['DRAFT', 'SUBMITTED', 'APPOINTMENT_SCHEDULED', 'PICKUP_DISPATCHED', 'IN_TRANSIT_TO_HUB', 'ARRIVED_AT_HUB', 'CHECKED_IN', 'DIAGNOSIS_IN_PROGRESS',
  'ESTIMATE_PENDING_APPROVAL', 'ESTIMATE_REJECTED', 'ESTIMATE_APPROVED', 'PARTS_ORDERED', 'WORK_IN_PROGRESS', 'QC_PENDING', 'QC_REWORK_REQUIRED', 'QC_PASSED',
  'INVOICE_GENERATED', 'PAYMENT_PENDING', 'PAID', 'RETURN_DISPATCHED', 'READY_FOR_COLLECTION', 'COMPLETED'];

export type StepPhase = 'open' | 'locked' | 'done' | 'not_applicable';
export interface StepState { open: boolean; phase: StepPhase; reason: string | null }

export function serviceStepState(step: ServiceStep, job: { status: Status; fulfillmentType: ServiceFulfillmentType | string }): StepState {
  if (job.status === 'COMPLETED' || job.status === 'CANCELLED') return { open: false, phase: 'done', reason: `This job is ${String(job.status).toLowerCase()}.` };
  const rule = RULES[step];
  const allowed = rule.from(String(job.fulfillmentType));
  if (allowed.includes(String(job.status))) return { open: true, phase: 'open', reason: null };
  if (allowed.length === 0) return { open: false, phase: 'not_applicable', reason: rule.before };
  const here = ORDER.indexOf(String(job.status));
  const last = Math.max(...allowed.map(status => ORDER.indexOf(status)));
  return { open: false, phase: here > last ? 'done' : 'locked', reason: rule.before };
}

export function serviceSteps(job: { status: Status; fulfillmentType: ServiceFulfillmentType | string }): Record<ServiceStep, StepState> {
  return Object.fromEntries((Object.keys(RULES) as ServiceStep[]).map(step => [step, serviceStepState(step, job)])) as Record<ServiceStep, StepState>;
}

/** Refuse a step that is not open yet. */
export function assertServiceStep(step: ServiceStep, job: { status: Status; fulfillmentType: ServiceFulfillmentType | string }): void {
  const state = serviceStepState(step, job);
  if (!state.open) throw new HttpError(409, 'SERVICE_STEP_OUT_OF_ORDER', state.reason ?? 'This step is not open yet.');
}
