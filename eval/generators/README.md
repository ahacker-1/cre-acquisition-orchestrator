# Synthetic CRE Benchmark Dataset Generator

Deterministic generator for the evaluation benchmark defined in
[`EVAL-PLAN.md`](../../EVAL-PLAN.md) **Phase 1**. It emits **8 synthetic
commercial-real-estate deals** under [`eval/benchmark/deals/`](../benchmark/deals)
— each with a schema-valid `deal.json`, synthetic source documents carrying
realistic messiness, and a machine-readable `ground-truth.json` answer key.

> **All data is synthetic.** No real listings, no scraped data, no PII. Property
> names, addresses, sellers, and brokers are invented.

---

## How to regenerate

```bash
python eval/generators/generate_deals.py
```

Re-running rewrites the full dataset in place. The generator is **deterministic
and idempotent**: no `random`, no `datetime.now()`. Excel workbooks are written
with frozen document timestamps and frozen zip-entry mtimes, and PDFs use
reportlab `invariant=1`, so every produced file is **byte-identical run to run**
(verified via SHA-256 of all 40 files across two runs).

Requirements (already present in this repo's Python env): `openpyxl`,
`reportlab`. The dataset is consumed by the eval harness (`npm run eval`,
Phase 2) and can also be re-parsed directly with `scripts/parse_excel.py` /
`scripts/parse_pdf.py`.

---

## Honesty model (the cardinal rule)

There is exactly **one canonical spec per deal** (`DealSpec` in
`generate_deals.py`). Every artifact — `deal.json`, the documents, **and** the
ground truth — is **derived from that single spec**.

* Ground truth is computed straight from the **planted economic values**. It is
  **never** reverse-engineered to match parser output.
* The documents are rendered **from the same spec**, so the documents and the
  answer key are consistent **by construction**.
* The rent-roll / occupancy / GPR figures in ground truth use the same
  aggregation an analyst (and the deterministic parser) would apply to the
  planted unit rows — `occupancy = occupied / total`,
  `GPR_annual = Σ(market_rent) × 12`, `in_place_annual = Σ(occupied × actual_rent) × 12`.
  This is the objectively-correct arithmetic on the planted rows, not chasing a
  number.

If a future parser change makes extraction more or less accurate, **the answer
key does not move.** Extraction gaps are reported as findings, not patched into
the truth.

---

## The 8 deals

| # | dealId | Archetype | Units | Price | LTV | Rate | Cap | DSCR | IRR\* | EM\* | Verdict | Key planted issue |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 1 | `cp-stabilized-clean` | core-plus | 120 | $19.17M | 0.65 | 5.8% | 6.00% | 1.31 | 0.110 | 1.63 | **PASS** | none (false-positive control) |
| 2 | `cp-insurance-understated` | core-plus | 120 | $20.0M | 0.65 | 6.0% | 5.74% | 1.23 | 0.100 | 1.57 | **CONDITIONAL** | insurance line understated in T12 |
| 3 | `cp-concentration-risk` | core-plus | 120 | $17.0M | 0.60 | 6.1% | 5.65% | 1.29 | 0.092 | 1.52 | **CONDITIONAL** | single-employer tenant concentration |
| 4 | `va-sub120-dscr` | value-add | 150 | $15.5M | 0.72 | 6.5% | 6.18% | 1.13 | 0.112 | 1.67 | **CONDITIONAL** | going-in DSCR ~1.13 (sub-1.20 floor) |
| 5 | `va-overlevered-ltv` | value-add | 156 | $18.4M | 0.82 | 6.4% | 5.22% | 0.85 | 0.069 | 1.42 | **CONDITIONAL** | targetLTV 0.82 (over-levered) |
| 6 | `va-missing-phase1` | value-add | 128 | $15.8M | 0.70 | 6.3% | 5.97% | 1.15 | 0.107 | 1.63 | **CONDITIONAL** | no Phase I ESA + OM NOI overstates T12 |
| 7 | `ds-occupancy-collapse` | distressed | 150 | $9.8M | 0.70 | 6.8% | 0.55% | 0.10 | -0.990 | -2.38 | **FAIL** | 62% occupancy, no bridge (dealbreaker) |
| 8 | `ds-dscr-below-080` | distressed | 120 | $9.2M | 0.75 | 7.2% | 3.48% | 0.57 | -0.627 | -0.29 | **FAIL** | going-in DSCR < 0.80 (dealbreaker) |

\* IRR and equity multiple are **model-dependent** (see below); negative values
on the distressed dealbreaker deals are the honest "capital is destroyed as
structured" outcome, not an error.

Verdicts use the canonical tokens `PASS | CONDITIONAL | FAIL` (never `GO/NO_GO`).

---

## Reference underwriting model

Determinable metrics are exact arithmetic on the planted spec; model-dependent
metrics use the transparent assumptions below (implemented in
`reference_irr_and_em` / `_grow_noi` / `annual_debt_service` /
`remaining_balance` / `irr_bisection`).

### Determinable (tight tolerance — real accuracy)

| Metric | Formula | Tolerance |
|---|---|---|
| `egi` | T12 Effective Gross Income (planted) | relative ±2% |
| `noi` | `EGI − OpEx_total` (T12 ties out: OpEx_total = Σ expense lines) | relative ±2% |
| `capRate` | `NOI / askingPrice` (going-in) | absolute ±0.0015 |
| `dscr` | `NOI / annualDebtService` | absolute ±0.08 |

`annualDebtService` uses the standard level-payment mortgage formula on
`loan = askingPrice × targetLTV` at `estimatedRate` over the `amortization`
period. If the interest-only period covers the whole hold (`ioPeriod ≥ hold`)
or `amortization = 0`, debt service is pure interest (`loan × rate`).

### Model-dependent (wide, clearly-labeled tolerance)

| Metric | Tolerance |
|---|---|
| `irr` | absolute ±0.03 |
| `equityMultiple` | absolute ±0.20 |

Assumptions (a transparent 5-year hold, applied to the **in-place** NOI
trajectory):

* **Hold:** 5 years.
* **Growth:** revenue +3.0%/yr, expenses +2.4%/yr, modeled separately on an
  implied 55% expense ratio so the growth spread is faithful (`_grow_noi`).
* **Exit cap:** `going-in cap + 25 bps`, **floored at 5.5%**. The floor only
  binds on the depressed value-add/distressed deals: their in-place going-in cap
  is intentionally low (depressed NOI), and a literal "going-in + 25 bps" exit
  cap would fabricate an absurd exit value — a real buyer never exits a
  repositioned asset at a sub-market cap. The floor keeps the IRR/EM in a
  credible band.
* **Exit value:** forward (year hold+1) NOI capitalized at the exit cap, less a
  2% cost of sale.
* **Equity:** `askingPrice + closingCosts − loan`, with `closingCosts = 3% × price`.
* **Debt:** standard amortization with interest-only honored during the IO
  period; loan payoff at exit is the amortized remaining balance.
* **IRR:** solved by bisection on the levered cash-flow stream
  (`−equity, CF₁ … CF_hold + net reversion`). When no rate brackets a root
  (every period including the reversion is negative — the distressed deals),
  IRR is floored at `−0.99` to keep the answer key machine-clean.

**The reference IRR/EM run on in-place NOI, NOT on the sponsor's pro-forma
stabilization jump.** `proFormaNOI` stays in `deal.json` as the sponsor's
underwriting target, but baking it into the answer key would fabricate
optimistic returns. Running on in-place economics is the conservative,
defensible buy-hold-grow-sell return supported by the documents.

---

## Messiness catalog

Each rent roll / T12 carries a subset of these quirks (matched to the EVAL-PLAN
Phase 1 table — not every deal uses every quirk). All are handled by the repo's
existing parser; they exist to test extraction robustness.

| Quirk | Where | What it does |
|---|---|---|
| `alt-headers` | rent roll / T12 | alternate header synonyms (`Apt`/`Floor Plan`/`SF`/`Occupancy`; `Description`/`Total OpEx`/`NOI`) instead of canonical labels |
| `currency-symbols` | rent roll / T12 | amounts stored as text like `"$1,650"` / `"$1,248,000"` with `$` and thousands separators |
| `merged-header` | rent roll | `Market Rent` header merged across two rent columns (D:E); after unmerge + forward-fill this is genuinely ambiguous and the parser must surface a warning |
| `subtotal-rows` | rent roll | per-unit-group `Subtotal` rows plus a `Grand Total` row that must be excluded from the unit count and aggregates |
| `trailing-notes` | rent roll / T12 | free-text disclaimer/notes rows after the data table that must not be counted as units/line items |
| `occupancy-quirks` | rent roll | ambiguous status tokens (`MTM` → occupied, `Notice` → vacant) that the parser flags as ambiguous but still resolves |
| `multi-sheet` | T12 | a decoy `Summary` sheet precedes the real `T12` sheet; the parser must score sheets and pick the right one |
| OM-vs-T12 conflict | offering memo | (deal 6) the offering-memo headline NOI intentionally overstates the T12 NOI — both are honest planted values in their own document |
| title banners | rent roll / T12 | a merged full-width title row / leading title row (benign; skipped by header detection) |

Every deal's `documents[].quirks` array in `ground-truth.json` records exactly
which quirks that document carries.

---

## Planted-issue catalog

Only genuinely-planted issues appear in `redFlags` / `dealbreakers`. Each carries
a fair `keywords` array (terms a competent analyst would actually use) and a
`required` flag for the ones that MUST be caught. **Deal 1 has none** (it is the
false-positive control).

| Deal | id | Type | Required | Why it's real |
|---|---|---|:--:|---|
| 2 | `insurance-understated` | red flag (UNDERWRITING/HIGH) | yes | T12 insurance ≈ $342/unit, far below the ~$1,000/unit market for the vintage/region; correcting it compresses NOI |
| 3 | `tenant-concentration` | red flag (MARKET/MEDIUM) | yes | OM discloses ~60% of residents work for one employer → correlated vacancy risk |
| 4 | `dscr-sub-120` | red flag (FINANCING/HIGH) | yes | NOI / debt service ≈ 1.13, below the 1.20× agency floor at targeted leverage |
| 5 | `over-levered-ltv` | red flag (FINANCING/HIGH) | yes | `targetLTV = 0.82`; negative leverage (borrowing at 6.4% to buy a 5.22% yield), DSCR 0.85 |
| 6 | `missing-phase-1-esa` | red flag (ENVIRONMENTAL/HIGH) | yes | adaptive reuse of a former light-industrial parcel with NO Phase I ESA in the data room |
| 6 | `om-t12-noi-conflict` | red flag (UNDERWRITING/MEDIUM) | yes | OM headline NOI ($1.03M) overstates the T12 NOI ($0.943M) |
| 7 | `occupancy-collapse-no-bridge` | **dealbreaker** | yes | 62% occupancy financed with permanent (non-bridge) debt and no lease-up capital; in-place NOI cannot cover debt service (DSCR 0.10) |
| 7 | `deferred-maintenance` | red flag (PHYSICAL/MEDIUM) | no | condition decline behind the vacancy (informational, not required) |
| 8 | `dscr-sub-080` | **dealbreaker** | yes | going-in DSCR ≈ 0.57, well below 0.80; not financeable as structured |

---

## Output layout

```
eval/benchmark/deals/<dealId>/
├── deal.json            # input, valid against config/deal-schema.json
├── documents/
│   ├── rent-roll.xlsx   # synthetic rent roll (with planted messiness)
│   ├── t12.xlsx         # synthetic trailing-12 operating statement
│   └── offering-memo.pdf# text-layer offering memorandum
└── ground-truth.json    # answer key (EVAL-PLAN §0(a) shape)
```

`ground-truth.extraction.fields[]` uses the parser's **actual output dot-paths**
(`property.totalUnits`, `financials.inPlaceOccupancy`,
`financials.grossPotentialRentAnnual`, `financials.inPlaceRentAnnual`,
`financials.trailingT12Revenue`, `financials.trailingT12Expenses`,
`financials.currentNOI`, `financials.askingPrice`, `property.yearBuilt`) so the
harness can match extractions by path. A field is listed **only** when that value
genuinely exists in that deal's documents.

---

## Extending the dataset

Add a new `deal_*()` factory returning a `DealSpec`, append it to `all_specs()`,
and re-run. Keep the deal internally consistent (the T12 must tie out: NOI =
EGI − Σ expense lines), keep the going-in cap in a sane band, and make any
planted issue a number that genuinely breaches a threshold or a document that
genuinely conflicts/is missing. A Markdown offering-memo renderer
(`render_offering_memo_md`) is available if a `.md` memo is preferred over PDF.
