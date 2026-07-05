# Full Order Summary — Two Orphan RinggitPay Payments (2026-06-23)

Both are real, successful, paid card transactions with **no order record in any of our
systems** — they exist only at the RinggitPay gateway. Created by the old Medusa backend's
`temp_<timestamp>` fallback (fires when cart/customer context is missing at payment); that
backend and its Railway Postgres have since been decommissioned.

---

## Re-verification — 2026-07-01 (live Transaction Enquiry API)

Queried the production RinggitPay enquiry API (`RPA-AWAKENE-1027`) for both refs; responses
checksum-valid. Findings:

- Both still **`RP00` SUCCESS** — confirmed captured at the gateway as of 2026-07-01.
- **Payment mode is `DC` (debit card), NOT `CC` (credit card).** The gateway export/CSV
  recorded `CC`; the enquiry API returns `DC` for both. Two RinggitPay sources disagree —
  treat card type as debit unless the merchant portal says otherwise.
- **No linkage metadata at the gateway**: `rp_ref1`–`rp_ref6` all `NA`, `rp_xtraInfo` null,
  `rp_remarks` empty, `rp_buyerEmail` null. Nothing recoverable there to identify the buyer —
  the timing-based email correlation is the ceiling.
- The enquiry API has **no settlement/payout field** — it cannot confirm the payout landed.
- Live backend-lite DB: **0** orders/carts/customers/sessions — the `cus_01KV…` IDs are not
  recoverable locally (they died with the Railway backend).
- Merchant Gmail `fudunchuan.rsn@gmail.com`: **zero** RinggitPay emails (inbox/trash/spam) —
  RinggitPay notifications go to some other address; that is the route to settlement + receipts.

---

## Order A — MYR 10,441.00

| Field | Value |
|---|---|
| RinggitPay Order ID | `temp_1782236726939` |
| Transaction ref | `260623174544698` |
| Status | SUCCESS / captured (`RP00`, checksum valid) |
| Amount | MYR 10,441.00 (credit card, `CC`) |
| Date/time | 2026-06-23 17:46:59 UTC |
| Payment country | Lithuania |
| Settlement | Commission MYR 187.94 → net MYR 10,253.06, status PENDING, dated 26-Jun-2026 |
| Customer (by timing) | umicoqimu709@gmail.com — cus_01KVTSC38655TGNPAJ9FT6K93W (created 15 s before payment) |
| Name / phone / address | none on record anywhere |
| Products | UNIQUE: 1x Yongzheng L (RM 1,288) + 4x Kangxi L (RM 2,288), + RM 1 fee |

---

## Order B — MYR 5,153.00

| Field | Value |
|---|---|
| RinggitPay Order ID | `temp_1782233292842` |
| Transaction ref | `260623164819679` |
| Status | SUCCESS / captured (`RP00`, checksum valid) |
| Amount | MYR 5,153.00 (credit card, `CC`) |
| Date/time | 2026-06-23 16:49:50 UTC |
| Payment country | Lithuania |
| Settlement | Commission MYR 92.75 → net MYR 5,060.25, status PENDING, dated 26-Jun-2026 |
| Customer (by timing) | nakulas@gmail.com — cus_01KVTP33CF44HVHG0AYXF7VVNB (created 21 s before payment) |
| Name / phone / address | none on record anywhere |
| Products | 3 possibilities (+RM 1 fee): (1) 4x Yongzheng L (1,288); (2) 1x coin (288) + 2x Yongzheng L + 1x Kangxi L; (3) 2x coin + 2x Kangxi L |

---

## Confidence per field

| Data point | Confidence | Basis |
|---|---|---|
| Paid / amount / settlement | Certain | RinggitPay enquiry API + merchant export agree |
| Customer email | High | Timing correlation only (created 15-21 s before payment); no hard FK |
| Products — Order A | Near-certain | Mathematically unique basket for the total |
| Products — Order B | Medium | 3 valid baskets; can't isolate one |
| RM 1 fee model | Confirmed | Independently proven by 3 other failed txns (289, 577, 5,065) in the export |
| Name / phone / address | Non-existent | Absent from dump, live DB, RinggitPay enquiry, and export |

## Sources checked (all exhausted)

1. Live backend-lite DB — logs start 2026-06-30; no trace.
2. Railway migration dump — catalog-only, no orders.
3. Old Railway backend + Postgres — service deleted ("Application not found"), no saved credentials.
4. RinggitPay enquiry API — confirmed paid; rp_buyerEmail null.
5. RinggitPay merchant export (Google Sheet) — confirmed paid + settlement; Payer_Email empty, no line items/address.

## Worth acting on

- Verify both payouts actually landed — settlement showed PENDING in the export (~MYR 15,313 net combined).
- Fraud/chargeback sanity check — both card payments from Lithuania, large MYR amounts, throwaway-looking Gmail addresses, no captured shipping info.
- Only contact route is emailing umicoqimu709@gmail.com and nakulas@gmail.com — no other buyer details exist to recover.
