# CRE Acquisition Orchestrator — Trust Report

_Generated 2026-05-21T17:23:06.453Z · run `final-bench` · eval v1.0.0_

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

**Live model:** Codex CLI default model · **Codex:** codex-cli 0.132.0

## Headline numbers

| Metric | Live (reasoning) | Simulation (fixture) | Target |
|---|---|---|---|
| Financial accuracy — determinable | 100% ✅ (n=1) | 100% (n=8) | 85% |
| Financial accuracy — model-dependent | 0% (n=1) | 13% (n=8) | — |
| Red-flag recall (required) | 100% ✅ (n=1) | 60% (n=5) | 70% |
| Red-flag recall (all planted) | 100% (n=1) | 50% (n=6) | — |
| Dealbreaker recall | N/A (n=0) | 100% (n=2) | 90% |
| IC verdict — exact match | 100% ✅ (n=1) | 50% (n=8) | 60% |
| IC verdict — directional match | 100% ✅ (n=1) | 50% (n=8) | 80% |

### Extraction layer (deterministic parser)

| Metric | Value | Target |
|---|---|---|
| Field precision | 100% ✅ (n=8) | 90% |
| Field recall | 100% ✅ (n=8) | 85% |
| Field F1 | 100% (n=8) | — |
| Numeric within tolerance | 100% ✅ (n=8) | 90% |

## Per-deal — live agent reasoning

| Deal | Archetype | IC expected | IC actual | Dir? | Det. fin | Model fin | RF req-recall | Dealbreaker | Partial fail |
|---|---|---|---|---|---|---|---|---|---|
| cp-insurance-understated | core-plus | CONDITIONAL | CONDITIONAL | ✓ | 100% | 0% | 100% | — | — |

## Where it breaks (honest weaknesses)

_No live-layer misses recorded against targets in this run._

## Per-deal — deterministic simulation (fixture baseline)

_Reminder: these numbers come from fixed arithmetic + scenario config, not reasoning._

| Deal | IC expected | IC actual | Det. fin | RF recall |
|---|---|---|---|---|
| cp-concentration-risk | CONDITIONAL | FAIL | 100% | 0% |
| cp-insurance-understated | CONDITIONAL | FAIL | 100% | 0% |
| cp-stabilized-clean | PASS | FAIL | 100% | N/A |
| ds-dscr-below-080 | FAIL | FAIL | 100% | N/A |
| ds-occupancy-collapse | FAIL | FAIL | 100% | 0% |
| va-missing-phase1 | CONDITIONAL | FAIL | 100% | 100% |
| va-overlevered-ltv | CONDITIONAL | CONDITIONAL | 100% | 100% |
| va-sub120-dscr | CONDITIONAL | CONDITIONAL | 100% | 100% |

## Run notes

- Live path: Codex codex-cli 0.132.0 (Logged in using ChatGPT); workflow quick-deal-screen; runs 2026-05-21T17:03:52.880Z .. 2026-05-21T17:16:44.626Z.

## Methodology & reproduction

- Benchmark: synthetic deals under `eval/benchmark/deals/` (deal + messy documents + machine-readable ground truth). Generators: `eval/generators/` (deterministic, documented).
- Scoring: pure functions in `eval/lib/scoring.mjs`, unit-tested by `scripts/eval-scoring.test.mjs`.
- Tolerances and matching rules are fixed in `EVAL-PLAN.md` (Phase 0) and were not loosened to raise scores.
- Reproduce: `npm run eval` (all layers) — see `eval/README.md`.
