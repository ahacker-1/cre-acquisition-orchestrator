# Narrative-Risk Goal — Prove (and Fix) the Hard Deals

The eval's current live headline (100% determinable / 100% IC verdict) is honest but
measured on **n=3 determinable-risk deals**. The harder **narrative-risk** deals — where the
issue is buried in the documents (tenant concentration, insurance understatement, missing
Phase I + OM-vs-T12 NOI conflict) — were trimmed out and have **never been scored on the live
layer**. The deterministic sim is provably blind to them (0% red-flag recall, over-PASSES
both narrative core-plus deals). This goal closes that credibility gap honestly.

---

GOAL: Restore the full 8-deal benchmark, measure the LIVE agents on the narrative-risk deals,
and fix the agents/orchestration where they miss — without ever tuning the benchmark to flatter.

Operate on the repo at C:\Users\ahack\OneDrive\Desktop\cre-acquisition-orchestrator.
Work the project's discipline: superpowers:systematic-debugging for every miss (root-cause
before fixing), TDD where code changes, production-guardian before declaring done. Do NOT add a
Co-Authored-By trailer.

CARDINAL RULE (non-negotiable): NEVER tune the benchmark/ground truth to flatter the system, never
fabricate/round/cherry-pick, never widen a tolerance to swallow a miss, never relabel an expected
verdict. If the live agents genuinely can't detect a narrative risk, report that honestly as a
known limit — a credible "catches 2 of 3 narrative risks, here's the third" beats a fake 100%.
Distinguish AGENT-reasoning misses (fix the prompt/contract) from EVAL extraction/scoring bugs
(fix the scorer) — same method as the prior live-accuracy pass.

HARD CONSTRAINTS: synthetic data only; offline-first stays default; no autonomous external actions;
keep the full validation gate green; guard against OneDrive deleting tracked files mid-run
(restore ground-truth from HEAD before any scoring; reparse can recover scoring from saved
workpapers). Bound live cost — offline on all 8, live on a representative subset that INCLUDES the
narrative-risk deals, not all 8 live.

────────────────────────────────────────────────────────
PHASE 0 — Restore benchmark + baseline (DONE 2026-05-25)
────────────────────────────────────────────────────────
- generate_deals.py all_specs() restored to all 8; regenerated; 8 deal dirs present.
- Offline (extraction+sim) baseline on 8: extraction 100%; sim IC exact 6/8 (over-PASSES
  cp-concentration + cp-insurance — the narrative core-plus deals); sim narrative red-flag
  recall 0% (concentration / insurance / deferred-maintenance). Confirms sim is blind to
  narrative risk → the live layer is what must be proven.

────────────────────────────────────────────────────────
PHASE 1 — Live measurement on the narrative-risk deals
────────────────────────────────────────────────────────
Run the live agents on the narrative deals (cp-insurance-understated, cp-concentration-risk,
va-missing-phase1) + the clean control. Record HONESTLY, per deal: planted-red-flag recall
(did a DD agent name the concentration / insurance-understatement / missing-Phase-I risk?),
IC verdict match, determinable + model-dependent financial accuracy, any partial-failure.
Guard ground-truth against OneDrive throughout.

────────────────────────────────────────────────────────
PHASE 2 — Root-cause + fix the misses
────────────────────────────────────────────────────────
For each narrative-risk MISS, classify AGENT vs EXTRACTION (read the saved workpapers vs the
planted red-flag keywords in ground-truth). Fix the real cause:
  - AGENT: the responsible DD specialist (tenant-credit / rent-roll-analyst for concentration;
    opex-analyst for insurance-vs-benchmark; environmental-review for missing Phase I) isn't
    surfacing the risk → tighten that agent's prompt to check for and name it (general, not a
    per-deal hack; the planted risks are realistic CRE risks any competent analyst would flag).
  - EXTRACTION: the agent named the risk but the scorer's keyword match missed it → fix the
    flag-text extraction / keyword set (honest measurement, not flattering).
Re-run live on the affected deal(s) and re-measure. Iterate until narrative red-flag recall is
honestly strong OR a residual miss is documented as a known limit with a reason.

────────────────────────────────────────────────────────
PHASE 3 — Publish the honest result
────────────────────────────────────────────────────────
Regenerate the committed scorecard + trust report covering all 8 deals (offline on 8, live on the
scored subset). Update the README "Honest Evaluation" live row + scope to reflect the 8-deal
benchmark and the narrative-risk numbers (including any residual miss). Update the eval docs
(eval/README, eval/generators/README, EVAL-PLAN) back to 8 deals. Keep the full validation gate
green (npm test, validate:docs, etc.). Commit + push to main.

────────────────────────────────────────────────────────
DEFINITION OF DONE (all true, with evidence)
────────────────────────────────────────────────────────
A. Benchmark is the full 8 deals; offline layers score all 8; live scores a subset incl. all 3
   narrative-risk deals. `npm run eval` reproducible; scorecard schema-valid.
B. Narrative red-flag recall on the live layer is measured and reported HONESTLY per deal
   (concentration / insurance / missing-Phase-I), including any residual miss as a documented limit.
C. Every fixable miss is fixed at its real cause (agent prompt or scorer), TDD where code changes,
   re-measured; nothing tuned to flatter; ground truth unchanged.
D. README + trust report + eval docs reflect the 8-deal benchmark and the honest narrative numbers.
E. Full validation gate green; no regressions. Committed + pushed to main.
F. NARRATIVE-RISK-PLAN.md (or this file's log) shows each narrative risk → live result → fix → evidence.

Begin at Phase 1 (Phase 0 already done).

---

## Phase 1 RESULT — 2026-05-25 (run `narrative-live`, Codex CLI 0.132.0)

Live agents run on the 3 narrative-risk deals. **The live layer genuinely detects the
narrative risks the deterministic sim is blind to — verified by reading the workpapers,
not just keyword counts.**

| Deal | Planted narrative risk | Live caught? | IC verdict (exp→got) | Det.fin | Model-fin |
|---|---|---|---|---|---|
| cp-concentration-risk | 60% single-employer tenant concentration | YES — `[HIGH]` "≈60% of residents work for Carolina Logistics, correlated vacancy/rollover" | CONDITIONAL→CONDITIONAL ✓ | 100% | 0% |
| cp-insurance-understated | insurance line understated vs market | YES — "OM/T-12 show only $41K/yr insurance… normalize → DSCR ~1.21–1.15x" | CONDITIONAL→CONDITIONAL ✓ | 75% | 0% |
| va-missing-phase1 | missing Phase I ESA (former industrial) | YES — "former light-industrial, no Phase I ESA, environmental risk unscored" | CONDITIONAL→CONDITIONAL ✓ | 100% | 100% |

- **Narrative red-flag recall (live): 100%** (n=3, genuine) vs **sim 33%** (sim over-PASSES concentration + insurance with 0% recall — structurally blind).
- **IC verdict (live): 3/3 exact** vs sim 1/3 on these deals.
- No narrative-detection miss → **no agent/scorer fix required** for detection. Phase 2 (fix) is moot.
- Remaining honest soft spot: **model-dependent financial (IRR/EM) 33%** on these deals (cp-conc 0%, cp-ins 0%, va-missing 100%) — a modeling-assumption gap, NOT a narrative-risk gap; and cp-insurance determinable 75% (one metric off). Nothing tuned to flatter; ground truth unchanged.

**Conclusion:** the credibility gap is closed — the system is now proven on the HARD (narrative-risk)
deals, and the live layer passes with genuine reasoning.

## Phase 3 PUBLISHED — 2026-05-25 (no new Codex)
Committed 8-deal trust report: offline (extraction + sim) on all 8; live re-scored on the 6 deals with
saved workpapers (3 determinable from `live-fix1` + 3 narrative from `narrative-live`, consolidated under
one base for reparse); the 2 un-live-scored deals (`va-sub120-dscr`, `ds-dscr-below-080`) are omitted from
the live layer (shown honestly). Committed headline: extraction 100% (n=8); live IC verdict 100% exact
(n=6), determinable financial 96% (n=6), narrative red-flag recall 100%; model-dependent 50% (documented
soft spot). README "Honest Evaluation" + eval docs (back to 8) + CHANGELOG updated. Gate green; pushed to main.
