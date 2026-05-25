# USABILITY-PLAN — Real-World Drop Flow Hardening

> Authoritative ledger for the autonomous run defined in
> [docs/USABILITY-GOAL.md](docs/USABILITY-GOAL.md). Source of truth; survives context resets.
> Resume from here — do not restart.

**Run started:** 2026-05-24
**Branch:** `usability-hardening` (off `eval-harness`, which is a clean superset of `main`)
**Rollback SHA:** `f0f76e7` (main HEAD before this run)
**Scope (locked by operator):** Full OFFLINE real-world drop flow must be bug-free. Regression set
trimmed 8 → 2-3 mixed-archetype deals. Live agent reasoning is OPTIONAL/bonus only.

## Status legend
- `PASS` — verified with evidence (command + real output / test / screenshot).
- `PARTIAL` — exists but incomplete/unverified.
- `MISSING` — not implemented.
- `OPEN` — defect found, not yet fixed.

## Hard safety constraints (never violate)
- No secrets committed. No autonomous external sending/outreach/posting.
- No autonomous investment decisioning without a human-review gate.
- Deterministic offline demo stays the default public path.
- Synthetic data only — generate messy docs; never use real/private deal data.
- Never weaken a test/gate; never tune ground truth to flatter the system. Fix the parser/logic,
  not the answer key. Genuinely-unreliable fields get LOW confidence or a flag, never confident-wrong.

---

## Phase 0 — Stand up the regression harness

| ID | Item | State | Evidence |
|---|---|---|---|
| H1 | Branch from `eval-harness` | PASS | on `usability-hardening`; eval/ present; node+python(3.13)+openpyxl/pdfplumber/reportlab OK |
| H2 | Trim benchmark 8 → 3 (one per archetype) | OPEN | keep: cp-stabilized-clean (PASS), va-overlevered-ltv (CONDITIONAL), ds-occupancy-collapse (FAIL); update generator+runner+docs+counts |
| H3 | Build "real-world pile" smoke fixture | OPEN | fixtures/real-world-pile/: 3 core docs messy + .docx, image, scanned PDF, random PDF, .zip, empty, huge, mislabeled binary.csv, name/content mismatch |

## Phase 1 — Baseline (ground truth before fixing) — IN PROGRESS

**Extraction layer (all 8, no LLM):** P=100% R=100% F1=100% numTol=100% on every deal.
→ Tautological: synthetic docs generated to match the parser. NOT evidence the parser handles
real-world mess. Real signal must come from H3 nasty pile.

**Simulation layer (all 8, no LLM) — REAL DEFECTS:**
| Deal | Verdict | Expected | Match? | RF recall | Note |
|---|---|---|---|---|---|
| cp-stabilized-clean | FAIL | PASS | ✗ | N/A | **D1: clean deal wrongly FAILs** |
| cp-concentration-risk | FAIL | CONDITIONAL | ✗ | 0% | **D2: concentration red flag missed + over-fail** |
| cp-insurance-understated | FAIL | CONDITIONAL | ✗ | 0% | **D3: insurance red flag missed + over-fail** |
| ds-occupancy-collapse | FAIL | FAIL | ✓ | 0% | **D4: occupancy red flag missed (verdict right by luck)** |
| ds-dscr-below-080 | FAIL | FAIL | ✓ | N/A | ok |
| va-missing-phase1 | FAIL | CONDITIONAL | ✗ | 100% | **D5: over-fail (flag caught but verdict too harsh)** |
| va-overlevered-ltv | CONDITIONAL | CONDITIONAL | ✓ | 100% | ok |
| va-sub120-dscr | CONDITIONAL | CONDITIONAL | ✓ | 100% | ok |

→ IC verdict exact-match = 4/8 on sim. Systematic over-failing + red-flag detection gaps.
NOTE: sim is a "fixture, not reasoning" layer, BUT it is what runs in the offline drop flow after
approval and produces the IC recommendation — so these are in-scope defects for the offline path.
Root-cause pending (Agent 1): is the verdict deal-specific or fixed-scenario-driven?

**Drop-flow server/parser robustness vs junk files:** UNTESTED — pending H3 + Agent 2.

## Defect log (root-caused via 3 parallel investigators 2026-05-24)

### Parser (drop-flow correctness/robustness) — owned by background agent (TDD)
| ID | Defect | File:line | Severity | Fix |
|---|---|---|---|---|
| P1 | Vacant $0 rent in denominator (not numerator) of in-place rent avg → 788 vs 1575 | `scripts/parse_excel.py:~564` | HIGH (confident-wrong) | exclude $0/blank-contract (vacant) from in-place avg num+denom |
| P2 | Same vacant-$0 bug on native CSV path (1013 vs 2025) | `dashboard/server/parser-service.ts:~262` | HIGH (confident-wrong) | same |
| P3 | Native CSV path has no size/row cap (35MB/944k rows parsed in-process, no timeout) | `parser-service.ts:~773` | MED (DoS/heap) | byte/row cap → graceful parse_failed |
| P4 | Corrupt .xlsx → `parser-unavailable` (implies env broken) not `parse_failed`; error leaks local Python paths | `parser-service.ts:~557` | MED (mislead+path disclosure) | distinguish real parse-failure; redact paths |
| P5 | Classification filename-only → operating-statement.csv (rent-roll content) typed t12 → data SILENTLY dropped | `workspace-service.ts:~1024` | MED (silent failure) | content-aware cross-check / warning (separate workstream) |

GOOD NEWS (baseline probe of 14-file nasty pile): parser BOUNDARY is solid — zero crashes, zero
hangs >15s, zero silent-empty `extracted`. So DoD-B is mostly: promote probe→automated test + close P1–P5.

### Sim verdict (offline pipeline) — ENGINE defect (eval wiring is correct) — owned by orchestrator
| ID | Defect | File:line | Fix |
|---|---|---|---|
| V1 | Verdict keys off mis-computed IRR + ignores config/thresholds.json → clean deal FAILs; over-levered (DSCR 0.82) gets silent "go" | `simulation-data.js:419-424` | threshold-driven verdict: FAIL on true dealbreakers (DSCR<0.80, LTV≥1.0, occ<0.70 no-bridge); PASS on healthy (DSCR≥strategy minDSCR, ≤maxHighRisks HIGH flags, cap≥0.045, riskScore≥min); else CONDITIONAL |
| V2 | IRR/passRate wrong because exitCapBase hardcoded 0.0675 for every deal → spurious "pass-rate 0%" HIGH flag | `workpaper-renderer.js:131` | exitCapBase = deal going-in cap + documented spread (or deal.financials.exitCapRate). Clean deal → 0.0625 (matches its model), IRR→~11% |
| V3 | Narrative red-flag recall (concentration/insurance/deferred-maint keywords) structurally 0% — engine emits only generic threshold flags | `simulation-data.js` generate* | Emit DETERMINABLE risk flags (over-leverage, low occupancy). Narrative-keyword recall documented as KNOWN LIMIT of the fixture sim layer (live layer is the reasoning headline) — honest, matches trust-report framing |

### Blast-radius decisions (verified)
- `demo:verify` regenerates to gitignored `data/reports/` + SCHEMA-validates → no exact-number assertion → engine change is safe for the gate.
- `data/examples/parkview-2026-001/` is a TRACKED static snapshot, NOT auto-regenerated, NOT test-gated. After the engine change I will REFRESH it (copy fresh `data/reports/parkview-2026-001/*` → `data/examples/.../reports/`) for honesty/consistency, then re-validate.
- Verdict uses `config/thresholds.json` `strategyThresholds` (core-plus minDSCR 1.20 / value-add 1.0 / opportunistic 0.0) + `dealbreakers`. Maps scenario distressed→opportunistic.

## Phase 2+ — Fixes (TDD, re-measure after each)

Ordering: (2) parser P1–P4 [agent, running] → (3) classification P5 → (4) sim V1/V2/V3 + refresh Parkview
→ (5) nasty-pile automated smoke test → (6) trim benchmark to 3 + regen + re-run eval → (7) docs/counts/release.

### Progress (2026-05-24/25)
- **Parser P1–P5: DONE** (background agent, TDD). Vacant-$0 avg fixed (Excel+CSV: in-place over occupied
  only, null if all-vacant); CSV size cap 25MB/250k rows→parse_failed; corrupt.xlsx→parse_failed + path
  redaction; interpreter resilience. `npm run test:parsers` PASS; server typecheck clean; eval extraction
  100% unchanged (no ground-truth impact — deflated field wasn't scored). New fixture rent-roll-vacant-units.csv.
- **Classification P5: DONE** — classifyDocument content-aware; operating-statement.csv (rent-roll content)
  no longer silently routed to T12. `npm run test:workspace` PASS; dashboard typecheck PASS.
- **Sim V1/V2/V3: DONE** — exitCapBase deal-derived (workpaper-renderer.js); threshold-driven verdict
  using config/thresholds.json determinable metrics + dealbreakers (simulation-data.js); determinable
  over-leverage flag. Sim IC exact-match 4/8 → **6/8** (2 misses = narrative risks tenant-concentration /
  insurance-understatement = honest known limit; live layer is the reasoning headline). dashboard typecheck PASS.
- **Trim to 3: DONE** — generate_deals.py all_specs()→3 (cp-stabilized-clean/va-overlevered-ltv/
  ds-occupancy-collapse); 5 stale dirs deleted; regenerated; 3 deal.json valid.
- **Offline eval on trimmed 3: PASS** — `npm run eval:offline` (new comma-separated/offline mode +
  npm script): extraction P=R=F1=numTol=100% (3/3); sim verdict **3/3 exact** (PASS/FAIL/CONDITIONAL).
  Committed scorecard.json + TRUST-REPORT.md regenerated.

### Remaining
- Refresh committed Parkview sample (data/examples) — engine changed.
- Automated nasty-pile smoke test (DoD-B) + wire into gate.
- Full validation gate green (demo:verify, test, test:e2e, validate:*, audit, dashboard build).
- Docs/counts sweep (README By-the-Numbers fixtures count; "8 deals"→3 across README/eval docs/EVAL-PLAN/
  EVAL-GOAL/USABILITY-GOAL; CHANGELOG; ROADMAP); regenerate trust report numbers in README.
- (bonus) live Codex run (codex logged in: codex-cli 0.132.0) — optional.
- Commit + push.

## Definition of Done (mirrors docs/USABILITY-GOAL.md)
- [x] A. `npm run eval:offline` (trimmed 3) reproducible: extraction P=R=F1=numTol=100% (3/3); sim IC
      verdict 3/3 exact (PASS/CONDITIONAL/FAIL). Model-dependent fin 33% + narrative RF recall = honest
      known limit (deterministic fixture can't reason; live layer is the headline).
- [x] B. `npm run test:pile` PASS — 14-file nasty pile, zero crashes/hangs/silent-failures/path-leaks; wired into `npm test`.
- [x] C. Dashboard walkthrough — Playwright e2e **20/20 passed (2.7m)** on a clean state; drives every
      view + the first-deal flow (upload→extract→review→apply→launch→package). (An earlier run flaked on a
      stale 5/21 dev-server holding the port — killed it, re-ran clean → 20/20. Not a code regression:
      MissionControl's "ready" string keys off checkpoint COMPLETE, which demo:verify + system-test already prove.)
- [x] D. Fuzz/negative coverage: real-world-pile smoke + parser-service tests prove no input (corrupt/huge/
      empty/binary/mislabeled/image/zip/docx) crashes or hangs the parser; size cap + typed statuses + path redaction.
- [x] E. Confident-wrong values fixed: vacant-$0 in-place rent (Excel+CSV, P1/P2); IRR/pass-rate (deal-specific
      exit cap, V2); clean-deal-FAIL verdict (threshold-driven, V1). Model-dependent IRR honestly labeled wide-tolerance.
- [x] F. Offline gate GREEN: `npm test` ✓, `npm run demo:verify` ✓ (9/9, 49s), `npm run validate:fixtures` ✓ (8/8),
      `npm run validate:docs` ✓ (31/8/27/5/36/10), `npm run validate:guides` ✓, dashboard build+typecheck ✓,
      `npm audit --omit=dev` ✓ (0 vulns). e2e pending.
- [x] G. Ledger complete — every item PASS with evidence (this file).
- [x] (bonus) H. Live Codex run + FIX the exposed gaps — DONE (operator requested). Codex CLI 0.132.0, 2026-05-25.
      BASELINE live run `live-full` (n=3): determinable financial 67%, IC exact 33%, directional 67% — BELOW
      target; over-conservative on cp (PASS→CONDITIONAL) and va (CONDITIONAL→FAIL); va DSCR on IO basis.
      ROOT-CAUSED (systematic-debugging, read-only investigation) into agent-reasoning gaps vs eval extractor bugs:
        - Agent contract (scripts/codex-agent-runner.js, commit a446bf7): threshold-driven verdict rule (FAIL only
          on a real dealbreaker; missing artifacts/data-gaps can't downgrade a clean PASS or force FAIL) +
          required parseable ## Metrics block w/ amortizing-basis DSCR (illustrative non-deal placeholders only).
        - Eval extractor (eval/lib/extract-live.mjs, a446bf7): EGI sourced from opex-analyst (T12).
        - Parser disambiguation (eval/lib/markdown-parse.mjs): horizontal-only whitespace (no cross-line value↔label
          binding — was reading line N's value as line N+1's metric, e.g. LTV-as-cap, NOI-as-EGI); going-in
          disqualifier (rejects pro-forma/stabilized/exit/interest-only variants); parenthetical-qualifier +
          amortizing-adjective DSCR forms. 3 new regression tests in scripts/eval-scoring.test.mjs.
      RE-RUN `live-fix1` (fresh agents w/ new contract) + reparse-scored with fixed extractor (no benchmark tuning,
      re-scored REAL agent workpapers): determinable financial **67%→100%**, IC exact **33%→100%**, directional
      **67%→100%**, model-dependent 33%→67%, RF/dealbreaker recall 100%. ALL live targets met (n=3 small sample;
      report says so). NOT tuned to flatter (cardinal rule) — fixed real parser bugs + agent-contract gaps, GT unchanged.
      INCIDENT (both live runs): OneDrive sync repeatedly deleted tracked files (incl. the 3 ground-truth keys) under
      heavy I/O; a 10-min guarded check restored them from HEAD before each scoring phase, and reparse can recover
      scoring from saved workpapers regardless. Re-verified git tree intact (0 deletions) before each commit.
- [x] RELEASE: docs updated — 8→3 sweep (eval/README, eval/generators/README, generate_deals.py,
      EVAL-PLAN, EVAL-GOAL, USABILITY-GOAL), README counts (36 fixtures / 10 tests) + Honest-Evaluation
      rewrite (3 deals, real numbers) + unreleased status bullet, CHANGELOG [Unreleased] (moved to top),
      ROADMAP. validate:docs PASS. Committing on branch `usability-hardening`.

## Final gate evidence (2026-05-25, clean state)
- `npm run eval:offline` → extraction P=R=F1=numTol 100% (3/3); sim verdict 3/3 exact (PASS/FAIL/CONDITIONAL); schema-valid.
- `npm test` → PASS (enums, fixtures, doc-counts 31/8/27/5/36/10, runtime-lock, goal-helper, security, **real-world-pile 14/0**, system-test, codex-runtime, eval-scoring).
- `npm run demo:verify` → 9/9 PASS (49s, incl. dashboard build).
- `npm run test:e2e` → **20/20 passed** (clean state).
- `npm run validate:fixtures` 8/8 · `npm run validate:docs` PASS · `npm run validate:guides` PASS · `npm audit --omit=dev` 0 vulns · dashboard typecheck clean.

## Work log
- 2026-05-24: Branch created (H1). Extraction + sim baselines captured (8 deals). 5 sim verdict
  defects (D1–D5) logged. Dispatching parallel root-cause investigation (sim pipeline / parser
  robustness + nasty pile / docs-counts inventory).
