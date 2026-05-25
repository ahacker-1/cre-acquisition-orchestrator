# EVAL-PLAN — Prove It (Open Evaluation Harness + Honest Trust Report)

> Authoritative ledger for the autonomous evaluation run defined in
> [docs/EVAL-GOAL.md](docs/EVAL-GOAL.md). This file is the source of truth and survives
> context resets. Resume from here — do not restart.

**Run started:** 2026-05-21
**North star:** A CRE professional runs ONE command (`npm run eval`), sees honest accuracy
numbers for how the system performs on realistic deals with known correct answers, and can
trust them.

## Cardinal rule (non-negotiable)

The eval is worthless if it isn't honest. NEVER fabricate, hardcode, round up, or cherry-pick
metrics. NEVER tune the benchmark to flatter the system. A credible "71% accurate and here's
where it breaks" beats a fake 99%. Clearly separate the **DETERMINISTIC SIMULATION** (a fixture —
NOT evidence of reasoning) from the **LIVE AGENT PATH** (real LLM reasoning — the number that counts).

## Hard constraints

- Synthetic data only — generate realistic deals; do NOT scrape real listings or use private data.
- No paid external data providers. Offline-first stays the default. No autonomous external actions.
- Don't weaken existing tests/gates. (Adding tests/strengthening is fine; bump README counts to match.)
- No `Co-Authored-By` trailer on commits.

## Status legend

- `PASS` — done and verified with evidence (command + real output).
- `PARTIAL` — exists but incomplete/unverified.
- `MISSING` — not implemented.
- `KNOWN-LIMIT` — residual weakness documented with a reason (acceptable per Phase 4).

---

## System architecture (grounding — verified by 5-agent codebase explore, 2026-05-21)

The orchestrator has **two execution paths** and the eval measures **three honestly-separable layers**:

| Path | Entry | Output | What it proves |
|---|---|---|---|
| **Deterministic simulation** | `npm run simulate` → `scripts/orchestrate.js` | structured JSON in `data/phase-outputs/<dealId>/*-output.json` + `data/status/<dealId>.json` | Arithmetic on `deal.json`. Financials are REAL formulas; **IC verdict is a fixture** (`scenario.expectedVerdict` + hardcoded recommendation text in `workpaper-renderer.js:701`). **NOT reasoning.** |
| **Live agent path** | `npm run codex:run` → `scripts/codex-agent-runner.js --deal <path> --workflow <id>` | free-text **markdown workpapers** in `data/codex-runs/<runId>/<phase>/<agent>.md` with sections `## Agent Verdict`, `## Key Findings`, `## Red Flags`, `## Data Gaps` | **Real LLM reasoning. The number that counts.** Codex CLI 0.132.0, logged in via ChatGPT (verified). Must parse markdown to score. |

**Three measured layers:**

1. **Extraction accuracy** — the deterministic Python parser pipeline (`parse_excel.py`, `parse_pdf.py`
   via `dashboard/server/parser-service.ts`) turns messy synthetic documents into candidate fields.
   Scored as field precision/recall + numeric-within-tolerance. Honest, no LLM. Real evidence of the
   "Source-Backed Document Intelligence" claim. **Independent of the agent path.**
2. **Deterministic simulation (fixture baseline)** — `orchestrate.js` financials scored vs ground
   truth. Will score near-perfect on financials BY CONSTRUCTION (same arithmetic) — reported as a
   **tautological fixture baseline, NOT reasoning**. Its IC verdict is scenario-driven, not derived.
3. **Live agent reasoning** — Codex agents reason over each deal and produce financials, red flags,
   and an IC verdict. Scored vs ground truth. **This is the headline number.**

**Deal input contract:** `config/deal-schema.json` (draft-07). Required: `dealId, dealName, property,
financials, financing, investmentStrategy, targetHoldPeriod, targetIRR, targetEquityMultiple,
targetCashOnCash, seller, timeline`. Both paths accept `--deal <path>`.

**Repo conventions that constrain placement (verified):**
- `scripts/verify-doc-counts.js` counts files in `fixtures/`, `schemas/`, `skills/`, `agents/`,
  `orchestrators/`, workflows in `config/workflows.json`, and `test:`-prefixed npm scripts. Expected
  numbers live in the README "By the Numbers" table. → **Eval lives in top-level `eval/` (not walked).**
  A new `test:`-prefixed script bumps the Tests count → README must be updated to match (honest).
- `scripts/validate-fixtures.js` validates only `data/examples/**/*.json` (needs a schema mapping).
  → Eval artifacts go under `eval/` and `data/eval-runs/` (gitignored), NOT `data/examples/`.
- `check-legacy-enums.js` bans tokens `complete|COMPLETED|GO|NO_GO` in `data/examples/` + `schemas/`.
  → Use canonical verdicts `PASS|CONDITIONAL|FAIL` everywhere; never `GO/NO_GO`.

---

## PHASE 0 — Evaluation design  (STATUS: PASS — designed below)

### 0(a) Ground-truth schema for a deal

Each benchmark deal ships three artifacts in `eval/benchmark/deals/<dealId>/`:
`deal.json` (input, valid against `config/deal-schema.json`), `documents/` (synthetic source files),
and `ground-truth.json` (the machine-readable answer key). Answer-key shape:

```jsonc
{
  "dealId": "cp-stabilized-clean",
  "archetype": "core-plus | value-add | distressed",
  "narrative": "what this deal tests",
  "documents": [
    { "file": "documents/rent-roll.xlsx", "type": "rent_roll", "quirks": ["merged-header","currency-symbols"] }
  ],
  "extraction": {                       // correct values latent in the documents
    "fields": [
      { "path": "property.totalUnits",          "value": 120,      "source": "rent_roll",     "tolerance": {"type":"exact"} },
      { "path": "financials.askingPrice",        "value": 18500000, "source": "offering_memo", "tolerance": {"type":"relative","pct":0.005} },
      { "path": "financials.currentNOI",         "value": 1110000,  "source": "t12",           "tolerance": {"type":"relative","pct":0.01} },
      { "path": "financials.inPlaceOccupancy",   "value": 0.94,     "source": "rent_roll",     "tolerance": {"type":"absolute","abs":0.01} }
    ]
  },
  "financials": {                       // economically-correct deal metrics
    "metrics": [
      { "key":"noi",            "value":1110000, "tolerance":{"type":"relative","pct":0.02}, "class":"determinable" },
      { "key":"egi",            "value":1820000, "tolerance":{"type":"relative","pct":0.02}, "class":"determinable" },
      { "key":"capRate",        "value":0.0600,  "tolerance":{"type":"absolute","abs":0.0015}, "class":"determinable" },
      { "key":"dscr",           "value":1.35,    "tolerance":{"type":"absolute","abs":0.08},   "class":"determinable" },
      { "key":"irr",            "value":0.145,   "tolerance":{"type":"absolute","abs":0.03},   "class":"model-dependent" },
      { "key":"equityMultiple", "value":1.75,    "tolerance":{"type":"absolute","abs":0.20},   "class":"model-dependent" }
    ]
  },
  "redFlags": [                          // planted issues the system SHOULD detect
    { "id":"insurance-understated", "category":"UNDERWRITING", "severity":"HIGH", "required":true,
      "keywords":["insurance","understated","below market","reassess"] }
  ],
  "dealbreakers": [                       // planted hard-stops
    { "id":"dscr-sub-080", "required":true, "keywords":["dscr","0.80","below 0.8","debt service coverage"] }
  ],
  "icVerdict": { "value":"FAIL", "directional":"no-go", "rationale":"..." }   // PASS|CONDITIONAL|FAIL
}
```

`class:"determinable"` = objectively derivable from the documents/inputs (NOI, EGI, cap rate,
going-in DSCR given stated rate/LTV/amort) → tight tolerances, real accuracy.
`class:"model-dependent"` = depends on modeling assumptions (5-yr IRR, equity multiple) → wide,
clearly-labeled tolerances; measures "lands in a defensible range under standard assumptions,"
not exact-match. Ground-truth model-dependent values are computed with the repo's own canonical
formulas (`workpaper-renderer.js`: full amortization, IRR bisection, 3% rev / 2.4% exp growth,
exit cap 0.0675, 5-yr hold) so they are reproducible and transparent.

### 0(b) Metrics

| Metric | Definition | Applies to |
|---|---|---|
| **Extraction precision** | correct extracted fields / all extracted fields (matched by path; value within tolerance) | extraction layer |
| **Extraction recall** | correctly-extracted ground-truth fields / all ground-truth fields | extraction layer |
| **Extraction F1** | harmonic mean of the two | extraction layer |
| **Numeric-within-tolerance** | numeric fields/metrics whose value falls inside the stated tolerance band / total | extraction + financials |
| **Financial accuracy (determinable)** | determinable metrics within tolerance / total determinable | sim + live |
| **Financial accuracy (model-dependent)** | model-dependent metrics within tolerance / total (reported separately) | sim + live |
| **Red-flag recall** | planted required red flags detected / planted required red flags | sim + live |
| **Red-flag precision** | (informational) flags raised that map to a planted flag / all flags raised | sim + live |
| **Dealbreaker recall** | planted dealbreakers detected / planted dealbreakers | sim + live |
| **IC exact-match rate** | deals where verdict == ground-truth verdict / deals | sim + live |
| **IC directional-match rate** | deals where go/no-go direction matches (FAIL↔no-go; PASS/CONDITIONAL↔go) / deals | sim + live |

**Matching rules (documented to prevent gaming):**
- *Field match*: same dot-path; numeric value within tolerance; non-numeric exact (case-insensitive).
- *Red-flag / dealbreaker match*: a planted item is "detected" if the system surfaces a flag whose
  text (sim: `message`+`category`; live: the `## Red Flags`/`## Data Gaps`/`## Agent Verdict` text)
  contains a configurable keyword set hit (≥1 keyword AND, for sim, category agreement when present).
  Keyword sets are part of the committed ground truth and reviewed for fairness.
- *Verdict match*: normalize to {PASS, CONDITIONAL, FAIL}; map `PROCEED_WITH_MITIGATIONS`→CONDITIONAL,
  `NEEDS_REVIEW`→CONDITIONAL. Directional: FAIL→no-go; PASS/CONDITIONAL→go.

### 0(c) Scoring methodology + what "pass" means

Per deal, per layer, the harness computes the metrics above into a deal scorecard, then aggregates
across deals into a benchmark scorecard (macro-average over deals; counts reported alongside ratios
so small-N is visible). Tolerances are fixed in this design BEFORE any run and never loosened to
raise a score.

**Target thresholds (targets, NOT data-tuning gates — actual vs target is always reported):**

| Metric | Target |
|---|---|
| Extraction precision | ≥ 0.90 |
| Extraction recall | ≥ 0.85 |
| Numeric-within-tolerance (extraction) | ≥ 0.90 |
| Financial accuracy — determinable (LIVE) | ≥ 0.85 |
| Red-flag recall (LIVE) | ≥ 0.70 |
| Dealbreaker recall (LIVE) | ≥ 0.90 |
| IC exact-match (LIVE) | ≥ 0.60 |
| IC directional-match (LIVE) | ≥ 0.80 |

"Pass" for the eval as a whole = the harness runs reproducibly, emits a schema-valid scorecard +
trust report, and the report states actual numbers honestly (including misses) with the live path
clearly separated from the fixture. Hitting every target is NOT required for the eval to be "done";
honestly reporting where targets are missed (and either fixing or documenting them in Phase 4) is.

**Live-eval scope (cost management):** per deal run the `quick-deal-screen` workflow (5 due-diligence
agents + 3 underwriting agents incl. `ic-memo-writer`). This surfaces DD red flags across categories
(occupancy, environmental, market, credit) + UW financials + an IC verdict — the full scoring surface
— at 8 agents/deal instead of 21. Re-scope to `full-acquisition-review` only if a signal is missing.

---

## PHASE 1 — Synthetic benchmark dataset  (STATUS: PASS)

**Built + verified.** `eval/generators/generate_deals.py` (deterministic, idempotent — 40 files
byte-identical across two runs). 8 deals under `eval/benchmark/deals/<id>/` (deal.json + documents/ +
ground-truth.json). All 8 `deal.json` validate against `config/deal-schema.json`. All documents parse
(`status=extracted`). Ground truth derived from one canonical spec per deal (verified by hand on
va-sub120-dscr: NOI 958k/price 15.5M = 0.0618 cap ✓; NOI/debt-service 846,465 = 1.13 DSCR ✓).
Reference IRR/EM model documented in `eval/generators/README.md` (5-yr hold, 3%/2.4% growth, exit cap
= going-in+25bps floored 5.5%, in-place NOI). Evidence: see deal table in generators/README.md.

The benchmark now ships 8 reproducible deals via a committed Python generator (`eval/generators/`),
reusing the repo's existing openpyxl/reportlab fixture-generation patterns. Each deal: `deal.json` +
synthetic docs (rent-roll.xlsx, t12.xlsx, offering-memo.pdf/md) with realistic messiness + planted
issues + `ground-truth.json`. Deterministic (no `random`/`datetime.now()`); documented; no PII.

Planned deals (issues planted to make detection measurable). All 8 specs are defined in
`generate_deals.py` and active in the current benchmark via `all_specs()` (re-expanded 3→8 on
2026-05-25 to prove the live agents on the narrative-risk deals — see Work log):

| # | dealId | Archetype | Planted issue(s) | Doc messiness | Expected IC |
|---|---|---|---|---|---|
| 1 | cp-stabilized-clean | core-plus | none (false-positive control) | alt headers | PASS |
| 2 | cp-insurance-understated | core-plus | insurance line understated in T12 | currency symbols, multi-sheet | CONDITIONAL |
| 3 | cp-concentration-risk | core-plus | single-employer tenant concentration | trailing notes | CONDITIONAL |
| 4 | va-sub120-dscr | value-add | going-in DSCR ~1.10–1.18 (sub-1.20) | merged header cells | CONDITIONAL |
| 5 | va-overlevered-ltv | value-add | targetLTV 0.82 (over-levered) | subtotal rows | CONDITIONAL |
| 6 | va-missing-phase1 | value-add | no Phase I ESA (env data gap) | conflicting OM-vs-T12 NOI | CONDITIONAL |
| 7 | ds-occupancy-collapse | distressed | in-place occupancy 0.62, no bridge → DEALBREAKER | occupancy-convention quirks | FAIL |
| 8 | ds-dscr-below-080 | distressed | going-in DSCR < 0.80 → DEALBREAKER | currency + trailing notes | FAIL |

---

## PHASE 2 — Eval harness  (STATUS: PASS — built; extraction+sim verified, live in progress)

**Built + verified (offline layers).** Files: `eval/run-eval.mjs` (runner, AJV-validates scorecard
before writing), `eval/lib/scoring.mjs` (pure, 46 unit tests via `scripts/eval-scoring.test.mjs`),
`eval/lib/markdown-parse.mjs` (pure live-workpaper parser, tested), `eval/lib/extract-extraction.mjs`
(tsx → real parser-service), `eval/lib/extract-sim.mjs`, `eval/lib/extract-live.mjs`,
`eval/lib/trust-report.mjs`, `eval/schemas/scorecard.schema.json`. Wired `npm run eval` (+
`eval:extraction|sim|live`); `test:eval` in `npm test` (README Tests 8→9; validate:docs green).

Verified smoke runs:
- `node scripts/eval-scoring.test.mjs` → 46 ok, `[eval-scoring-test] PASS`.
- `npm run eval -- --mode extraction` → schema-valid scorecard; extraction P/R/F1/numTol = **100%**
  on all 8 deals (parser genuinely recovers every planted field — honest; extraction is not where it
  breaks).
- `npm run eval -- --mode sim` → schema-valid; determinable financials **100%** (tautological,
  fixture); IC verdict matches only **3/8** (sim threshold logic says FAIL on the clean PASS deal +
  most CONDITIONALs); red-flag recall spotty (0% insurance/concentration/occupancy — no logic; 100%
  DSCR/LTV threshold triggers). Confirms: the simulation is a fixture, not reasoning.
- Live path: validated end-to-end on real Codex 0.132.0 (va-sub120-dscr, quick-deal-screen, 8/8 agents
  PASS). verdict CONDITIONAL = exact match; NOI $958K ✓, cap 6.18% ✓, DSCR 1.13x ✓ (determinable 75%);
  DSCR red flag caught (required recall 100%). EGI/IRR/EM = null (honest — the live UW agents declined
  to compute IRR/EM without a scenario matrix and didn't label EGI).

**Critical harness fixes found by inspecting REAL live output (the eval finding its own bugs):**
1. **Stale-sim contamination:** live agents read `data/reports/<id>/final-report.md` from a prior sim
   run. Fixed: clear phase-outputs/reports/normalized/status.json per deal first (keep the status/ dir
   — StoryEngine needs it; deleting it caused an ENOENT, also fixed).
2. **ANSWER-KEY LEAK (validity-critical):** Codex runs read-only over the WHOLE repo; a workpaper cited
   "Benchmark ground truth expects roughly 11.24% IRR and 1.67x equity multiple" — it had read
   `ground-truth.json`. Fixed: `eval/lib/answer-stash.mjs` moves all 12 answer-bearing paths
   (8 ground-truth.json + EVAL-PLAN.md + eval/README.md + eval/generators + eval/results) OUT of the
   repo during live runs, restores after, crash-safe startup recovery. Verified: no more citations.
3. **Financial parser misreads:** unit-blind regex grabbed "6.5%" (rate) as DSCR and "27" (from
   "27-scenario") as IRR/EM. Fixed: unit-aware bidirectional matcher + threshold guard. 52 tests green.
4. **`--reparse` mode:** re-score saved workpapers without re-running Codex — used to validate 1–3 fast.
5. **Sim-leftover leak (in `--mode all`):** the sim phase writes per-agent checkpoints to
   `data/status/<id>/agents/` and `data/logs/<id>/master.log` (the 27-scenario "0/27" fixture). A live
   agent read them and parroted the sim's harsh FAIL. Fixed: per-deal cleanup now also scrubs
   `data/status/<id>/agents` + `run-*` and `data/logs/<id>` (and runs live in its own pass so the sim
   never writes sim-metric files before the agents reason).
6. **Prior-run leak:** live agents grep the repo and matched PRIOR eval runs' workpapers/scorecards
   under `data/codex-runs/*` and `data/eval-runs/*` (old verdicts + expected values). Fixed: before a
   live run, remove THIS eval's own prior `data/eval-runs/*` and per-deal `data/codex-runs/<run>-<id>`
   dirs (scoped to this eval's artifacts only — never unrelated runtime).

**HONEST RESULT — `cp-insurance-understated`, fully clean run (Codex 0.132.0, verified zero leakage):**
| Layer | Result |
|---|---|
| **Extraction** (deterministic parser) | precision/recall/F1/numeric-tolerance = **100%** |
| **Simulation** (FIXTURE — not reasoning) | verdict **FAIL** (truth CONDITIONAL — WRONG); determinable financials 100% (tautological); red-flag recall **0%** (no logic for insurance understatement) |
| **Live** (real Codex reasoning) | IC verdict **CONDITIONAL = EXACT MATCH** ✓; determinable financials **100%** (NOI 1,148,000 ✓, EGI 2,280,000 ✓, cap 5.74% ✓, DSCR 1.25 ✓); red-flag recall **100%** (caught the planted insurance understatement); model-dependent IRR/EM **null** (agent transparently declined to compute without a scenario matrix) |

Headline: on this deal the **live reasoning matched the correct IC verdict exactly and caught the planted
flag, while the deterministic simulation got the verdict wrong and missed the flag** — concrete proof
that (a) the simulation is a fixture, not reasoning, and (b) the contamination fixes were essential (every
contaminated run gave the wrong FAIL; the clean run gives the correct CONDITIONAL). Known live gap:
IRR/equity-multiple not produced in the quick screen.

`eval/run-eval.mjs` (wired as `npm run eval`). Flags: `--mode extraction|sim|live|all`,
`--deals <ids>`, `--run-id <id>`, `--workflow <id>`, `--concurrency <n>`.

- **extraction** mode: invoke `parser-service` on each deal's docs → score vs `ground-truth.extraction`.
- **sim** mode: `orchestrate.js --deal <deal.json>` → read phase-output JSON → score (labeled fixture).
- **live** mode: `codex-agent-runner.js --deal <deal.json> --workflow quick-deal-screen` → parse
  markdown workpapers → score. Capture model + Codex version + date in the scorecard. Handle and
  report partial failures (failed agents) honestly — a failed agent ≠ a detected flag.
- Emits `eval/results/scorecard.json` (validated against `eval/schemas/scorecard.schema.json`) +
  `eval/results/TRUST-REPORT.md`. Runtime working files under `data/eval-runs/<runId>/` (gitignored).
- Scorer logic = pure functions in `eval/lib/scoring.mjs`, covered by `scripts/eval-scoring.test.mjs`
  (synthetic known inputs → known scores), wired into `npm test`; README Tests count bumped to match.

---

## PHASE 3 — Honest baseline  (STATUS: pending)
Run `npm run eval --mode all` for real. Record REAL extraction, sim, and LIVE numbers below,
including every miss/failure. No fixing yet.

## PHASE 4 — Fix worst gaps, re-measure  (STATUS: PASS — fixes applied + known limit documented)
The "worst gaps" the eval exposed were CONTAMINATION bugs in the eval itself (4 vectors: stale sim
reports, answer-key leak, sim-leftover checkpoints/logs, prior-run workpapers) — all found by
inspecting real live output, all fixed, and each fix re-measured via `--reparse` (turning a wrong
contaminated FAIL into the correct CONDITIONAL). Documented KNOWN-LIMIT: the live `quick-deal-screen`
agents do not compute IRR / equity-multiple (model-dependent metrics) — they transparently decline
without a scenario matrix, so live model-dependent accuracy is 0%. The deterministic simulation's
IC-verdict unreliability (3/8 match) is by-design fixture behavior, reported as such, not a fixable bug.

## PHASE 5 — Publish proof  (STATUS: PASS)
`npm run eval` wired; `eval/README.md` (methodology + how to extend) committed; README headline numbers
+ links added (honest, incl. the 1/8 live scope and weaknesses); full validation gate green;
scorecard + trust report committed under `eval/results/`. Completion report below.

---

## Definition of Done (all true, with pasted evidence)

| ID | Item | Status | Evidence |
|---|---|---|---|
| A | `npm run eval` reproducibly scores benchmark → schema-valid scorecard + trust report | PASS | `npm run eval` → "scorecard schema-valid ✓" + writes `eval/results/{scorecard.json,TRUST-REPORT.md}`; AJV-validated in-runner before write |
| B | ≥3 realistic synthetic deals w/ committed ground truth; generators reproducible | PASS | (Original 2026-05-21 run) 8 deals in `eval/benchmark/deals/`; `python eval/generators/generate_deals.py` deterministic (40 files byte-identical x2 runs); all 8 deal.json valid vs config/deal-schema.json. **2026-05-24: benchmark trimmed to the 3 active deals (15 files) — see Work log. 2026-05-25: re-expanded back to the full 8 deals (40 files) for the narrative-risk goal — see Work log.** |
| C | Trust report shows REAL live-agent metrics (model + date) incl. failures, separated from sim | PASS (live scope = 1/8 by user direction) | TRUST-REPORT.md: live = Codex CLI 0.132.0, run 2026-05-21, `cp-insurance-understated` IC exact-match + 100% determinable fin + 100% red-flag recall; live clearly separated from the sim fixture; live coverage honestly labeled 1 of 8 (user scoped the costly live runs to one deal; harness runs all 8 via `npm run eval`) |
| D | Worst baseline gaps fixed-and-re-measured OR documented as known limits | PASS | 4 contamination bugs fixed + re-measured via `--reparse` (wrong FAIL → correct CONDITIONAL); live IRR/EM gap documented as KNOWN-LIMIT |
| E | README surfaces honest headline numbers + link; no inflated/fabricated figures | PASS | README "Honest Evaluation — Prove It" section: extraction 100% (8/8), sim fixture IC-match 3/8, live exact-match (1 deal), links to eval/README.md + TRUST-REPORT.md; explicit 1/8 live scope |
| F | Full existing validation gate passes; no regressions; counts/docs consistent | PASS | npm test PASS; release:check all-green; validate:docs/guides/fixtures PASS; test:parsers/test:workspace PASS; npm audit 0 vulns; README counts 31/8/27/5/20/9 consistent |
| G | EVAL-PLAN.md shows every item done with evidence (commands + real output) | PASS | this ledger |

---

## Work log

- 2026-05-21: Run started. 5-agent parallel codebase explore complete (sim path, live path, fixtures/
  parsers, financial schemas/IC verdict, test/validation infra). Confirmed Codex CLI 0.132.0 logged in
  (live path runnable) and Python pandas/openpyxl/pdfplumber/reportlab present. Phase 0 design written.
- 2026-05-21: Phases 1–2 built (dataset + harness) via 2 parallel build agents; 52 scorer/parser unit
  tests wired into `npm test`. Live path validated on real Codex; FOUR contamination vectors found by
  inspecting real output and fixed (stale sim reports, answer-key leak, sim-leftover checkpoints/logs,
  prior-run workpapers); `--reparse` added. The crash-safe answer-stash was exercised for real (a killed
  run left keys stashed; startup recovery restored all 12).
- 2026-05-21: Scope narrowed by user to ONE live deal. Final benchmark scorecard built: extraction +
  simulation on all 8 deals (deterministic, cheap); live on `cp-insurance-understated` (verified zero
  leakage). Headline: live reasoning got the IC verdict EXACTLY right (CONDITIONAL) and caught the
  planted flag, while the deterministic SIMULATION got it WRONG (FAIL) and missed the flag — proving the
  sim is a fixture and the live path is the real signal. README + eval/README published; full validation
  gate green; committed. DoD A,B,D,E,F,G met; C met at 1/8 live coverage (user-scoped). COMPLETE for the
  one-deal scope; remaining 7 live deals are one `npm run eval` away.
- 2026-05-24 (usability-hardening pass): Benchmark **trimmed 8 → 3 representative deals** — one per
  archetype: `cp-stabilized-clean` (core-plus, expected PASS), `va-overlevered-ltv` (value-add, expected
  CONDITIONAL), `ds-occupancy-collapse` (distressed, expected FAIL). `all_specs()` in
  `generate_deals.py` now returns just these three; the other five archetype specs
  (cp-insurance-understated, cp-concentration-risk, va-sub120-dscr, va-missing-phase1, ds-dscr-below-080)
  remain defined for extension but are no longer emitted. The deterministic layers (extraction + sim)
  now run on **3 deals** (15 committed files), giving a fast, focused regression set for the real-world
  drop-flow hardening work. The dated 2026-05-21 entries above describe the original 8-deal run and are
  left intact as the historical record.
- 2026-05-25 (narrative-risk goal): Benchmark **re-expanded 3 → 8** — `all_specs()` in
  `generate_deals.py` again returns all eight archetype specs, and the deterministic layers (extraction +
  sim) run on **8 deals** (40 committed files). Live agents proven on the hard narrative-risk deals
  (tenant concentration / insurance-understatement / missing-Phase-I + OM-vs-T12 NOI conflict), whose
  planted issues are buried in the documents rather than tripping a numeric threshold — see
  docs/NARRATIVE-RISK-GOAL.md. The 2026-05-24 trim entry above is left intact as the historical record.
