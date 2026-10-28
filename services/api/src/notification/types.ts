import type { NotificationChannel, NotificationPriority } from '@prisma/client';

export type DomainEventType =
  // Inspection Lifecycle
  | 'INSPECTION_REQUESTED'
  | 'INSPECTION_ASSIGNED'
  | 'INSPECTION_REASSIGNED'
  | 'INSPECTION_APPOINTMENT_CHANGED'
  | 'INSPECTION_REPORT_SUBMITTED'
  | 'INSPECTION_REVIEWER_ASSIGNED'
  | 'INSPECTION_REWORK_REQUIRED'
  | 'INSPECTION_REPORT_RESUBMITTED'
  | 'INSPECTION_REVIEW_APPROVED'
  | 'INSPECTION_REVIEW_REJECTED'
  // Seller / Sell-Your-Car
  | 'CUSTOMER_SELL_SUBMITTED'
  | 'OFFER_COMMUNICATED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_DECLINED'
  | 'PAYMENT_DISPATCHED'
  | 'PAYMENT_VERIFIED'
  // Buyer / Retail
  | 'BUYER_ENQUIRY_SUBMITTED'
  | 'TEST_DRIVE_REQUESTED'
  | 'TEST_DRIVE_CONFIRMED'
  | 'RETAIL_QUOTATION_ISSUED'
  | 'RESERVATION_PLACED'
  | 'RESERVATION_CONFIRMED'
  // Lead & Operations
  | 'LEAD_ASSIGNED'
  | 'DISCOUNT_APPROVAL_REQUESTED'
  | 'DISCOUNT_APPROVAL_DECIDED'
  | 'EMPLOYEE_INVITED'
  // Finance Lifecycle
  | 'FINANCE_PAYOUT_APPROVAL_REQUESTED'
  | 'FINANCE_PAYOUT_VERIFIED'
  | 'FINANCE_BUYER_PAYMENT_VERIFIED'
  // Service Lifecycle
  | 'SERVICE_REQUEST_SUBMITTED'
  | 'SERVICE_APPOINTMENT_SCHEDULED'
  | 'SERVICE_PICKUP_DISPATCHED'
  | 'SERVICE_VEHICLE_ARRIVED'
  | 'SERVICE_CUSTODY_CHECKIN'
  | 'SERVICE_DIAGNOSIS_COMPLETED'
  | 'SERVICE_ESTIMATE_ISSUED'
  | 'SERVICE_ESTIMATE_APPROVED'
  | 'SERVICE_ESTIMATE_DECLINED'
  | 'SERVICE_WORK_STARTED'
  | 'SERVICE_WORK_COMPLETED'
  | 'SERVICE_QC_PASSED'
  | 'SERVICE_QC_REWORK'
  | 'SERVICE_INVOICE_GENERATED'
  | 'SERVICE_PAYMENT_VERIFIED'
  | 'SERVICE_RETURN_DISPATCHED'
  | 'SERVICE_READY_FOR_COLLECTION'
  | 'SERVICE_COMPLETED'
  | 'SERVICE_CANCELLED'
  // Rental Lifecycle
  | 'RENTAL_HOLD_CREATED'
  | 'RENTAL_PAYMENT_PENDING'
  | 'RENTAL_PAYMENT_VERIFIED'
  | 'RENTAL_KYC_REQUIRED'
  | 'RENTAL_BOOKING_CONFIRMED'
  | 'RENTAL_BOOKING_CANCELLED'
  | 'RENTAL_PICKUP_REMINDER'
  | 'RENTAL_VEHICLE_RELEASED'
  | 'RENTAL_TRIP_STARTED'
  | 'RENTAL_EXTENSION_REQUESTED'
  | 'RENTAL_EXTENSION_APPROVED'
  | 'RENTAL_EXTENSION_DENIED'
  | 'RENTAL_RETURN_DUE'
  | 'RENTAL_RETURN_OVERDUE'
  | 'RENTAL_RETURN_RECEIVED'
  | 'RENTAL_ADDITIONAL_CHARGES_PROPOSED'
  | 'RENTAL_DEPOSIT_REFUND_PROCESSING'
  | 'RENTAL_DEPOSIT_REFUND_VERIFIED'
  | 'RENTAL_INCIDENT_REPORTED'
  // Connect QR Lifecycle
  | 'CONNECT_QR_SCANNED'
  | 'CONNECT_OWNER_ALERT_CREATED'
  | 'CONNECT_OWNER_ALERT_DELIVERED'
  | 'CONNECT_CALL_REQUESTED'
  | 'CONNECT_CALL_STARTED'
  | 'CONNECT_CALL_FAILED'
  | 'CONNECT_CALL_COMPLETED'
  | 'CONNECT_QR_DEACTIVATED'
  | 'CONNECT_QR_REISSUED'
  | 'CONNECT_ABUSE_REPORTED';

export type TargetApp = 'CUSTOMER' | 'INSPECTOR' | 'ADMIN' | 'SALES' | 'OPS' | 'REVIEW' | 'FINANCE';

export interface DomainEventPayload {
  type: DomainEventType;
  actorId?: string;
  referenceId?: string; // e.g. assignmentId, reportId, leadId, offerId
  entityType?: string; // 'InspectionAssignment', 'InspectionReport', 'AcquisitionLead', etc.
  title: string;
  body: string;
  category: string; // 'INSPECTION', 'SELLING', 'BUYING', 'SUPPORT', 'SYSTEM'
  priority?: NotificationPriority;
  deepLink?: string; // e.g. vmotiv://inspections/:id, vmotiv://activity
  actionUrl?: string; // e.g. /inspection-review?reportId=:id, /admin/approvals
  metadata?: Record<string, unknown>;
  // Explicit recipient hints if already known
  recipientUserIds?: string[];
  // Fallback recipient roles to look up if no explicit user IDs given
  recipientRoles?: string[];
  branchId?: string;
  // Specific channels to target (defaults to policy)
  channels?: NotificationChannel[];
  // Transactional email specifics
  emailTemplate?: string;
  emailSubject?: string;
  emailBody?: string;
  emailVariables?: Record<string, string>;
}
