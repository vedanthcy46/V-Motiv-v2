import { describe, expect, it } from 'vitest';
import { assertServiceStep, serviceStepState, serviceSteps } from '../src/service-steps.js';

const job = (status: string, fulfillmentType = 'SELF_DROP_AT_HUB') => ({ status, fulfillmentType });

describe('service job step order', () => {
  it('opens one step at a time along the normal path', () => {
    const open = (status: string, fulfillment?: string) => Object.entries(serviceSteps(job(status, fulfillment))).filter(([, s]) => s.open).map(([k]) => k);
    expect(open('SUBMITTED')).toEqual(['SCHEDULE']);
    expect(open('APPOINTMENT_SCHEDULED')).toEqual(['SCHEDULE', 'CHECK_IN']);
    expect(open('CHECKED_IN')).toEqual(['DIAGNOSIS', 'ESTIMATE']);
    expect(open('DIAGNOSIS_IN_PROGRESS')).toEqual(['DIAGNOSIS', 'ESTIMATE']);
    expect(open('ESTIMATE_PENDING_APPROVAL')).toEqual(['ESTIMATE']);
    expect(open('ESTIMATE_APPROVED')).toEqual(['WORK_ORDER', 'QC']);
    expect(open('QC_PENDING')).toEqual(['QC']);
    expect(open('INVOICE_GENERATED')).toEqual(['INVOICE', 'RELEASE']);
  });

  it('keeps the work waiting for the customer to accept the estimate', () => {
    expect(serviceStepState('WORK_ORDER', job('ESTIMATE_PENDING_APPROVAL'))).toMatchObject({ open: false });
    expect(serviceStepState('QC', job('ESTIMATE_PENDING_APPROVAL'))).toMatchObject({ open: false });
    expect(serviceStepState('WORK_ORDER', job('ESTIMATE_REJECTED'))).toMatchObject({ open: false });
    expect(() => assertServiceStep('WORK_ORDER', job('ESTIMATE_PENDING_APPROVAL'))).toThrowError(/accept the estimate/);
  });

  it('needs the pickup dispatched for doorstep jobs, and never offers pickup for drop-offs', () => {
    expect(serviceStepState('CHECK_IN', job('APPOINTMENT_SCHEDULED', 'PICKUP_AND_RETURN')).open).toBe(false);
    expect(serviceStepState('DISPATCH_PICKUP', job('APPOINTMENT_SCHEDULED', 'PICKUP_AND_RETURN')).open).toBe(true);
    expect(serviceStepState('CHECK_IN', job('PICKUP_DISPATCHED', 'PICKUP_AND_RETURN')).open).toBe(true);
    expect(serviceStepState('DISPATCH_PICKUP', job('APPOINTMENT_SCHEDULED')).open).toBe(false);
  });

  it('cannot invoice before quality control passes or hand the car back before the invoice', () => {
    expect(serviceStepState('INVOICE', job('QC_PENDING')).open).toBe(false);
    expect(serviceStepState('RELEASE', job('WORK_IN_PROGRESS')).open).toBe(false);
    expect(serviceStepState('QC', job('ESTIMATE_PENDING_APPROVAL')).open).toBe(false);
    expect(serviceStepState('QC', job('CHECKED_IN')).open).toBe(false);
  });

  it('tells a step not reached yet from one already behind the job', () => {
    expect(serviceStepState('QC', job('CHECKED_IN')).phase).toBe('locked');
    expect(serviceStepState('SCHEDULE', job('CHECKED_IN')).phase).toBe('done');
    expect(serviceStepState('CHECK_IN', job('ESTIMATE_APPROVED')).phase).toBe('done');
    expect(serviceStepState('DISPATCH_PICKUP', job('APPOINTMENT_SCHEDULED')).phase).toBe('not_applicable');
    expect(serviceStepState('ESTIMATE', job('APPOINTMENT_SCHEDULED')).phase).toBe('locked');
  });

  it('locks everything on a finished or cancelled job', () => {
    for (const status of ['COMPLETED', 'CANCELLED']) expect(Object.values(serviceSteps(job(status))).every(step => !step.open)).toBe(true);
  });
});
