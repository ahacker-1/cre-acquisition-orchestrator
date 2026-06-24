# CRE Acquisition Orchestrator — Eval Report (scored, gated, reproducible)

_Generated 2026-06-24T13:28:01.550Z · run `eval-2026-06-24T13-27-55-505Z` · eval v1.0.0_

> **Regenerate this file (one command, deterministic, offline, no API keys):**
> `node eval/run-eval.mjs --mode offline --no-update-results --report eval/REPORT.md --report-json eval/results/offline-scorecard.json`
> — re-runs the extraction + simulation layers against the committed ground truth, re-checks every regression threshold, and rewrites this report + its machine-readable scorecard.

## Gate verdict

✅ **GATE: PASS** — all 9 measured regression gate(s) held.

Safety — **false-approve rate** (a "go" verdict on a deal whose ground truth is FAIL/no-go): **0.0%** (0/2 no-go deals).

## Per-mode scores (this run)

> Honesty note: **extraction** is real deterministic-parser quality. **simulation** is a FIXTURE (fixed arithmetic + scenario-config verdicts) — a high score there is largely tautological and is **not** evidence of reasoning. The **live** LLM-reasoning layer is the headline number and is measured separately (see `eval/results/TRUST-REPORT.md`); it is not part of this offline gate because it needs API/Codex access.

### Extraction layer — deterministic parser (real quality)

Deals scored: **8**

| Metric | Score | n |
|---|---|---|
| Field precision | 100.0% | 8 |
| Field recall | 100.0% | 8 |
| Field F1 | 100.0% | 8 |
| Numeric within tolerance | 100.0% | 8 |

### Simulation layer — FIXTURE baseline (NOT reasoning)

Deals scored: **8**

| Metric | Score | n |
|---|---|---|
| Determinable financials (tautological) | 100.0% | 8 |
| Model-dependent financials | 50.0% | 8 |
| IC verdict — exact match | 75.0% | 8 |
| IC verdict — directional (go/no-go) match | 100.0% | 8 |
| Dealbreaker recall | 100.0% | 2 |
| Required red-flag recall (fixture weak spot) | 60.0% | 5 |
| All-planted red-flag recall (fixture weak spot) | 50.0% | 6 |

Per-deal IC verdict (fixture):

| Deal | Archetype | IC expected | IC actual | Match | Det. fin |
|---|---|---|---|---|---|
| cp-concentration-risk | core-plus | CONDITIONAL | PASS | ✗ | 100.0% |
| cp-insurance-understated | core-plus | CONDITIONAL | PASS | ✗ | 100.0% |
| cp-stabilized-clean | core-plus | PASS | PASS | ✓ | 100.0% |
| ds-dscr-below-080 | distressed | FAIL | FAIL | ✓ | 100.0% |
| ds-occupancy-collapse | distressed | FAIL | FAIL | ✓ | 100.0% |
| va-missing-phase1 | value-add | CONDITIONAL | CONDITIONAL | ✓ | 100.0% |
| va-overlevered-ltv | value-add | CONDITIONAL | CONDITIONAL | ✓ | 100.0% |
| va-sub120-dscr | value-add | CONDITIONAL | CONDITIONAL | ✓ | 100.0% |

## Regression thresholds

Thresholds are fixed in `eval/lib/thresholds.mjs` and documented in `EVAL-PLAN.md` (Phase 0c). 
A **gate** (🔒) fails the harness (non-zero exit, `npm run test:eval` red) if breached. A **target** is reported but not enforced.

| Kind | Metric | Rule | Actual | n | Result |
|---|---|---|---|---|---|
| 🔒 gate | Extraction field precision | ≥ 90.0% | 100.0% | 8 | ✅ pass |
| 🔒 gate | Extraction field recall | ≥ 85.0% | 100.0% | 8 | ✅ pass |
| 🔒 gate | Extraction field F1 | ≥ 87.5% | 100.0% | 8 | ✅ pass |
| 🔒 gate | Extraction numeric-within-tolerance | ≥ 90.0% | 100.0% | 8 | ✅ pass |
| 🔒 gate | Sim determinable financials (fixture, tautological) | ≥ 99.0% | 100.0% | 8 | ✅ pass |
| 🔒 gate | Sim dealbreaker recall (safety) | ≥ 90.0% | 100.0% | 2 | ✅ pass |
| 🔒 gate | Sim IC directional (go/no-go) match | ≥ 87.5% | 100.0% | 8 | ✅ pass |
| 🔒 gate | Sim IC exact-match rate (fixture) | ≥ 60.0% | 75.0% | 8 | ✅ pass |
| 🔒 gate | False-approve rate (go verdict on a FAIL deal) | ≤ 0.0% | 0.0% | 2 | ✅ pass |
| target | Sim required red-flag recall (fixture weak spot) | ≥ 70.0% | 60.0% | 5 | ⚠️ below target |
| target | Sim all-planted red-flag recall (fixture weak spot) | ≥ 70.0% | 50.0% | 6 | ⚠️ below target |
| target | Sim model-dependent financials | ≥ 50.0% | 50.0% | 8 | ✅ pass |

## How to reproduce

```bash
# 1. Install parser deps (pandas/openpyxl/pdfplumber) once:
npm run setup -- --skip-install --skip-codex-install --skip-login

# 2. Run the deterministic eval (extraction + simulation). Either:
npm run eval:offline     # scores + gate (exits non-zero on any breach)
#   ...or, to (re)write this report + its machine-readable scorecard without
#   clobbering the committed live results:
node eval/run-eval.mjs --mode offline --no-update-results \
  --report eval/REPORT.md --report-json eval/results/offline-scorecard.json

# 3. Enforce the gates in the unit-test suite:
npm run test:eval        # fails loudly if any committed gate regressed

# (CI also runs `node eval/run-eval.mjs --mode offline --no-update-results`,
#  which exits non-zero on any gate breach.)
```

- Benchmark: 8 synthetic deals under `eval/benchmark/deals/` (deal + messy documents + machine-readable ground truth). Generators: `eval/generators/` (deterministic).
- Scoring: pure functions in `eval/lib/scoring.mjs`; thresholds in `eval/lib/thresholds.mjs`; both unit-tested by `scripts/eval-scoring.test.mjs`.
- Tolerances and matching rules were fixed in `EVAL-PLAN.md` BEFORE running and were not loosened to raise scores.
