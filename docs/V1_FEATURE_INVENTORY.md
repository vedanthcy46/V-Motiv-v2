# V1 source inventory and reuse decisions

V1 root: ../v-motiv-app. Additional legacy website: ../v-motiv-connect.
This inventory is a source map for subsequent audits, not a certification that every V1 rule is correct.

| Source | Disposition | V2 follow-up |
| --- | --- | --- |
| apps/api/src/modules/vehicles | Requires review/refactoring | Preserve canonical vehicle identity, history and state rules |
| acquisition-leads, operations | Requires review/refactoring | Qualification, offers, independent approval, assignment/custody gates |
| inspections; checklist-template.ts | Useful reference | Versioned reports, evidence, reviewer separation and mobile drafts |
| inventory, vehicle-media | Requires review/refactoring | Publication gates and private storage authorization |
| sales, quotations | Requires review/refactoring | Versioned pricing/quotes, reservations, historical provenance |
| payouts | Requires review/refactoring | Settlement evidence, idempotency and separation of duties |
| access, admin, audit | Requires review/refactoring | RBAC, scope, suspension, immutable audit and controlled exports |
| support, master-data, exports | Useful reference | Governed operational controls |
| auth and notifications | Rewrite | Replace mandatory SMS OTP with Firebase Google identity and Resend |
| apps/web, apps/mobile, v-motiv-connect | Reference only | Rebuild screens; retain customer mobile and website requirements |
| prisma/schema.prisma and migrations | Migration reference | No copying/resetting V1 database; explicit mapping before real data migration |

Direct code reuse so far: none. V2 implements a fresh identity/email foundation. V1 source and migrations remain unchanged.
Domain entities beyond identity/email are intentionally not duplicated prematurely.

