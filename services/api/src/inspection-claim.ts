// The one place in the API that says how many points a V MOTIV inspection covers (emails, badges, default summaries).
// Keep it equal to apps/customer-mobile/src/constants/inspection.ts and apps/customer-web/src/inspection.ts; test/inspection-claim.test.ts checks.
// This is the marketed number. The inspector checklist (inspection-template.ts) is shorter, and a finished report's own totals are counted
// from the checks actually recorded, so neither is derived from this constant.

export const INSPECTION_POINTS = 200;

/** "200-point", for use in a sentence. */
export const INSPECTION_POINT = `${INSPECTION_POINTS}-point`;
