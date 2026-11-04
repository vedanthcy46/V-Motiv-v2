// Preview of what the customer will pay after deferring optional estimate items.
// The server recalculates and stores the authoritative total when the estimate is approved
// (services/api/src/estimate-totals.ts); keep both in sync (integer paise, GST 9% + 9%).

export interface PreviewItem {
  id: string;
  quantity: number;
  unitPricePaise: string | number;
  isMandatory: boolean;
}

export interface EstimatePreview {
  subtotalPaise: bigint;
  gstPaise: bigint;
  totalPaise: bigint;
}

export function previewApprovedTotals(
  items: PreviewItem[],
  deferredIds: ReadonlySet<string>,
  pickupDropFeePaise: string | number = 0,
  diagnosticFeePaise: string | number = 0,
  discountPaise: string | number = 0,
): EstimatePreview {
  let subtotal = 0n;
  for (const item of items) {
    if (deferredIds.has(item.id) && !item.isMandatory) continue;
    subtotal += BigInt(item.quantity || 1) * BigInt(item.unitPricePaise);
  }
  const taxable = subtotal + BigInt(pickupDropFeePaise || 0) + BigInt(diagnosticFeePaise || 0) - BigInt(discountPaise || 0);
  const cgst = (taxable * 9n) / 100n;
  const sgst = (taxable * 9n) / 100n;
  return { subtotalPaise: subtotal, gstPaise: cgst + sgst, totalPaise: taxable + cgst + sgst };
}
