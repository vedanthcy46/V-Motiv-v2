// Startup repair for service requests that an earlier version marked PAID before they were ever billed.
//
// Paying the booking amount (diagnostic fee, prepaid package, advance) used to set the whole request to PAID, and a PAID request counts
// as finished: check-in, the estimate (extra labour on a package) and approval were refused as "closed". The same repair is shipped as
// the migrations 20261109000000_ and 20261109010000_repair_prematurely_paid_service_requests*; running it here as well means a deploy fixes the stuck jobs
// without a manual `db:deploy`. It is idempotent: it only touches requests that are PAID with no invoice, so once repaired a request is
// never matched again, and a billed job that was really settled is never touched.
//
// Keep this SQL in step with the newest of those migrations.
export const REPAIR_PREMATURELY_PAID_SQL = `
WITH premature AS (
  SELECT DISTINCT ON (e."serviceRequestId") e."serviceRequestId" AS id, e."fromStatus" AS previous_status
  FROM "ServiceHistoryEvent" e
  WHERE e."toStatus" IN ('PAID', 'PAYMENT_PENDING')
    AND e."fromStatus" IS NOT NULL
    AND e."fromStatus" NOT IN ('PAID', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED', 'RETURN_DISPATCHED', 'READY_FOR_COLLECTION', 'QC_PASSED', 'INVOICE_GENERATED')
    AND (e.title IN ('Payment Verified Online', 'Payment Verified by Finance', 'Counter Payment Recorded & Verified') OR e.title LIKE 'Payment Initiated (%')
  ORDER BY e."serviceRequestId", e."createdAt" ASC
)
UPDATE "ServiceRequest" sr
SET status = premature.previous_status::"ServiceRequestStatus",
    "outstandingBalancePaise" = CASE
      WHEN COALESCE((("paymentPlanSnapshot" #>> '{}')::jsonb ->> 'balancePaise')::bigint, 0) > 0
        THEN (("paymentPlanSnapshot" #>> '{}')::jsonb ->> 'balancePaise')::bigint
      ELSE sr."outstandingBalancePaise"
    END,
    "servicePaymentStatus" = CASE
      WHEN COALESCE((("paymentPlanSnapshot" #>> '{}')::jsonb ->> 'balancePaise')::bigint, 0) > 0 THEN 'PARTIALLY_PAID'
      ELSE sr."servicePaymentStatus"
    END
FROM premature
WHERE sr.id = premature.id
  AND sr.status IN ('PAID', 'PAYMENT_PENDING')
  AND NOT EXISTS (SELECT 1 FROM "ServiceInvoice" i WHERE i."serviceRequestId" = sr.id)`;

/** Runs the repair and returns how many requests were put back. Never throws: a failed repair must not stop the API from starting. */
export async function repairPrematurelyPaidServiceRequests(db: { $executeRawUnsafe: (sql: string) => Promise<number> }, log: Pick<Console, 'info' | 'error'> = console): Promise<number> {
  try {
    const repaired = Number(await db.$executeRawUnsafe(REPAIR_PREMATURELY_PAID_SQL));
    if (repaired > 0) log.info(`[service-repair] restored ${repaired} service request(s) that were marked PAID before being billed`);
    return repaired;
  } catch (error) {
    log.error('[service-repair] could not run the PAID-status repair', error instanceof Error ? error.message : error);
    return 0;
  }
}
