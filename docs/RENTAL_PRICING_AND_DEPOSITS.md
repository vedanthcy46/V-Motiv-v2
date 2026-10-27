# V MOTIV V2 — Rental Pricing Engine & Security Deposits

## 1. Versioned Pricing Architecture

Rental rates are computed by an immutable, server-side versioned pricing engine (`VMR-TERMS-V2026.1`). Client applications display computed quotes but are never permitted to dictate prices or fee calculations.

### Core Calculation Formula:
$$\text{Duration} = \text{endTime} - \text{startTime} \quad (\text{hours})$$
$$\text{Days} = \lfloor \text{Duration} / 24 \rfloor, \quad \text{Remainder Hours} = \text{Duration} \pmod{24}$$
$$\text{Base Fare} = (\text{Days} \times \text{Daily Rate}) + (\text{Remainder Hours} \times \text{Hourly Rate})$$
$$\text{GST (18\%)} = \frac{\text{Base Fare} \times 18}{100} \quad (9\% \text{ CGST} + 9\% \text{ SGST})$$
$$\text{Total Payable} = \text{Base Fare} + \text{GST} + \text{Security Deposit}$$

---

## 2. Security Deposit Policy & Refund Guarantee

1. **Zero Tax on Deposit**: Security deposits are statutory performance guarantees and are exempt from Goods and Services Tax (GST).
2. **Dedicated Ledger Tracking**: Security deposits are categorized separately in the financial ledger as `REFUNDABLE_DEPOSIT` and never co-mingled with rental revenue.
3. **Automated Return Reconciliation**:
   - If return inspection is clean: Full deposit is refunded via bank NEFT / payment gateway reversal within **3 business days**.
   - If excess km or fuel refill charges apply: Charges are deducted from the deposit, and the net positive balance is refunded.
   - If damages are disputed: Disputed damage is **never auto-deducted**; it is held in escrow until formal Finance investigation is concluded.

---

## 3. Distance & Fuel Rules

- **Standard Allowance**: **250 km / day** included in standard base fare.
- **Excess Kilometer Charges**: Billed at fixed vehicle rate (e.g. ₹12 / km for compact SUVs, ₹15 / km for MPVs).
- **Fuel Policy**: **Same-to-same**. Hub dispatch documents initial fuel percentage (e.g., 85%). If the customer returns the vehicle with 70%, the 15% deficit is charged at market fuel rate (~₹65 per 1% fuel capacity) with no punitive hidden fees.
