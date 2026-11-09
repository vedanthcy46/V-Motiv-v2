-- Repair service requests that were marked PAID before they were ever billed.
--
-- Until now, paying the booking amount (the diagnostic fee, a prepaid package, an advance) set the whole request to PAID, because
-- with no estimate or invoice yet the amount owed was taken as the bill. A PAID request counts as finished, so check-in, diagnosis,
-- the estimate (including extra labour on a prepaid package) and approval were all refused ("closed").
--
-- Only requests that are PAID *and have no invoice* are touched: a billed job that was really settled is left alone. Each is put back
-- to the status it had just before the premature PAID event, which the history log recorded. Money is not changed, except that an
-- advance's remaining balance, wrongly zeroed by the same bug, is restored from the booking plan saved with the request.
WITH premature AS (
  SELECT DISTINCT ON (e."serviceRequestId") e."serviceRequestId" AS id, e."fromStatus" AS previous_status
  FROM "ServiceHistoryEvent" e
  WHERE e."toStatus" = 'PAID'
    AND e."fromStatus" IS NOT NULL
    AND e."fromStatus" NOT IN ('PAID', 'COMPLETED', 'CANCELLED', 'RETURN_DISPATCHED', 'READY_FOR_COLLECTION')
    AND e.title IN ('Payment Verified Online', 'Payment Verified by Finance')
  ORDER BY e."serviceRequestId", e."createdAt" DESC
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
  AND sr.status = 'PAID'
  AND NOT EXISTS (SELECT 1 FROM "ServiceInvoice" i WHERE i."serviceRequestId" = sr.id);
