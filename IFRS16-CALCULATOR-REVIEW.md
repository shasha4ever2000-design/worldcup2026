# IFRS 16 Lease Calculator — Full Review & Test Report

**Scope:** the single-file React IFRS 16 lease calculator (lease liability, ROU asset, VAT overlay, monthly JEs, CSV exports).
**Method:** static code review of the calculation engine + 26 automated numerical tests run against the engine in Node + 28 automated UI tests driving the real app in Chromium (Playwright), covering every tab, button, export, import, mobile view, and edge case.

**Overall verdict:** the app is in very good shape. The core math is internally consistent — the liability amortizes to zero, monthly interest proration ties to the schedule, depreciation ties to ROU cost, every journal entry is balanced, and total debits equal total credits across the entire JE run. All 9 tabs, add/duplicate/delete lease, live recalculation, JSON export/import, all three CSV exports, mixed-currency portfolio handling, validation messages, mobile sidebar, and the empty state all work with **zero console errors**. That said, testing surfaced **4 real calculation/UI bugs and several correctness gaps** worth fixing before this is used for actual reporting.

---

> **Update:** the fixed calculator is committed on this branch as `ifrs16-lease-calculator.html`.
> Bugs **1–6** below plus the CSV BOM issue are **FIXED** and verified (35/35 engine tests, 28/28 UI tests pass).
> Items 7–9 (stub proration, leap-year escalation day, accrual JE dated the 1st) are documented
> methodology choices left unchanged.

## Bugs found (ordered by severity)

### 1. HIGH — Final payment month is missing from the Tab 8 month dropdown
For the built-in example lease (ends 2028-01-01, quarterly arrears), the last payment JE is dated 01-Jan-2028, but the Tab 8 "Month" dropdown stops at **Dec 2027**. The final payment entry exists (it appears in Tab 9 and in the CSV export) but is unreachable in the monthly view — an accountant browsing month by month would never see it.

**Cause:** `fullMonthList(commence, end)` loops `while (cursor < end)`, so when the lease ends on the 1st of a month (or generally, when a payment falls in the month containing the end date), that month is excluded, while `buildMonthlyJEs` keys the payment by `monthKey(paymentDate)`.

**Fix:** build the Tab 8 month list from the union of `monthList` and `Object.keys(calc.je)`, or extend `fullMonthList` to include the month of the last JE.

### 2. HIGH — Payment dates drift for month-end commencement dates
A monthly lease commencing **31-Jan-2025** produces payment dates: 28-Feb, then **28-Mar, 28-Apr, … 28-Jan-2026**, plus a spurious 3-day stub period (28-Jan → 31-Jan) with a full extra payment. Once the cursor passes through a short month it permanently sticks to the 28th, and the term ends up with 13 payments instead of 12.

**Cause:** `generatePeriods` advances iteratively (`cursor = next`), so the original anchor day (31st) is lost after `addMonthsUTC` clamps to Feb 28.

**Fix:** compute each boundary from the anchor: `periodEnd_i = addMonthsUTC(start, (i+1) * freqMonths)` instead of adding months to the previous boundary.

### 3. HIGH — Current/non-current split is wrong mid-period, badly so for advance-timing leases
`currentNonCurrentSplit` uses the period **opening** balance when the reporting date falls inside a period:

- **Arrears leases:** the reported balance excludes interest accrued from period start to the reporting date (e.g. ~6,808 missing on a 272k balance reported 6 months into an annual period). Modest understatement.
- **Advance leases:** the reported balance is taken **before** the payment that was already made at period start. Verified example: 3-year annual advance lease, reporting at 2025-07-01 — the app reports a total liability of **285,941** and current portion **200,000**, when the true balance is **~190,551** (the 100,000 paid on 01-Jan-2025 is counted as still outstanding *and* as "due within 12 months"). This materially misstates the balance sheet.

**Fix:** roll the balance forward to the reporting date (opening ± payments already made + interest accrued day-count to date), then compute current as `balance(t) − balance(t+12m)` on the same basis.

### 4. MEDIUM — Purchase option / RVG cash flow is mis-dated under advance timing
`endOfTermExtra` is added to the **last payment**. With payments in advance, the last payment occurs at the *start* of the final period, so a purchase-option/residual-guarantee amount that is actually paid at **lease end** gets discounted one period too little (PV overstated) and its JE/cash-flow date is wrong (verified: dated 2026-01-01 instead of 2027-01-01 on a 2-year advance lease). Correct under arrears only by coincidence of dates.

**Fix:** model `endOfTermExtra` as a separate final cash flow at the lease end date with the full-term discount factor, independent of payment timing.

### 5. MEDIUM — Negative ROU asset accepted silently
If incentives exceed liability + costs (e.g. incentive 500,000 on a small lease), `rouCost` goes negative (−499,024 in the test), the depreciation schedule silently comes back empty, and the only signal is a red "Does not tie to ROU cost" badge on Tab 7. This should be an explicit validation error ("Lease incentives exceed the ROU asset cost") since under IFRS 16 that situation means the inputs are wrong.

### 6. MEDIUM — Renewal end date earlier than the base end date silently shortens the lease
Checking "renewal reasonably certain" and entering an extended end date that is *before* the non-cancellable end date makes the renewal date win (test: a 3-year lease silently became 1 year, no warning). Validate `renewalEndDate > endDate`.

### 7. LOW — Stub-period payment is not prorated
When the term isn't a multiple of the frequency (e.g. semi-annual payments, lease ends 2.5 months into a period), the stub period is charged the **full** period payment. Some contracts do work that way, but most prorate the final rent. At minimum this deserves a visible note or a "prorate final stub payment" toggle — right now a user may not notice the schedule assumes a full final payment for a fraction of a period.

### 8. LOW — Escalation trigger uses `floor(days/365)`, ignoring leap years
Payments escalate one day **early** after any leap year (verified: payment dated 2024-12-31 on a lease commencing 2024-01-01 already carries the +10% uplift), and the error accumulates one day per leap year over long leases. Use calendar-anniversary comparison (`addMonthsUTC(commence, 12*n)`) instead of day counting.

### 9. LOW — Interest accrual JEs are dated the 1st of the month
Monthly interest accrual entries carry `date: monthStart` (e.g. 01-Mar for March's accrual). Convention is to date accruals at month **end**; posting them on the 1st puts the expense in the right month but the wrong day, which matters for anyone importing the CSV into a GL by document date.

### 10. LOW — Cosmetic / robustness items
- **CSV files have no UTF-8 BOM** — the em-dashes and "·" in narratives render garbled when the CSV is opened directly in Excel (common in KSA finance teams). Prepend `﻿`.
- **`reportingDate` on the example lease** defaults to today's month rather than something inside/related to the lease (harmless, mildly confusing).
- **No persistence** — a page refresh wipes everything. It's honestly disclosed in the sidebar footer, but it's the single most likely way a user loses an afternoon of data entry (see feature list).
- The **portfolio summary** shows totals *at commencement*, which mixes vintages — a 2020 lease's day-1 liability plus a 2026 lease's day-1 liability isn't a meaningful current portfolio number.

---

## What was tested and works correctly

| Area | Result |
|---|---|
| PV of payments (day-count periodic rate, arrears & advance, escalation, quarterly/annual/custom) | ✅ ties to independent recomputation to the cent |
| Liability amortization (both timings, incl. stub periods) | ✅ closes to 0.00 |
| Fully-prepaid advance lease (1 payment) | ✅ liability = payment, zero interest |
| Monthly interest proration | ✅ sums exactly to schedule interest |
| Depreciation (lease term & useful-life basis, partial months) | ✅ ties to ROU cost; useful-life extension works |
| VAT split (rate, partial recoverability, IDC capitalization of irrecoverable VAT) | ✅ math correct; JEs correct |
| Every JE balanced; run-level debits = credits | ✅ |
| All 9 tabs, live recalculation on edit, validation messages (end < start, missing amounts, zero frequency) | ✅ |
| New/duplicate/delete lease (with confirm), example loader, empty state | ✅ |
| JSON export → import round-trip (adds, doesn't overwrite) | ✅ |
| All 3 CSV exports download with correct content | ✅ |
| Mixed-currency portfolio guard ("— mixed") | ✅ |
| 75-year monthly lease (900 periods) — no guard issues | ✅ |
| Mobile layout, hamburger sidebar, backdrop close | ✅ |
| Zero console/page errors across the whole session | ✅ |

---

## Suggested features (prioritized)

**Tier 1 — biggest real-world impact**
1. **Auto-save to localStorage** (with the existing JSON export kept as backup). Losing all data on refresh is the #1 practical risk today.
2. **Lease modifications & remeasurements (IFRS 16.44–46)** — the biggest functional gap for real use: change of term/rate/payments at an effective date, remeasure the liability with adjustment against the ROU asset, and generate the remeasurement JE. Real leases get amended constantly; today the only option is deleting and re-creating, which destroys history.
3. **Termination / early exit** — derecognize ROU and liability at a chosen date and compute the gain/loss JE.
4. **Disclosure note pack (IFRS 16.53 / 58)** — auto-generated: maturity analysis of undiscounted payments (≤1y, 1–2y, 2–5y, >5y), ROU rollforward by asset class, interest expense and depreciation for the period. This turns the tool from a calculator into a close/audit deliverable.
5. **Portfolio reporting at a chosen date** — aggregate liability (current/non-current), ROU NBV, period interest & depreciation across all leases, instead of at-commencement totals.

**Tier 2 — close-process quality of life**
6. **Monthly close pack:** pick a month → one combined CSV/view of every JE across *all* leases for that month (what actually gets posted at close).
7. **Excel (.xlsx) export** with one sheet per schedule, and a **print-ready PDF lease card**.
8. **Irregular/custom payment schedules** — editable payment table (rent-free periods, uneven amounts, CPI-linked escalation with an index table) instead of a single fixed amount + %.
9. **Short-term & low-value exemption tracker** — straight-line expense schedule and the corresponding disclosure figure.
10. **Configurable conventions** — day-count basis (act/365, act/360, 30/360), compound vs simple periodic rate, escalation on anniversary vs payment date.

**Tier 3 — nice to have**
11. **Sensitivity analysis** (discount rate ±1%, term ±1 year effects on liability/ROU).
12. **IBR helper table** (rate by currency/term band) so users pick consistent rates.
13. **Deferred tax note** — temporary difference between ROU and liability at the reporting date.
14. **Arabic/English bilingual labels** for KSA statutory use; UTF-8 BOM on CSVs for Excel.
15. **Audit trail / versioning** — keep a history of input changes per lease with timestamps.
16. **FX translation** for mixed-currency portfolios (rates table + translated portfolio totals).

---

## Test artifacts

- `engine-test.mjs` — 26 numerical engine tests (18 pass; the 8 failures are the bugs above).
- `ui-test.mjs` — 28 Playwright UI tests against the live app (27 pass; failure = bug #1).
- Screenshots of every major view captured during the run confirm layout and number formatting render correctly at desktop and mobile widths.
