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
  | 'FINANCE_BUYER_PAYMENT_VERIFIED';

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
