// The event catalog: for every business event that can notify an employee, WHO it is for, how urgent it is, how it is delivered and
// where it links. These are the code defaults (policy version 0); a row in NotificationRoutingPolicy with a higher version replaces one
// (see routing-policy.ts). Event names are the backend's own (notification/types.ts); `emitted` says whether the code raises the event today.
import type { NotificationModule } from './routes.js';

export type Severity = 'CRITICAL' | 'ACTION_REQUIRED' | 'INFORMATIONAL';
export type Channel = 'IN_APP' | 'PUSH' | 'EMAIL';
export type RecipientStrategy =
  | 'ASSIGNED_EMPLOYEE'
  | 'ASSIGNED_TEAM'
  | 'BRANCH_QUEUE_OWNER'
  | 'DESIGNATED_APPROVER'
  | 'FINANCE_CASE_OWNER'
  | 'INSPECTOR_ASSIGNEE'
  | 'ADMIN_RESPONDER'
  | 'AUTHORIZED_SUBSCRIBERS';
export type BranchScope = 'BRANCH' | 'GLOBAL' | 'ASSIGNED';

export interface EventDefinition {
  eventType: string;
  module: NotificationModule;
  /** The record the notification is about (also what "resolved" is judged against). */
  resourceType: string;
  /** Recipients are every strategy's result, de-duplicated. The first one is the primary. */
  strategies: RecipientStrategy[];
  /** An employee must hold this permission, or one of `requiredRoles`, to be eligible (assignees are exempt: the business gave them the work). */
  requiredPermission?: string;
  requiredRoles?: string[];
  /** The work queue whose owners and subscribers receive it when nobody is assigned. */
  queueKey?: string;
  branchScope: BranchScope;
  severity: Severity;
  channels: Channel[];
  requiresAck: boolean;
  escalationPolicyKey?: string;
  /** The same event for the same record inside this window is one notification. */
  dedupWindowMinutes: number;
  /** Fields of the event payload that may appear in a template or be stored. Everything else is dropped. */
  allowedFields: string[];
  title: (vars: Vars) => string;
  body: (vars: Vars) => string;
  route: (resourceId: string, vars: Vars) => string;
  emitted: boolean;
  note?: string;
}

export type Vars = Record<string, string | number | boolean | null | undefined>;

const ref = (v: Vars, fallback: string) => (v.referenceCode ? String(v.referenceCode) : fallback);
const car = (v: Vars) => (v.vehicle ? String(v.vehicle) : 'a vehicle');

const base = { branchScope: 'BRANCH' as BranchScope, dedupWindowMinutes: 0, requiresAck: false };
const FIELDS = ['referenceCode', 'vehicle', 'reasonCode', 'dueAt', 'count', 'status'];

export const EVENT_CATALOG: EventDefinition[] = [
  // ---------------------------------------------------------------- SALES
  { ...base, eventType: 'LEAD_ASSIGNED', module: 'SALES', resourceType: 'AcquisitionLead', strategies: ['ASSIGNED_EMPLOYEE'], branchScope: 'ASSIGNED', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: true, escalationPolicyKey: 'SALES_LEAD_FIRST_RESPONSE', allowedFields: FIELDS,
    title: () => 'A seller lead is assigned to you', body: v => `${ref(v, 'A lead')} (${car(v)}) is waiting for your first response.`, route: id => `/seller-leads/${id}`, emitted: true },
  { ...base, eventType: 'CUSTOMER_SELL_SUBMITTED', module: 'SALES', resourceType: 'AcquisitionLead', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'SALES_LEADS', requiredRoles: ['SALES_EXECUTIVE'], severity: 'ACTION_REQUIRED', channels: ['IN_APP'], dedupWindowMinutes: 10, escalationPolicyKey: 'SALES_LEAD_UNASSIGNED', allowedFields: FIELDS,
    title: () => 'New seller lead in your branch', body: v => `${ref(v, 'A seller lead')} (${car(v)}) needs an owner.`, route: id => `/seller-leads/${id}`, emitted: true },
  { ...base, eventType: 'LEAD_UNASSIGNED_OVERDUE', module: 'SALES', resourceType: 'AcquisitionLead', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'SALES_LEADS', requiredRoles: ['SALES_EXECUTIVE'], severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: true, dedupWindowMinutes: 240, allowedFields: FIELDS,
    title: () => 'A seller lead has no owner', body: v => `${ref(v, 'A seller lead')} has waited too long without being assigned.`, route: id => `/seller-leads/${id}`, emitted: true, note: 'Raised by the SLA detector.' },
  { ...base, eventType: 'BUYER_ENQUIRY_SUBMITTED', module: 'SALES', resourceType: 'PurchaseEnquiry', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'SALES_LEADS', requiredRoles: ['SALES_EXECUTIVE'], severity: 'ACTION_REQUIRED', channels: ['IN_APP'], dedupWindowMinutes: 10, allowedFields: FIELDS,
    title: () => 'New buyer enquiry', body: v => `An enquiry on ${car(v)} is waiting for a response.`, route: id => `/buyer-leads/${id}`, emitted: true },
  { ...base, eventType: 'SALES_FOLLOW_UP_DUE', module: 'SALES', resourceType: 'SalesTask', strategies: ['ASSIGNED_EMPLOYEE'], branchScope: 'ASSIGNED', severity: 'ACTION_REQUIRED', channels: ['IN_APP'], dedupWindowMinutes: 720, allowedFields: FIELDS,
    title: () => 'A follow-up is due', body: v => `A follow-up task${v.referenceCode ? ` for ${v.referenceCode}` : ''} is due.`, route: () => '/tasks', emitted: true, note: 'Raised by the follow-up detector.' },
  { ...base, eventType: 'INSPECTION_REVIEW_APPROVED', module: 'SALES', resourceType: 'AcquisitionLead', strategies: ['ASSIGNED_EMPLOYEE'], branchScope: 'ASSIGNED', severity: 'ACTION_REQUIRED', channels: ['IN_APP'], allowedFields: FIELDS,
    title: () => 'The inspection report is approved', body: v => `The reviewed inspection for ${ref(v, 'your lead')} is ready. You can propose an offer.`, route: id => `/seller-leads/${id}`, emitted: false, note: 'Staff leg of the existing inspection-approved event is not yet separated from the customer one.' },
  { ...base, eventType: 'ACQUISITION_OFFER_APPROVED', module: 'SALES', resourceType: 'AcquisitionLead', strategies: ['ASSIGNED_EMPLOYEE'], branchScope: 'ASSIGNED', severity: 'INFORMATIONAL', channels: ['IN_APP'], allowedFields: FIELDS,
    title: () => 'Your offer was approved', body: v => `The offer for ${ref(v, 'your lead')} was approved and sent to the seller.`, route: id => `/seller-leads/${id}`, emitted: false },
  { ...base, eventType: 'ACQUISITION_OFFER_REJECTED', module: 'SALES', resourceType: 'AcquisitionLead', strategies: ['ASSIGNED_EMPLOYEE'], branchScope: 'ASSIGNED', severity: 'ACTION_REQUIRED', channels: ['IN_APP'], allowedFields: FIELDS,
    title: () => 'Your offer was not approved', body: v => `Administration did not approve the offer for ${ref(v, 'your lead')}. Propose a revised amount.`, route: id => `/seller-leads/${id}`, emitted: false },
  { ...base, eventType: 'TEST_DRIVE_ASSIGNED', module: 'SALES', resourceType: 'TestDriveRequest', strategies: ['ASSIGNED_EMPLOYEE'], branchScope: 'ASSIGNED', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], allowedFields: [...FIELDS, 'slot'],
    title: () => 'You have a test drive', body: v => `A test drive on ${car(v)} is confirmed${v.slot ? ` for ${v.slot}` : ''}.`, route: id => `/test-drives/${id}`, emitted: true },
  { ...base, eventType: 'SCRAP_REQUEST_SUBMITTED', module: 'SALES', resourceType: 'ScrapRequest', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'SALES_LEADS', requiredRoles: ['SALES_EXECUTIVE'], severity: 'ACTION_REQUIRED', channels: ['IN_APP'], dedupWindowMinutes: 10, allowedFields: FIELDS,
    title: () => 'New scrap request', body: v => `A customer wants to scrap ${car(v)}. Call them to arrange it.`, route: () => '/scrap-requests', emitted: true },

  // ----------------------------------------------------------- OPERATIONS
  { ...base, eventType: 'INSPECTION_REQUESTED', module: 'OPERATIONS', resourceType: 'InspectionRequest', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'OPS_DISPATCH', requiredPermission: 'inspection.assignment.assign', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: true, escalationPolicyKey: 'OPS_DISPATCH_SLA', allowedFields: FIELDS,
    title: () => 'An inspection needs an inspector', body: v => `${ref(v, 'An inspection request')} (${car(v)}) is waiting to be assigned.`, route: id => `/inspections/requests/${id}`, emitted: true },
  { ...base, eventType: 'ACQUISITION_OFFER_ACCEPTED_STAFF', module: 'OPERATIONS', resourceType: 'AcquisitionCase', strategies: ['BRANCH_QUEUE_OWNER', 'ASSIGNED_EMPLOYEE'], queueKey: 'OPS_ACQUISITIONS', requiredRoles: ['OPERATIONS_MANAGER', 'INVENTORY_MANAGER'], severity: 'ACTION_REQUIRED', channels: ['IN_APP'], allowedFields: FIELDS,
    title: () => 'A seller accepted the offer', body: v => `${ref(v, 'A case')} (${car(v)}): start collecting and verifying the seller documents.`, route: id => `/acquisitions/${id}`, emitted: true },
  { ...base, eventType: 'VEHICLE_STOCK_INWARD', module: 'OPERATIONS', resourceType: 'VehicleStockUnit', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'OPS_INVENTORY', requiredRoles: ['OPERATIONS_MANAGER', 'INVENTORY_MANAGER'], severity: 'ACTION_REQUIRED', channels: ['IN_APP'], allowedFields: FIELDS,
    title: () => 'A vehicle was received', body: v => `${car(v)} is in stock and needs a refurbishment decision.`, route: id => `/inventory/${id}`, emitted: true },
  { ...base, eventType: 'VEHICLE_QC_PASSED', module: 'OPERATIONS', resourceType: 'VehicleStockUnit', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'OPS_INVENTORY', requiredRoles: ['LISTING_EXECUTIVE', 'OPERATIONS_MANAGER', 'INVENTORY_MANAGER'], severity: 'ACTION_REQUIRED', channels: ['IN_APP'], allowedFields: FIELDS,
    title: () => 'Quality check done', body: v => `${car(v)} finished quality control and needs its next step.`, route: id => `/inventory/${id}`, emitted: true },
  { ...base, eventType: 'VEHICLE_LISTING_READY', module: 'OPERATIONS', resourceType: 'VehicleStockUnit', strategies: ['DESIGNATED_APPROVER'], requiredRoles: ['PRICING_APPROVER', 'LISTING_EXECUTIVE', 'OPERATIONS_MANAGER'], severity: 'ACTION_REQUIRED', channels: ['IN_APP'], allowedFields: FIELDS,
    title: () => 'A listing is ready to publish', body: v => `${car(v)} has its details and photos. Set the price and publish.`, route: id => `/inventory/${id}`, emitted: true },
  { ...base, eventType: 'REFURBISHMENT_COST_APPROVAL_REQUESTED', module: 'OPERATIONS', resourceType: 'RefurbishmentWorkOrder', strategies: ['DESIGNATED_APPROVER'], requiredRoles: ['PRICING_APPROVER'], severity: 'ACTION_REQUIRED', channels: ['IN_APP'], requiresAck: true, allowedFields: FIELDS,
    title: () => 'A repair cost needs approval', body: v => `A repair estimate for ${car(v)} is waiting for your decision.`, route: () => '/refurbishment', emitted: true },
  { ...base, eventType: 'SERVICE_REQUEST_SUBMITTED', module: 'OPERATIONS', resourceType: 'ServiceRequest', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'OPS_SERVICE', requiredRoles: ['SERVICE_ADVISOR', 'SERVICE_MANAGER', 'HUB_MANAGER'], severity: 'ACTION_REQUIRED', channels: ['IN_APP'], dedupWindowMinutes: 5, allowedFields: FIELDS,
    title: () => 'New service booking', body: v => `${ref(v, 'A service booking')} for ${car(v)} needs scheduling.`, route: id => `/service/jobs/${id}`, emitted: true },
  { ...base, eventType: 'SERVICE_ESTIMATE_APPROVED', module: 'OPERATIONS', resourceType: 'ServiceRequest', strategies: ['ASSIGNED_EMPLOYEE', 'BRANCH_QUEUE_OWNER'], queueKey: 'OPS_SERVICE', requiredRoles: ['SERVICE_ADVISOR', 'SERVICE_MANAGER', 'TECHNICIAN'], severity: 'ACTION_REQUIRED', channels: ['IN_APP'], allowedFields: FIELDS,
    title: () => 'The customer approved the estimate', body: v => `${ref(v, 'A service job')} can start.`, route: id => `/service/jobs/${id}`, emitted: true },
  { ...base, eventType: 'RENTAL_BOOKING_CONFIRMED', module: 'OPERATIONS', resourceType: 'RentalBooking', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'OPS_RENTALS', requiredRoles: ['RENTAL_MANAGER', 'RENTAL_DISPATCH'], severity: 'INFORMATIONAL', channels: ['IN_APP'], dedupWindowMinutes: 5, allowedFields: FIELDS,
    title: () => 'A rental booking is confirmed', body: v => `${ref(v, 'A booking')} for ${car(v)} is confirmed.`, route: id => `/rentals/bookings/${id}`, emitted: true },
  { ...base, eventType: 'RENTAL_PICKUP_REMINDER', module: 'OPERATIONS', resourceType: 'RentalBooking', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'OPS_RENTALS', requiredRoles: ['RENTAL_MANAGER', 'RENTAL_DISPATCH'], severity: 'ACTION_REQUIRED', channels: ['IN_APP'], dedupWindowMinutes: 720, allowedFields: FIELDS,
    title: () => 'A rental pickup is coming up', body: v => `${ref(v, 'A booking')} is due for pickup${v.dueAt ? ` at ${v.dueAt}` : ' soon'}. Make sure the car is ready.`, route: id => `/rentals/bookings/${id}`, emitted: true, note: 'Raised by the rental detector.' },
  { ...base, eventType: 'RENTAL_BALANCE_OVERDUE', module: 'OPERATIONS', resourceType: 'RentalBooking', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'OPS_RENTALS', requiredRoles: ['RENTAL_MANAGER', 'RENTAL_DISPATCH'], severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: true, dedupWindowMinutes: 1440, escalationPolicyKey: 'RENTAL_FOLLOW_UP', allowedFields: FIELDS,
    title: () => 'A rental balance is overdue', body: v => `${ref(v, 'A booking')} has an unpaid balance before pickup. Contact the customer.`, route: id => `/rentals/bookings/${id}`, emitted: true, note: 'Raised by the rental detector; the amount stays in Finance.' },
  { ...base, eventType: 'RENTAL_PICKUP_BLOCKED', module: 'OPERATIONS', resourceType: 'RentalBooking', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'OPS_RENTALS', requiredRoles: ['RENTAL_MANAGER', 'RENTAL_DISPATCH'], severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: true, dedupWindowMinutes: 120, allowedFields: FIELDS,
    title: () => 'A pickup is blocked', body: v => `${ref(v, 'A booking')} cannot be handed over yet${v.reasonCode ? ` (${String(v.reasonCode).replace(/_/g, ' ').toLowerCase()})` : ''}.`, route: id => `/rentals/bookings/${id}`, emitted: false, note: 'Safe blocker status only: never payment details.' },
  { ...base, eventType: 'RENTAL_RETURN_OVERDUE', module: 'OPERATIONS', resourceType: 'RentalBooking', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'OPS_RENTALS', requiredRoles: ['RENTAL_MANAGER', 'RENTAL_DISPATCH'], severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: true, dedupWindowMinutes: 720, escalationPolicyKey: 'RENTAL_FOLLOW_UP', allowedFields: FIELDS,
    title: () => 'A rental car is overdue', body: v => `${ref(v, 'A booking')} was due back and has not returned.`, route: id => `/rentals/bookings/${id}`, emitted: true, note: 'Raised by the rental detector.' },
  { ...base, eventType: 'RENTAL_INCIDENT_REPORTED', module: 'OPERATIONS', resourceType: 'RentalBooking', strategies: ['BRANCH_QUEUE_OWNER', 'ADMIN_RESPONDER'], queueKey: 'OPS_RENTALS', requiredRoles: ['RENTAL_MANAGER', 'OPERATIONS_MANAGER'], severity: 'CRITICAL', channels: ['IN_APP', 'PUSH', 'EMAIL'], requiresAck: true, escalationPolicyKey: 'CRITICAL_INCIDENT', allowedFields: FIELDS,
    title: () => 'A rental incident was reported', body: v => `${ref(v, 'A booking')}: an incident needs immediate attention.`, route: id => `/rentals/bookings/${id}`, emitted: true },
  { ...base, eventType: 'VEHICLE_MAINTENANCE_BLOCKING', module: 'OPERATIONS', resourceType: 'RentalFleetVehicle', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'OPS_RENTALS', requiredRoles: ['RENTAL_FLEET_OFFICER', 'RENTAL_MANAGER'], severity: 'ACTION_REQUIRED', channels: ['IN_APP'], allowedFields: FIELDS,
    title: () => 'Maintenance is blocking a car', body: v => `${car(v)} is unavailable because of maintenance and a booking depends on it.`, route: id => `/rentals/fleet/${id}`, emitted: false },

  // -------------------------------------------------------------- FINANCE
  { ...base, eventType: 'FINANCE_READY_FOR_PAYMENT', module: 'FINANCE', resourceType: 'AcquisitionCase', strategies: ['FINANCE_CASE_OWNER'], queueKey: 'FINANCE_PAYOUTS', requiredPermission: 'finance.settlement.prepare', severity: 'ACTION_REQUIRED', channels: ['IN_APP'], requiresAck: true, escalationPolicyKey: 'FINANCE_STANDARD', allowedFields: FIELDS,
    title: () => 'A seller payout is ready to prepare', body: v => `${ref(v, 'A case')} (${car(v)}): all documents are verified.`, route: () => '/seller-settlements', emitted: true },
  { ...base, eventType: 'FINANCE_PAYOUT_APPROVAL_REQUESTED', module: 'FINANCE', resourceType: 'FinancePayoutInstruction', strategies: ['DESIGNATED_APPROVER'], requiredPermission: 'finance.payout.approve', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: true, escalationPolicyKey: 'FINANCE_STANDARD', allowedFields: FIELDS,
    title: () => 'A payout needs your approval', body: v => `A payout${v.referenceCode ? ` (${v.referenceCode})` : ''} is waiting for approval.`, route: id => `/payouts/${id}`, emitted: true, note: 'The person who prepared it is excluded.' },
  { ...base, eventType: 'FINANCE_PAYOUT_APPROVED', module: 'FINANCE', resourceType: 'FinancePayoutInstruction', strategies: ['FINANCE_CASE_OWNER', 'DESIGNATED_APPROVER'], requiredPermission: 'finance.payout.execute', severity: 'ACTION_REQUIRED', channels: ['IN_APP'], allowedFields: FIELDS,
    title: () => 'A payout was approved', body: v => `A payout${v.referenceCode ? ` (${v.referenceCode})` : ''} is approved and ready to be paid.`, route: id => `/payouts/${id}`, emitted: true },
  { ...base, eventType: 'FINANCE_PAYOUT_VERIFIED', module: 'FINANCE', resourceType: 'FinancePayoutInstruction', strategies: ['FINANCE_CASE_OWNER'], branchScope: 'ASSIGNED', severity: 'INFORMATIONAL', channels: ['IN_APP'], allowedFields: FIELDS,
    title: () => 'A payout was verified', body: v => `A payout${v.referenceCode ? ` (${v.referenceCode})` : ''} is verified.`, route: id => `/payouts/${id}`, emitted: true },
  { ...base, eventType: 'PAYMENT_RECONCILIATION_REQUIRED', module: 'FINANCE', resourceType: 'Payment', strategies: ['FINANCE_CASE_OWNER'], queueKey: 'FINANCE_RECON', requiredPermission: 'finance.portal.access', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: true, escalationPolicyKey: 'FINANCE_STANDARD', allowedFields: FIELDS,
    title: () => 'A payment needs reconciliation', body: v => `A payment${v.referenceCode ? ` (${v.referenceCode})` : ''} does not match and needs review.`, route: id => `/payments/${id}`, emitted: false, note: 'Needs a hook in the payment verification code.' },
  { ...base, eventType: 'PAYMENT_EXCEPTION', module: 'FINANCE', resourceType: 'Payment', strategies: ['FINANCE_CASE_OWNER'], queueKey: 'FINANCE_RECON', requiredPermission: 'finance.portal.access', severity: 'CRITICAL', channels: ['IN_APP', 'PUSH', 'EMAIL'], requiresAck: true, escalationPolicyKey: 'CRITICAL_INCIDENT', allowedFields: FIELDS,
    title: () => 'A payment exception needs attention', body: v => `A payment${v.referenceCode ? ` (${v.referenceCode})` : ''} is in an exception state.`, route: id => `/payments/${id}`, emitted: false },
  { ...base, eventType: 'REFUND_APPROVAL_PENDING', module: 'FINANCE', resourceType: 'Refund', strategies: ['DESIGNATED_APPROVER'], requiredPermission: 'finance.payout.approve', severity: 'ACTION_REQUIRED', channels: ['IN_APP'], requiresAck: true, escalationPolicyKey: 'FINANCE_STANDARD', allowedFields: FIELDS,
    title: () => 'A refund needs approval', body: v => `A refund${v.referenceCode ? ` (${v.referenceCode})` : ''} is waiting for approval.`, route: id => `/refunds/${id}`, emitted: false },
  { ...base, eventType: 'RENTAL_DEPOSIT_RELEASE_PENDING', module: 'FINANCE', resourceType: 'RentalBooking', strategies: ['FINANCE_CASE_OWNER'], queueKey: 'FINANCE_RECON', requiredPermission: 'finance.portal.access', severity: 'ACTION_REQUIRED', channels: ['IN_APP'], allowedFields: FIELDS,
    title: () => 'A rental deposit is ready to release', body: v => `${ref(v, 'A booking')}: the car is back and the deposit can be released.`, route: id => `/payments/${id}`, emitted: false },
  { ...base, eventType: 'PAYMENT_DISPUTE', module: 'FINANCE', resourceType: 'Payment', strategies: ['FINANCE_CASE_OWNER', 'ADMIN_RESPONDER'], queueKey: 'FINANCE_RECON', requiredPermission: 'finance.portal.access', severity: 'CRITICAL', channels: ['IN_APP', 'PUSH', 'EMAIL'], requiresAck: true, escalationPolicyKey: 'CRITICAL_INCIDENT', allowedFields: FIELDS,
    title: () => 'A payment was disputed', body: v => `A chargeback or dispute${v.referenceCode ? ` (${v.referenceCode})` : ''} was raised.`, route: id => `/payments/${id}`, emitted: false },

  // ----------------------------------------------------------- INSPECTION
  { ...base, eventType: 'INSPECTION_ASSIGNED', module: 'INSPECTION', resourceType: 'InspectionAssignment', strategies: ['INSPECTOR_ASSIGNEE'], branchScope: 'ASSIGNED', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: false, escalationPolicyKey: 'INSPECTOR_JOB_OVERDUE', allowedFields: [...FIELDS, 'slot'],
    title: () => 'New inspection assigned', body: v => `${car(v)}${v.slot ? ` · ${v.slot}` : ''}. Open the job for the details.`, route: id => `/inspections/${id}`, emitted: true },
  { ...base, eventType: 'INSPECTION_REASSIGNED', module: 'INSPECTION', resourceType: 'InspectionAssignment', strategies: ['INSPECTOR_ASSIGNEE'], branchScope: 'ASSIGNED', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], allowedFields: [...FIELDS, 'slot'],
    title: () => 'An inspection was changed', body: v => `${car(v)}${v.slot ? ` · ${v.slot}` : ''}. The job was reassigned or updated.`, route: id => `/inspections/${id}`, emitted: true },
  { ...base, eventType: 'INSPECTION_APPOINTMENT_CHANGED', module: 'INSPECTION', resourceType: 'InspectionAssignment', strategies: ['INSPECTOR_ASSIGNEE'], branchScope: 'ASSIGNED', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], allowedFields: [...FIELDS, 'slot'],
    title: () => 'An appointment changed', body: v => `${car(v)}${v.slot ? ` · ${v.slot}` : ''}. Check the new time.`, route: id => `/inspections/${id}`, emitted: true },
  { ...base, eventType: 'INSPECTION_CANCELLED', module: 'INSPECTION', resourceType: 'InspectionAssignment', strategies: ['INSPECTOR_ASSIGNEE'], branchScope: 'ASSIGNED', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], allowedFields: FIELDS,
    title: () => 'An inspection was cancelled', body: v => `${car(v)} no longer needs an inspection.`, route: id => `/inspections/${id}`, emitted: false },
  { ...base, eventType: 'INSPECTION_REWORK_REQUIRED', module: 'INSPECTION', resourceType: 'InspectionReport', strategies: ['INSPECTOR_ASSIGNEE'], branchScope: 'ASSIGNED', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: true, allowedFields: FIELDS,
    title: () => 'A report needs corrections', body: v => `The review of ${car(v)} asked for corrections.`, route: id => `/inspections/${id}`, emitted: true },
  { ...base, eventType: 'REINSPECTION_REQUESTED', module: 'INSPECTION', resourceType: 'InspectionAssignment', strategies: ['INSPECTOR_ASSIGNEE'], branchScope: 'ASSIGNED', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: true, allowedFields: FIELDS,
    title: () => 'A re-inspection is needed', body: v => `${car(v)} needs to be inspected again.`, route: id => `/inspections/${id}`, emitted: false },
  { ...base, eventType: 'INSPECTION_REPORT_SUBMITTED', module: 'INSPECTION', resourceType: 'InspectionReport', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'INSPECTION_REVIEW', requiredPermission: 'inspection.review.queue.read', severity: 'ACTION_REQUIRED', channels: ['IN_APP'], dedupWindowMinutes: 5, allowedFields: FIELDS,
    title: () => 'A report is ready for review', body: v => `An inspection report for ${car(v)} is waiting for review.`, route: id => `/reviews/${id}`, emitted: true },
  { ...base, eventType: 'INSPECTION_REPORT_RESUBMITTED', module: 'INSPECTION', resourceType: 'InspectionReport', strategies: ['BRANCH_QUEUE_OWNER'], queueKey: 'INSPECTION_REVIEW', requiredPermission: 'inspection.review.queue.read', severity: 'ACTION_REQUIRED', channels: ['IN_APP'], dedupWindowMinutes: 5, allowedFields: FIELDS,
    title: () => 'A corrected report is ready', body: v => `A corrected report for ${car(v)} is waiting for review.`, route: id => `/reviews/${id}`, emitted: true },

  // ---------------------------------------------------------------- ADMIN
  { ...base, eventType: 'DISCOUNT_APPROVAL_REQUESTED', module: 'ADMIN', resourceType: 'ApprovalRequest', strategies: ['DESIGNATED_APPROVER'], requiredPermission: 'approval.decide', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: true, escalationPolicyKey: 'ADMIN_APPROVAL', allowedFields: FIELDS,
    title: () => 'A discount needs approval', body: v => `A discount request${v.referenceCode ? ` (${v.referenceCode})` : ''} is waiting for your decision.`, route: id => `/approvals/${id}`, emitted: true, note: 'The requester is excluded.' },
  { ...base, eventType: 'ACQUISITION_OFFER_APPROVAL_REQUESTED', module: 'ADMIN', resourceType: 'ApprovalRequest', strategies: ['DESIGNATED_APPROVER'], requiredPermission: 'approval.decide', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'PUSH'], requiresAck: true, escalationPolicyKey: 'ADMIN_APPROVAL', allowedFields: FIELDS,
    title: () => 'A seller offer needs approval', body: v => `An offer for ${ref(v, 'a seller lead')} (${car(v)}) is waiting for your decision.`, route: id => `/approvals/${id}`, emitted: true },
  { ...base, eventType: 'EMPLOYEE_INVITE_APPROVAL', module: 'ADMIN', resourceType: 'ApprovalRequest', strategies: ['DESIGNATED_APPROVER'], requiredPermission: 'role.assign.privileged', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'EMAIL'], requiresAck: true, escalationPolicyKey: 'ADMIN_APPROVAL', allowedFields: FIELDS,
    title: () => 'A privileged invitation needs approval', body: () => 'An employee invitation with elevated access is waiting for approval.', route: id => `/approvals/${id}`, emitted: false },
  { ...base, eventType: 'ROLE_ESCALATION_REQUEST', module: 'ADMIN', resourceType: 'ApprovalRequest', strategies: ['DESIGNATED_APPROVER'], requiredPermission: 'role.assign.privileged', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'EMAIL'], requiresAck: true, escalationPolicyKey: 'ADMIN_APPROVAL', allowedFields: FIELDS,
    title: () => 'A role change needs approval', body: () => 'A request to change an employee\'s role is waiting for approval.', route: id => `/approvals/${id}`, emitted: false },
  { ...base, eventType: 'POLICY_CHANGE_APPROVAL', module: 'ADMIN', resourceType: 'ApprovalRequest', strategies: ['DESIGNATED_APPROVER'], requiredPermission: 'policy.approve', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'EMAIL'], requiresAck: true, escalationPolicyKey: 'ADMIN_APPROVAL', allowedFields: FIELDS,
    title: () => 'A policy change needs approval', body: () => 'A new policy version is waiting for approval.', route: id => `/approvals/${id}`, emitted: false },
  { ...base, eventType: 'SENSITIVE_EXPORT_APPROVAL', module: 'ADMIN', resourceType: 'ApprovalRequest', strategies: ['DESIGNATED_APPROVER'], requiredPermission: 'export.sensitive.approve', severity: 'ACTION_REQUIRED', channels: ['IN_APP', 'EMAIL'], requiresAck: true, escalationPolicyKey: 'ADMIN_APPROVAL', allowedFields: FIELDS,
    title: () => 'A data export needs approval', body: () => 'A sensitive data export is waiting for approval.', route: id => `/approvals/${id}`, emitted: false },
  { ...base, eventType: 'PARTNER_APPROVAL', module: 'ADMIN', resourceType: 'ApprovalRequest', strategies: ['DESIGNATED_APPROVER'], requiredPermission: 'approval.decide', severity: 'ACTION_REQUIRED', channels: ['IN_APP'], requiresAck: true, allowedFields: FIELDS,
    title: () => 'A partner needs approval', body: () => 'A partner onboarding request is waiting for approval.', route: id => `/approvals/${id}`, emitted: false, note: 'No partner module exists in V2 yet.' },
  { ...base, eventType: 'SECURITY_INCIDENT', module: 'ADMIN', resourceType: 'Incident', strategies: ['ADMIN_RESPONDER'], queueKey: 'ADMIN_SECURITY', branchScope: 'GLOBAL', severity: 'CRITICAL', channels: ['IN_APP', 'PUSH', 'EMAIL'], requiresAck: true, escalationPolicyKey: 'CRITICAL_INCIDENT', allowedFields: FIELDS,
    title: () => 'A security incident was raised', body: v => `${v.reasonCode ? String(v.reasonCode).replace(/_/g, ' ').toLowerCase() : 'An incident'} needs a response now.`, route: id => `/incidents/${id}`, emitted: true, note: 'Raised through raiseSecurityIncident().' },
  { ...base, eventType: 'INTEGRATION_OUTAGE', module: 'ADMIN', resourceType: 'Incident', strategies: ['ADMIN_RESPONDER'], queueKey: 'ADMIN_SECURITY', branchScope: 'GLOBAL', severity: 'CRITICAL', channels: ['IN_APP', 'EMAIL'], requiresAck: true, dedupWindowMinutes: 30, escalationPolicyKey: 'CRITICAL_INCIDENT', allowedFields: FIELDS,
    title: () => 'An integration is failing', body: v => `${v.reasonCode ? String(v.reasonCode).replace(/_/g, ' ').toLowerCase() : 'A provider'} is failing.`, route: () => '/health', emitted: true, note: 'Raised by the outbox health check (dead or stuck events).' },
  { ...base, eventType: 'CRITICAL_ESCALATION_UNRESOLVED', module: 'ADMIN', resourceType: 'Incident', strategies: ['ADMIN_RESPONDER'], queueKey: 'ADMIN_SECURITY', branchScope: 'GLOBAL', severity: 'CRITICAL', channels: ['IN_APP', 'PUSH', 'EMAIL'], requiresAck: true, dedupWindowMinutes: 60, allowedFields: FIELDS,
    title: () => 'A critical alert is still unresolved', body: () => 'A critical alert was escalated through every level and is still open.', route: () => '/incidents', emitted: true, note: 'Raised by the escalation engine.' },
];

const BY_TYPE = new Map(EVENT_CATALOG.map(def => [def.eventType, def]));

export const getEventDefinition = (eventType: string): EventDefinition | undefined => BY_TYPE.get(eventType);
export const isEmployeeEvent = (eventType: string): boolean => BY_TYPE.has(eventType);

/** Keep only the fields an event is allowed to carry, as plain strings, numbers or booleans. */
export function pickAllowedFields(def: EventDefinition, raw: Record<string, unknown> | undefined): Vars {
  const out: Vars = {};
  for (const key of def.allowedFields) {
    const value = raw?.[key];
    if (typeof value === 'string') out[key] = value.slice(0, 120);
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
  }
  return out;
}

// -------------------------------------------------------------------------------------------------------------------------------
// Escalation defaults (replaceable by rows in NotificationEscalationPolicy).
export interface EscalationStep { afterMinutes: number; to: 'QUEUE_OWNER' | 'REPORTS_TO' | 'ADMIN_RESPONDER' }
export interface EscalationDefault { key: string; steps: EscalationStep[]; respectWorkingHours: boolean; description: string }

export const ESCALATION_DEFAULTS: EscalationDefault[] = [
  { key: 'SALES_LEAD_FIRST_RESPONSE', respectWorkingHours: true, description: 'A lead assigned to a Sales Executive with no first response: team lead, then branch manager.', steps: [{ afterMinutes: 60, to: 'REPORTS_TO' }, { afterMinutes: 240, to: 'QUEUE_OWNER' }] },
  { key: 'SALES_LEAD_UNASSIGNED', respectWorkingHours: true, description: 'A new seller lead nobody has taken.', steps: [{ afterMinutes: 30, to: 'QUEUE_OWNER' }, { afterMinutes: 120, to: 'ADMIN_RESPONDER' }] },
  { key: 'OPS_DISPATCH_SLA', respectWorkingHours: true, description: 'An inspection request nobody has assigned.', steps: [{ afterMinutes: 30, to: 'QUEUE_OWNER' }, { afterMinutes: 120, to: 'ADMIN_RESPONDER' }] },
  { key: 'INSPECTOR_JOB_OVERDUE', respectWorkingHours: true, description: 'An inspection not started after its slot.', steps: [{ afterMinutes: 60, to: 'QUEUE_OWNER' }] },
  { key: 'RENTAL_FOLLOW_UP', respectWorkingHours: true, description: 'An overdue rental balance or return.', steps: [{ afterMinutes: 120, to: 'REPORTS_TO' }, { afterMinutes: 480, to: 'QUEUE_OWNER' }] },
  { key: 'FINANCE_STANDARD', respectWorkingHours: true, description: 'Finance approvals and reconciliations left open.', steps: [{ afterMinutes: 240, to: 'REPORTS_TO' }, { afterMinutes: 1440, to: 'ADMIN_RESPONDER' }] },
  { key: 'ADMIN_APPROVAL', respectWorkingHours: true, description: 'An approval nobody has decided.', steps: [{ afterMinutes: 480, to: 'ADMIN_RESPONDER' }] },
  { key: 'CRITICAL_INCIDENT', respectWorkingHours: false, description: 'Critical alerts: the clock runs day and night.', steps: [{ afterMinutes: 10, to: 'REPORTS_TO' }, { afterMinutes: 30, to: 'ADMIN_RESPONDER' }] },
];
