// Single source of truth for service estimate arithmetic (paise, integer maths, 18% GST split 9% + 9%).

export interface EstimateTotalsInput {
  items: Array<{ quantity?: number | bigint; unitPricePaise: number | bigint }>;
  pickupDropFeePaise?: number | bigint;
  diagnosticFeePaise?: number | bigint;
  discountPaise?: number | bigint;
}

export interface EstimateTotals {
  subtotalPaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  totalAmountPaise: bigint;
}

export function calculateEstimateTotals(input: EstimateTotalsInput): EstimateTotals {
  let subtotalPaise = 0n;
  for (const item of input.items) {
    subtotalPaise += BigInt(item.quantity || 1) * BigInt(item.unitPricePaise);
  }
  const taxableBase =
    subtotalPaise + BigInt(input.pickupDropFeePaise || 0) + BigInt(input.diagnosticFeePaise || 0) - BigInt(input.discountPaise || 0);
  const cgstPaise = (taxableBase * 9n) / 100n;
  const sgstPaise = (taxableBase * 9n) / 100n;
  return { subtotalPaise, cgstPaise, sgstPaise, totalAmountPaise: taxableBase + cgstPaise + sgstPaise };
}

export interface ScopeItem {
  description: string;
  quantity: number;
  isMandatory: boolean;
  isApprovedByCustomer: boolean;
}

/**
 * Text appended to a work order so technicians only perform what the customer approved.
 * Deferred (declined) lines are listed separately as "do not perform".
 */
export function formatApprovedScope(items: ScopeItem[]): string {
  if (items.length === 0) return '';
  const line = (i: ScopeItem) => `- ${i.description}${i.quantity > 1 ? ` x${i.quantity}` : ''}`;
  const approved = items.filter(i => i.isApprovedByCustomer);
  const deferred = items.filter(i => !i.isApprovedByCustomer);
  let out = '\n\nAPPROVED SCOPE (customer-approved estimate):\n' + approved.map(line).join('\n');
  if (deferred.length > 0) {
    out += '\n\nDEFERRED BY CUSTOMER - DO NOT PERFORM:\n' + deferred.map(line).join('\n');
  }
  return out;
}
