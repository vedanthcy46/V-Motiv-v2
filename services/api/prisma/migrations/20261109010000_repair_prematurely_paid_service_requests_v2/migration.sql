-- Widens the earlier repair (20261109000000, left as it was because it may already be applied).
--
-- Besides the online / finance payment paths, a payment recorded at the counter (walk-in or advisor) also moved a request that
-- had no estimate or invoice to PAID, or to PAYMENT_PENDING when only part was paid. Both are past the estimate step, so extra
-- labour on a prepaid package, estimate approval, check-in and diagnosis were all refused as "closed".
--
-- Only requests that are PAID or PAYMENT_PENDING *and have no invoice* are touched. Each goes back to the status it had before the
-- first such payment (from the history log); money is unchanged, except an advance's remaining balance, restored from the saved plan.
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
  AND NOT EXISTS (SELECT 1 FROM "ServiceInvoice" i WHERE i."serviceRequestId" = sr.id);
