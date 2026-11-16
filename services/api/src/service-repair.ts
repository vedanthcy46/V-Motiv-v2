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
),
plan AS (
  SELECT p.id,
         COALESCE(((p."paymentPlanSnapshot" #>> '{}')::jsonb ->> 'balancePaise')::bigint, 0) AS balance,
         COALESCE(((p."paymentPlanSnapshot" #>> '{}')::jsonb ->> 'payNowPaise')::bigint, 0)
           + COALESCE(((p."paymentPlanSnapshot" #>> '{}')::jsonb ->> 'balancePaise')::bigint, 0) AS total
  FROM "ServiceRequest" p
  WHERE p."paymentPlanSnapshot" IS NOT NULL
)
UPDATE "ServiceRequest" sr
SET status = premature.previous_status::"ServiceRequestStatus",
    "outstandingBalancePaise" = CASE
      WHEN plan.balance > 0 THEN GREATEST(0, plan.total - sr."verifiedPaidPaise")
      ELSE sr."outstandingBalancePaise"
    END,
    "servicePaymentStatus" = CASE
      WHEN plan.balance > 0 THEN (CASE WHEN GREATEST(0, plan.total - sr."verifiedPaidPaise") > 0 THEN 'PARTIALLY_PAID' ELSE 'PAID_IN_FULL' END)
      ELSE sr."servicePaymentStatus"
    END
FROM premature
JOIN plan ON plan.id = premature.id
WHERE sr.id = premature.id
  AND sr.status IN ('PAID', 'PAYMENT_PENDING')
  AND NOT EXISTS (SELECT 1 FROM "ServiceInvoice" i WHERE i."serviceRequestId" = sr.id)`;

/** Lowers a balance that still shows what was due at booking although later payments cleared it (never raises one). */
export const REPAIR_STALE_BALANCE_SQL = `
WITH plan AS (
  SELECT p.id,
         COALESCE(((p."paymentPlanSnapshot" #>> '{}')::jsonb ->> 'balancePaise')::bigint, 0) AS balance,
         COALESCE(((p."paymentPlanSnapshot" #>> '{}')::jsonb ->> 'payNowPaise')::bigint, 0)
           + COALESCE(((p."paymentPlanSnapshot" #>> '{}')::jsonb ->> 'balancePaise')::bigint, 0) AS total
  FROM "ServiceRequest" p
  WHERE p."paymentPlanSnapshot" IS NOT NULL
)
UPDATE "ServiceRequest" sr
SET "outstandingBalancePaise" = GREATEST(0, plan.total - sr."verifiedPaidPaise"),
    "servicePaymentStatus" = CASE WHEN GREATEST(0, plan.total - sr."verifiedPaidPaise") = 0 THEN 'PAID_IN_FULL' ELSE sr."servicePaymentStatus" END
FROM plan
WHERE sr.id = plan.id
  AND plan.total > 0
  AND sr."outstandingBalancePaise" > GREATEST(0, plan.total - sr."verifiedPaidPaise")
  AND NOT EXISTS (SELECT 1 FROM "ServiceInvoice" i WHERE i."serviceRequestId" = sr.id)`;

/**
 * Columns the code now reads that a database may not have yet. The Render deploy does not run migrations, and a missing column makes
 * every query on that table fail, so the API adds these itself at startup. Each statement is additive and idempotent, and is the same
 * SQL as the matching migration, so running the migration later changes nothing.
 */
export const ENSURE_COLUMNS_SQL = [
  // 20261109020000_notification_dismissed_at
  `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "dismissedAt" TIMESTAMP(3)`,
  // 20261116000000_opening_stock
  `ALTER TABLE "VehicleStockUnit" ALTER COLUMN "acquisitionCaseId" DROP NOT NULL`,
  `ALTER TABLE "VehicleStockUnit" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'ACQUISITION'`,
  `ALTER TABLE "VehicleStockUnit" ADD COLUMN IF NOT EXISTS "openingStockDetails" JSONB`,
];

/** Never throws: if the database refuses, the API still starts (and the migration can be run by hand). */
export async function ensureSchemaAdditions(db: { $executeRawUnsafe: (sql: string) => Promise<number> }, log: Pick<Console, 'info' | 'error'> = console): Promise<boolean> {
  try {
    for (const sql of ENSURE_COLUMNS_SQL) await db.$executeRawUnsafe(sql);
    return true;
  } catch (error) {
    log.error('[schema] could not add the new column(s); run `npm run db:deploy`', error instanceof Error ? error.message : error);
    return false;
  }
}

/** Runs the repair and returns how many requests were put back. Never throws: a failed repair must not stop the API from starting. */
export async function repairPrematurelyPaidServiceRequests(db: { $executeRawUnsafe: (sql: string) => Promise<number> }, log: Pick<Console, 'info' | 'error'> = console): Promise<number> {
  try {
    // One statement per call: the database driver does not run several at once.
    const repaired = Number(await db.$executeRawUnsafe(REPAIR_PREMATURELY_PAID_SQL));
    const rebalanced = Number(await db.$executeRawUnsafe(REPAIR_STALE_BALANCE_SQL));
    if (repaired > 0) log.info(`[service-repair] restored ${repaired} service request(s) that were marked PAID before being billed`);
    if (rebalanced > 0) log.info(`[service-repair] corrected the balance due on ${rebalanced} service request(s)`);
    return repaired + rebalanced;
  } catch (error) {
    log.error('[service-repair] could not run the PAID-status repair', error instanceof Error ? error.message : error);
    return 0;
  }
}
