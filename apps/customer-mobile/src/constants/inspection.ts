// The one place that says how many points a V MOTIV inspection covers. Every screen that mentions it reads from here, so the number can never
// differ between screens. To change it, change INSPECTION_POINTS below AND the same constant in services/api/src/inspection-claim.ts and
// apps/customer-web/src/inspection.ts (a test in services/api checks that all three agree and that no file spells its own number).
//
// Note: this is the number the business markets. The digital inspector checklist (services/api/src/inspection-template.ts) is shorter, and the
// "Total Checks" figure on a finished report is the real number of checks recorded for that car; neither is touched by this constant.

export const INSPECTION_POINTS = 200;

/** "200-point", for use in a sentence: `${INSPECTION_POINT} certified cars`. */
export const INSPECTION_POINT = `${INSPECTION_POINTS}-point`;
