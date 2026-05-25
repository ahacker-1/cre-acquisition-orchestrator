# Evaluation Goal — Prove It

Paste the prompt below back as a new message to start an autonomous run that builds an open
evaluation harness + honest trust report for the orchestrator, then fixes the worst gaps it
exposes. This is the recommended "next level" goal after the v2.7.0 completion pass: turn an
impressive-but-unproven architecture into a measurable, credible one. Everything between the
rules below is the goal.

---

GOAL: Prove it — build an open evaluation harness + honest trust report for the
CRE Acquisition Orchestrator, then fix the worst gaps it exposes.

Operate on the repo at C:\Users\ahack\OneDrive\Desktop\cre-acquisition-orchestrator.
Work autonomously. Do NOT stop until the Definition of Done is met WITH EVIDENCE. Maintain a
persistent ledger at EVAL-PLAN.md (source of truth across context resets). Use the project's
phased-plan-executor / TDD / systematic-debugging skills. Do NOT add a Co-Authored-By trailer.

NORTH STAR: a CRE professional should be able to run one command, see honest accuracy numbers
for how the system performs on realistic deals with known correct answers, and trust them.

────────────────────────────────────────────────────────
CARDINAL RULE (non-negotiable)
────────────────────────────────────────────────────────
The eval is worthless if it isn't honest. NEVER fabricate, hardcode, round up, or cherry-pick
metrics. NEVER tune the benchmark dataset to flatter the system. If a score is bad, report it
bad and surface why. A credible "it's 71% accurate and here's where it breaks" beats a fake 99%.
Distinguish clearly between the DETERMINISTIC SIMULATION (a fixture — NOT evidence of reasoning)
and the LIVE agent path (real LLM reasoning — the number that actually counts).

HARD CONSTRAINTS: synthetic data only — generate realistic deals, do NOT scrape real listings or
use private/real deal data. No paid external data providers. Offline-first stays the default.
No autonomous external actions. Don't weaken existing tests/gates.

────────────────────────────────────────────────────────
PHASE 0 — Design the evaluation (write it down before building)
────────────────────────────────────────────────────────
Define in EVAL-PLAN.md: (a) a ground-truth schema for a deal (correct extracted fields, correct
NOI/EGI/DSCR/cap rate/IRR/equity-multiple within stated tolerances, the planted red flags and
dealbreakers, and the correct IC go/no-go verdict); (b) the metrics — extraction field-level
precision/recall, numeric accuracy within tolerance, red-flag detection recall, dealbreaker
detection, IC-recommendation match rate; (c) the scoring methodology and what "pass" means.

────────────────────────────────────────────────────────
PHASE 1 — Build a synthetic, realistic benchmark dataset (with ground truth)
────────────────────────────────────────────────────────
Generate a committed, deterministic set of N>=8 deals spanning core-plus / value-add / distressed,
with realistic messiness (merged cells, currency formatting, trailing notes, alternate headers,
text PDFs, conflicting OM-vs-T12 NOI, occupancy quirks) AND planted issues (e.g. over-levered
LTV, insurance understatement, missing Phase I, concentration risk, sub-1.20x DSCR). Each deal
ships with a machine-readable ground-truth answer key. Generators must be reproducible and
documented; no real PII.

────────────────────────────────────────────────────────
PHASE 2 — Build the eval harness (runtime-agnostic)
────────────────────────────────────────────────────────
A runner (e.g. `npm run eval`) that executes the pipeline on each benchmark deal and SCORES the
outputs against the answer key, emitting a machine-readable scorecard (JSON, schema-validated)
plus a human-readable trust report (Markdown). It must score the LIVE agent path (Codex/LLM —
the real reasoning, labeled with model + date) and may separately report the deterministic
simulation as a fixture baseline. Handle and report partial failures honestly.

────────────────────────────────────────────────────────
PHASE 3 — Get the honest baseline
────────────────────────────────────────────────────────
Run it. Record the REAL numbers in EVAL-PLAN.md, including every place the system is weak or wrong.
No fixing yet — establish ground truth about current quality.

────────────────────────────────────────────────────────
PHASE 4 — Fix the worst real gaps the eval exposed, then re-measure
────────────────────────────────────────────────────────
Prioritize by impact: improve the prompts/orchestration logic/extraction where the metrics are
worst. Re-run the eval after each fix. Iterate until metrics are honestly strong OR the residual
weakness is documented as a known limit with a reason. Never adjust the dataset to make scores
rise. Keep the full existing validation gate green throughout.

────────────────────────────────────────────────────────
PHASE 5 — Publish the proof
────────────────────────────────────────────────────────
Commit the dataset, harness, scorecard, and trust report. Add `npm run eval` and document the
methodology + how to extend the benchmark (so it can become an open standard). Surface the honest
headline numbers in the README with a link to the full report — including the weaknesses.

────────────────────────────────────────────────────────
DEFINITION OF DONE (all true, with pasted evidence)
────────────────────────────────────────────────────────
A. `npm run eval` reproducibly scores the benchmark and emits a schema-valid scorecard + trust report.
B. 8 realistic synthetic deals with committed ground truth exist; generators are reproducible.
C. The committed trust report shows REAL live-agent metrics (model + date), including failures,
   clearly separated from the simulation fixture.
D. The worst gaps from the baseline are either fixed-and-re-measured or documented as known limits.
E. README surfaces honest headline numbers + link, with no inflated or fabricated figures.
F. The full existing validation gate still passes; no regressions; counts/docs consistent.
G. EVAL-PLAN.md shows every item done with evidence (commands + real output).

Produce a final report: the trust-report numbers, before/after the Phase-4 fixes, the gate output,
and a table of every ledger item -> status -> evidence. Only then stop. Begin with Phase 0.
