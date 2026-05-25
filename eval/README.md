# CRE Acquisition Orchestrator — Open Evaluation Harness

> **One command, honest numbers.** `npm run eval` scores the orchestrator on realistic
> synthetic deals with known correct answers and emits a machine-readable scorecard plus a
> human-readable trust report. The benchmark is open and designed to be extended.

## Why this exists

An impressive multi-agent architecture is not the same as a *measurably accurate* one. This
harness turns claims into numbers: how well does the system extract fields from messy documents,
compute the right financials, catch the planted red flags and dealbreakers, and reach the right
investment-committee verdict — on deals where we already know the correct answers?

## The cardinal rule: honesty

The eval is worthless if it isn't honest. We never fabricate, hardcode, round up, or cherry-pick
metrics, and we never tune the benchmark to flatter the system. A credible "71% and here's where it
breaks" beats a fake 99%. The scorer is a set of pure, unit-tested functions
(`eval/lib/scoring.mjs`, tested by `scripts/eval-scoring.test.mjs`) and tolerances are fixed in
`EVAL-PLAN.md` *before* any run.

## Three layers — and why they are NOT equivalent

| Layer | What runs | What it proves |
|---|---|---|
| **Live agent reasoning** | Real Codex LLM agents (`scripts/codex-agent-runner.js`) reason over each deal | **The headline.** Reflects the product's actual judgment. |
| **Deterministic simulation** | The offline demo engine (`scripts/orchestrate.js`) | A **fixture baseline, NOT reasoning.** Financials are fixed arithmetic on the inputs; the verdict is scenario/threshold-driven. A high score here is largely tautological. |
| **Extraction** | The document parsers (`parse_excel.py` / `parse_pdf.py` via `parser-service.ts`) | How well messy spreadsheets/PDFs are turned into correct field values. No LLM. |

The trust report always separates these. **Only the live layer measures reasoning.**

## Run it

```bash
npm run eval               # all three layers -> eval/results/{scorecard.json, TRUST-REPORT.md}
npm run eval:extraction    # deterministic parsers only (fast, no LLM)
npm run eval:sim           # deterministic simulation only (fast, no LLM)
npm run eval:live          # live Codex agents only (requires Codex CLI logged in; slow)
```

Useful flags (pass after `--`, e.g. `node eval/run-eval.mjs --mode live --deals va-overlevered-ltv`):

- `--mode all|extraction|sim|live` (default `all`)
- `--deals <id,id,...>` — score a subset
- `--workflow <id>` — live workflow (default `quick-deal-screen`: 5 due-diligence + 3 underwriting agents)
- `--concurrency <n>` — live Codex concurrency (default 3)
- `--model <name>` — record an explicit model name in the scorecard
- `--run-id <id>` — name the run (raw artifacts land in `data/eval-runs/<id>/`, gitignored)

The **live layer requires** the Codex CLI installed and logged in (`npm run codex:status` should
show "Logged in"). It clears any prior simulation outputs for a deal before its live run so the
agents reason from the deal inputs, not from pre-computed numbers.

## Outputs

- `eval/results/scorecard.json` — schema-valid (`eval/schemas/scorecard.schema.json`) machine-readable scorecard.
- `eval/results/TRUST-REPORT.md` — human-readable report, leading with the honesty framing and a
  dedicated "Where it breaks" section.
- `data/eval-runs/<runId>/` — raw per-deal system answers + run metadata (gitignored).

## The benchmark dataset

`eval/benchmark/deals/<dealId>/` contains, for each deal:

- `deal.json` — the deal input (valid against `config/deal-schema.json`).
- `documents/` — synthetic source documents (`rent-roll.xlsx`, `t12.xlsx`, `offering-memo.pdf`) with
  realistic messiness: merged header cells, currency-symbol strings, trailing notes / subtotal rows,
  alternate headers, multi-sheet workbooks, occupancy-convention quirks, and deliberate
  offering-memo-vs-T12 NOI conflicts.
- `ground-truth.json` — the machine-readable answer key (extraction fields with tolerances,
  determinable + model-dependent financial metrics, planted red flags, dealbreakers, and the correct
  IC verdict). See `EVAL-PLAN.md` §0(a) for the schema.

The eight committed deals span the spectrum and plant specific, detectable issues:

| dealId | Archetype | Planted issue | Expected IC |
|---|---|---|---|
| `cp-stabilized-clean` | core-plus | none (false-positive control) | PASS |
| `cp-insurance-understated` | core-plus | T12 insurance line far below market | CONDITIONAL |
| `cp-concentration-risk` | core-plus | single-employer tenant concentration (~60% one employer) | CONDITIONAL |
| `va-sub120-dscr` | value-add | going-in DSCR ~1.13 (below the 1.20 floor) | CONDITIONAL |
| `va-overlevered-ltv` | value-add | 82% LTV / negative leverage | CONDITIONAL |
| `va-missing-phase1` | value-add | no Phase I ESA + OM-vs-T12 NOI conflict | CONDITIONAL |
| `ds-occupancy-collapse` | distressed | 62% occupancy, no bridge → dealbreaker | FAIL |
| `ds-dscr-below-080` | distressed | going-in DSCR < 0.80 → dealbreaker | FAIL |

## Metrics, tolerances & matching

- **Extraction:** field precision / recall / F1 and numeric-within-tolerance (per-source, so OM-vs-T12
  conflicts are scored honestly against the right document).
- **Financial accuracy:** split into *determinable* (NOI, EGI, cap rate, going-in DSCR — tight
  tolerances, real accuracy) and *model-dependent* (5-yr IRR, equity multiple — wide, clearly-labeled
  tolerances, since these depend on modeling assumptions).
- **Red-flag recall / dealbreaker recall:** a planted item is "detected" if the system's output text
  contains ≥1 of the item's committed keywords. Dealbreakers are weighted as critical.
- **IC verdict:** exact match (PASS/CONDITIONAL/FAIL) and directional match (go vs no-go).

Tolerances and target thresholds are fixed in `EVAL-PLAN.md` §0(b)/§0(c). They were set before any
run and are never loosened to raise a score.

## Reproducibility

- The dataset is produced by a deterministic generator: `python eval/generators/generate_deals.py`
  (no randomness, frozen timestamps → byte-identical output across runs). See
  [`generators/README.md`](generators/README.md) for the reference underwriting model and its
  assumptions, the messiness catalog, and the planted-issue catalog.
- The live layer records the Codex version, login status, and run timestamps in the scorecard so the
  reported numbers are attributable to a specific model + date.

## Extend the benchmark (toward an open standard)

1. Add a new `DealSpec` (canonical economics + planted issues) in `eval/generators/generate_deals.py`.
2. Run `python eval/generators/generate_deals.py` to (re)emit `deal.json`, the documents, and
   `ground-truth.json` from that single spec — so documents and answer key stay consistent by
   construction. **Never reverse-engineer the ground truth to match parser/agent output.**
3. Run `npm run eval` and review `eval/results/TRUST-REPORT.md`.

Keep the ground truth honest: it encodes the *true* planted values, and the metrics measure how close
the system gets — including where it falls short.
