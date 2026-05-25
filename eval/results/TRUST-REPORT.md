# CRE Acquisition Orchestrator — Trust Report

_Generated 2026-05-25T04:03:32.183Z · run `live-full` · eval v1.0.0_

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
| Financial accuracy — determinable | 67% ⚠️ (n=3) | 100% (n=3) | 85% |
| Financial accuracy — model-dependent | 33% (n=3) | 33% (n=3) | — |
| Red-flag recall (required) | 100% ✅ (n=1) | 100% (n=1) | 70% |
| Red-flag recall (all planted) | 100% (n=2) | 50% (n=2) | — |
| Dealbreaker recall | 100% ✅ (n=1) | 100% (n=1) | 90% |
| IC verdict — exact match | 33% ⚠️ (n=3) | 100% (n=3) | 60% |
| IC verdict — directional match | 67% ⚠️ (n=3) | 100% (n=3) | 80% |

### Extraction layer (deterministic parser)

| Metric | Value | Target |
|---|---|---|
| Field precision | 100% ✅ (n=3) | 90% |
| Field recall | 100% ✅ (n=3) | 85% |
| Field F1 | 100% (n=3) | — |
| Numeric within tolerance | 100% ✅ (n=3) | 90% |

## Per-deal — live agent reasoning

| Deal | Archetype | IC expected | IC actual | Dir? | Det. fin | Model fin | RF req-recall | Dealbreaker | Partial fail |
|---|---|---|---|---|---|---|---|---|---|
| cp-stabilized-clean | core-plus | PASS | CONDITIONAL | ✓ | 75% | 100% | N/A | — | — |
| ds-occupancy-collapse | distressed | FAIL | FAIL | ✓ | 75% | 0% | N/A | 100% | — |
| va-overlevered-ltv | value-add | CONDITIONAL | FAIL | ✗ | 50% | 0% | 100% | — | — |

## Where it breaks (honest weaknesses)

- live: **financialDeterminable** = 67% is below the 85% target (n=3).
- live: **icExactMatch** = 33% is below the 60% target (n=3).
- live: **icDirectionalMatch** = 67% is below the 80% target (n=3).
- live: deal **cp-stabilized-clean** IC verdict expected PASS, got CONDITIONAL.
- live: deal **va-overlevered-ltv** IC verdict expected CONDITIONAL, got FAIL.

## Per-deal — deterministic simulation (fixture baseline)

_Reminder: these numbers come from fixed arithmetic + scenario config, not reasoning._

| Deal | IC expected | IC actual | Det. fin | RF recall |
|---|---|---|---|---|
| cp-stabilized-clean | PASS | PASS | 100% | N/A |
| ds-occupancy-collapse | FAIL | FAIL | 100% | 0% |
| va-overlevered-ltv | CONDITIONAL | CONDITIONAL | 100% | 100% |

## Run notes

- Live path: Codex codex-cli 0.132.0 (Logged in using ChatGPT); workflow quick-deal-screen; runs 2026-05-25T03:24:14.211Z .. 2026-05-25T04:03:32.116Z.

## Methodology & reproduction

- Benchmark: synthetic deals under `eval/benchmark/deals/` (deal + messy documents + machine-readable ground truth). Generators: `eval/generators/` (deterministic, documented).
- Scoring: pure functions in `eval/lib/scoring.mjs`, unit-tested by `scripts/eval-scoring.test.mjs`.
- Tolerances and matching rules are fixed in `EVAL-PLAN.md` (Phase 0) and were not loosened to raise scores.
- Reproduce: `npm run eval` (all layers) — see `eval/README.md`.
