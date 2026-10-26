# V MOTIV V2 — Resend Transactional Email Templates

All transactional messages are generated using verified responsive HTML lockups in `services/api/src/email-templates.ts`.

## 1. Supported Template Versions

| Template Version Key | Purpose & Category | Primary CTA Button | Badge Title & Color |
| :--- | :--- | :--- | :--- |
| `welcome-v1` | Customer registration welcome | `Browse Verified Cars` | `ACCOUNT CONFIRMED` (`#10B981`) |
| `employee-invitation-v1` | Secure employee onboarding | `Review invitation` | `EMPLOYEE INVITATION` (`#F7B503`) |
| `selling-requested-v1` | Doorstep valuation booking | `Track Valuation` | `SELLING REQUEST` (`#F7B503`) |
| `inspection-assigned-v1` | Inspector job assignment | `Open Inspector App` | `INSPECTION ASSIGNED` (`#F7B503`) |
| `inspection-rework-v1` | Reviewer correction notes | `Review Feedback` | `CORRECTIONS REQUIRED` (`#EF4444`) |
| `inspection-approved-v1` | Quality certification approved | `View Certification` | `INSPECTION APPROVED` (`#10B981`) |
| `inspection-requested-v1` | Operations dispatch queue alert| `Open Operations` | `INSPECTION REQUEST` (`#3B82F6`) |
| `offer-communicated-v1` | Official car purchase offer | `Review Offer` | `PURCHASE OFFER` (`#10B981`) |
| `offer-accepted-v1` | Direct purchase agreement | `View Offer Details` | `OFFER ACCEPTED` (`#10B981`) |
| `payment-verified-v1` | Bank wire transfer confirmation | `View Account` | `PAYMENT VERIFIED` (`#10B981`) |
| `test-drive-requested-v1` | Customer test drive booking | `Manage Appointment` | `TEST DRIVE REQUEST` (`#F7B503`) |
| `purchase-enquiry-v1` | Customer vehicle inquiry | `View in Activity` | `ENQUIRY RECORDED` (`#F7B503`) |
| `retail-quotation-v1` | Authorized car sales quote | `View & Accept Quotation` | `OFFICIAL QUOTATION` (`#2563EB`) |
| `support-case-v1` | Support ticket opened | `View Support Case` | `SUPPORT TICKET` (`#F7B503`) |
| `support-reply-v1` | Concierge message reply | `View Conversation` | `CASE UPDATE` (`#F7B503`) |

---

## 2. Template Structure & Brand Standards

- **Header Lockup**: Official horizontal dark-theme logo (`https://iili.io/neuRn49.png`).
- **Accent Badge**: Highlighting event urgency and category.
- **Body Content**: Formatted multi-line paragraphs and bulleted detail lists.
- **Call-To-Action (CTA)**: High-contrast primary action pill redirecting to authorized web portal or mobile deep link.
- **Footer Guarantee**: Official lockup (`https://iili.io/neuRrZl.png`) and legal disclaimer regarding authorized communications from `vmotiv.in`.
