-- Widens the earlier repair (20261109000000, left as it was because it may already be applied) and fixes its balance.
--
-- 1. Besides the online / finance payment paths, a payment recorded at the counter (walk-in or advisor) also moved a request that
--    had no estimate or invoice to PAID, or to PAYMENT_PENDING when only part was paid. Both are past the estimate step, so extra
--    labour on a prepaid package, estimate approval, check-in and diagnosis were all refused as "closed". Only requests that are PAID
--    or PAYMENT_PENDING *and have no invoice* are touched; each goes back to the status it had before the first such payment (from
--    the history log). An advance's remaining balance is recomputed from the booking plan and what has actually been collected.
-- 2. The earlier repair restored that balance from the plan alone, ignoring payments made afterwards, so a fully paid package showed
--    a balance due again. Where no invoice exists and the stored balance is higher than plan total minus collected, it is lowered to
--    that figure. It is never raised.
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
  AND NOT EXISTS (SELECT 1 FROM "ServiceInvoice" i WHERE i."serviceRequestId" = sr.id);

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
  AND NOT EXISTS (SELECT 1 FROM "ServiceInvoice" i WHERE i."serviceRequestId" = sr.id);
