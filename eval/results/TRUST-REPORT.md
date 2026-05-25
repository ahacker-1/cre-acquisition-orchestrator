# CRE Acquisition Orchestrator — Trust Report

_Generated 2026-05-25T03:04:22.603Z · run `eval-2026-05-25T03-04-11-509Z` · eval v1.0.0_

> **How to read this report.** Three layers are measured separately and they are NOT
> equivalent:
>
> 1. **Live agent reasoning (the headline).** Real LLM agents (Codex) reason over each
>    deal and produce financials, red flags, and an investment-committee verdict. This is
>    the number that actually reflects the product's judgment.
> 2. **Deterministic simulation (a fixture — NOT reasoning).** The offline demo computes
>    financials by fixed arithmetic on the deal inputs and derives its verdict from
>    scenario configuration. It is shown as a baseline only; a high score here is largely
>    tautological (same formulas that produced the ground truth) and is **not** evidence
>    that the system reasons.
> 3. **Extraction (deterministic parsers).** How well the document parsers recover known
>    field values from deliberately messy synthetic spreadsheets/PDFs. No LLM involved.

**Live model:** _live layer not included in this run._

## Headline numbers

| Metric | Live (reasoning) | Simulation (fixture) | Target |
|---|---|---|---|
| Financial accuracy — determinable | N/A (n=0) | 100% (n=3) | 85% |
| Financial accuracy — model-dependent | N/A (n=0) | 33% (n=3) | — |
| Red-flag recall (required) | N/A (n=0) | 100% (n=1) | 70% |
| Red-flag recall (all planted) | N/A (n=0) | 50% (n=2) | — |
| Dealbreaker recall | N/A (n=0) | 100% (n=1) | 90% |
| IC verdict — exact match | N/A (n=0) | 100% (n=3) | 60% |
| IC verdict — directional match | N/A (n=0) | 100% (n=3) | 80% |

### Extraction layer (deterministic parser)

| Metric | Value | Target |
|---|---|---|
| Field precision | 100% ✅ (n=3) | 90% |
| Field recall | 100% ✅ (n=3) | 85% |
| Field F1 | 100% (n=3) | — |
| Numeric within tolerance | 100% ✅ (n=3) | 90% |

## Where it breaks (honest weaknesses)

_No live-layer misses recorded against targets in this run._

## Per-deal — deterministic simulation (fixture baseline)

_Reminder: these numbers come from fixed arithmetic + scenario config, not reasoning._

| Deal | IC expected | IC actual | Det. fin | RF recall |
|---|---|---|---|---|
| cp-stabilized-clean | PASS | PASS | 100% | N/A |
| ds-occupancy-collapse | FAIL | FAIL | 100% | 0% |
| va-overlevered-ltv | CONDITIONAL | CONDITIONAL | 100% | 100% |

## Methodology & reproduction

- Benchmark: synthetic deals under `eval/benchmark/deals/` (deal + messy documents + machine-readable ground truth). Generators: `eval/generators/` (deterministic, documented).
- Scoring: pure functions in `eval/lib/scoring.mjs`, unit-tested by `scripts/eval-scoring.test.mjs`.
- Tolerances and matching rules are fixed in `EVAL-PLAN.md` (Phase 0) and were not loosened to raise scores.
- Reproduce: `npm run eval` (all layers) — see `eval/README.md`.
