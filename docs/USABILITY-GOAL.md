# Usability Goal — Make the Real-World Drop Flow Bulletproof

Paste the prompt below back as a new message to start an autonomous run that hardens the
actual end-user journey: a CRE professional drops a messy pile of documents (T12s, rent rolls,
offering memos, plus unrelated/odd files) into the workspace and walks the whole flow without a
single crash, silent failure, or confidently-wrong number. Everything between the rules below is
the goal.

---

GOAL: Make the real-world document drop flow of the CRE Acquisition Orchestrator work perfectly,
end to end, on messy real-world document piles — and don't stop until every bug is fixed.

Operate on the repo at C:\Users\ahack\OneDrive\Desktop\cre-acquisition-orchestrator.
Work autonomously. Do NOT stop, hand back, or ask "should I keep going?" until the Definition of
Done below is fully met WITH EVIDENCE. Treat "it works" as a claim that requires proof — exercise
the real flow and paste real output. If you hit context limits, your persistent ledger is the
handoff — resume from it, don't restart. Do NOT add a Co-Authored-By trailer to commits.

NORTH STAR: Someone with a T12, a rent roll, an offering memo, and a bunch of other files should
be able to drop them all in, and the system walks the whole journey — classify → extract with
provenance → review/approve/waive → run a workflow → export the IC package — with ZERO crashes,
ZERO silent skips, and ZERO confidently-wrong numbers. Unparseable or irrelevant files are
classified, stored, and clearly flagged — never a 500, a hang, or a wrong-but-confident field.

────────────────────────────────────────────────────────
SCOPE (locked by the operator — do not expand)
────────────────────────────────────────────────────────
- TARGET PATH: the FULL offline real-world drop flow (upload → classify → extract → review →
  approve/apply/waive → launch workflow → export IC package). The offline/deterministic path and
  the deterministic parsers are what must be bug-free. NO API cost is required to pass.
- REGRESSION SET: exactly 2–3 deals spanning archetypes (one clean core-plus, one value-add,
  one messy/distressed). EIGHT deals is too many — trim the existing benchmark down to 2–3. (trimmed to 3, later re-expanded to 8 for the narrative-risk goal — see docs/NARRATIVE-RISK-GOAL.md)
- LIVE AGENT REASONING (Codex/LLM) is OPTIONAL and is a bonus only. It is NOT required to satisfy
  any Definition-of-Done item. Do not spend the run chasing live-agent scores.

────────────────────────────────────────────────────────
OPERATING RULES
────────────────────────────────────────────────────────
1. Use the project's discipline skills: phased-plan-executor for multi-step work,
   superpowers:systematic-debugging for EVERY crash/failure (root-cause, don't patch symptoms),
   superpowers:test-driven-development for new/changed parsing & flow code, and
   production-guardian before declaring any step bulletproof.
2. Maintain a single source-of-truth ledger at repo root: USABILITY-PLAN.md. Every defect found,
   its repro, root cause, the fix, how it's verified, and the evidence live there. It survives
   context resets — update it continuously, never let it go stale.
3. For every defect: minimal repro → failing test that captures it → smallest correct fix →
   re-run → record the command + a snippet of REAL output as evidence → mark fixed.
4. NEVER weaken, skip, xfail, comment out, or delete a test/assertion to make a gate pass.
   NEVER fabricate output, mock away the thing being verified, lower a confidence target to dodge
   a real miss, or hardcode a "green" result. If something genuinely can't pass, root-cause it.
5. Honest status only. A crash is a crash. A wrong number is wrong. A skipped step is skipped.
6. NEVER tune the benchmark/ground truth to flatter the system. If extraction is wrong, fix the
   PARSER, not the answer key. A field that genuinely can't be parsed reliably must be down-
   confidenced or flagged — never emitted as a high-confidence wrong value.
7. HARD SAFETY CONSTRAINTS (always, even in maximal mode):
   - Never commit secrets/credentials. Never add autonomous external sending/outreach/posting.
   - Never add autonomous investment decisioning without a human-review gate.
   - Keep the deterministic offline demo as the default public path.
   - Synthetic data only — generate realistic messy documents; do NOT use real/private deal data
     or scrape real listings.

────────────────────────────────────────────────────────
PHASE 0 — STAND UP THE REGRESSION HARNESS (do this first)
────────────────────────────────────────────────────────
The eval harness + benchmark live on the `eval-harness` branch (a clean superset of `main`):
`eval/` (runner, scoring, libs), `eval/benchmark/deals/` (3 deals with ground truth),
`scripts/eval-scoring.test.mjs`, and the `npm run eval` scripts. Branch from `eval-harness`
(e.g. `usability-hardening`) so the harness is present, THEN:
  - Trim the benchmark to 2–3 deals across archetypes (keep e.g. cp-stabilized-clean,
    va-overlevered-ltv or va-missing-phase1, and ds-occupancy-collapse or ds-dscr-below-080).
    Update the eval runner/scorecard/trust-report and any counts so the trimmed set is the set.
  - Assemble ONE deliberately nasty "real-world pile" smoke fixture under
    fixtures/ (e.g. fixtures/real-world-pile/): the 3 core docs in messy formats PLUS the junk a
    real operator actually drops — a .docx, an image/photo (.jpg/.png), a scanned/image-only PDF,
    a random unrelated PDF, a .zip, an empty 0-byte file, a huge file, a binary blob with a .csv
    extension (mislabeled), and a file whose name implies one type but content is another. This
    pile is the crash/honesty proving ground.

────────────────────────────────────────────────────────
PHASE 1 — BASELINE: WALK THE REAL FLOW, RECORD EVERYTHING (no fixing yet)
────────────────────────────────────────────────────────
Establish ground truth about what actually happens today. Record every result in the ledger.
  - Run `npm run eval` (trimmed) and capture the real extraction precision/recall, numeric-within-
    tolerance, and IC-verdict numbers for the 2–3 deals.
  - Drive the REAL ingestion path on the nasty pile via the actual parser/upload flow
    (the eval extraction layer already runs dashboard/server/parser-service.ts on real files;
    use the same entrypoint or the dashboard upload API). For EACH file record: did upload work,
    was it classified to the right type, parser status (extracted / extraction-pending /
    parse_failed / parser-unavailable / unsupported), fields + provenance produced, and ANY
    crash, stack trace, hang/timeout, silent empty result, or wrong-but-confident value.
  - Start the dashboard (`npm run dashboard`) and walk the full journey for one deal:
    drop files → classify → Evidence extraction preview → approve/apply trusted + waive/reject
    ambiguous → launch a workflow → export the IC Package. Note every step that is broken,
    confusing, or gives no clear next action.
  - Run the full existing validation gate (see Definition of Done F) and record pass/fail.
KNOWN SUSPECT AREAS to probe hard (verify, don't assume): occupancy detection in
parseRentRoll (the status regex is strict — "Leased", "MTM", "Notice", "Current", "Vacant-Leased"
may be miscounted); hardcoded confidence constants that don't reflect real reliability;
divergence between the CSV/TXT parsers and the Excel/PDF Python-bridge parsers; multi-sheet
workbooks (which sheet wins?); conflicting OM-vs-T12 NOI; 15s python parser timeout on large
files; any file type that reaches a parser and throws instead of degrading.

────────────────────────────────────────────────────────
PHASE 2…N — DRIVE EVERY DEFECT TO ZERO, RE-MEASURE AFTER EACH
────────────────────────────────────────────────────────
Work the ledger down to zero open defects, by category, TDD where code changes:
  (a) CRASH-PROOFING: no file type, no malformed/empty/huge/binary/mislabeled/password-protected
      input may crash or hang the parser or server. Unknown/unsupported → classified, stored, and
      returned with a clear status, never an exception or a 500.
  (b) CLASSIFICATION: rent roll / T12 / offering memo route correctly from filename + content;
      ambiguous files get a sensible default AND the operator can reclassify.
  (c) EXTRACTION CORRECTNESS + HONESTY: fields match ground truth within tolerance; provenance
      (sheet/row/column/page/line) is correct and drill-into-source works; messy formats (merged
      cells, multi-sheet, subtotal/total rows, currency symbols, alternate/synonym headers,
      varied occupancy conventions, OM-vs-T12 conflicts) are handled OR explicitly flagged —
      never silently wrong. Confidence must track reality: low-reliability fields get low
      confidence or a warning, not a confident wrong number.
  (d) REVIEW GATE: approve / apply / waive / reject all work; decision history is correct;
      cross-document conflicts are surfaced and block until resolved; nothing becomes an
      underwriting input without passing the gate.
  (e) DOWNSTREAM: the workflow launches on approved inputs; the IC Package exports with correct
      numbers, red flags, and drilldowns back to the originating source; version history is sane.
  (f) UX CLARITY: every error/empty/pending state gives the operator a clear next action.
Re-run `npm run eval` and the relevant gate commands after each fix so nothing regresses.
Iterate until metrics are honestly strong OR a residual weakness is documented as a known limit
with a concrete reason (and that field is honestly flagged, not falsely confident).

────────────────────────────────────────────────────────
DEFINITION OF DONE — all must be TRUE with pasted evidence
────────────────────────────────────────────────────────
A. `npm run eval` (trimmed to 2–3 mixed-archetype deals) reproducibly runs the full offline drop
   flow and scores extraction (field precision/recall, numeric-within-tolerance) + the IC verdict
   against ground truth. Every metric meets its stated target OR the residual is a documented
   known limit with the affected field honestly flagged/down-confidenced. Paste the scorecard.
B. The "real-world pile" smoke test PASSES: every file is classified + stored; parseable files
   are extracted with correct provenance; unparseable/irrelevant files are flagged gracefully —
   ZERO crashes, ZERO hangs, ZERO silent failures, ZERO confidently-wrong values. Backed by an
   automated test that runs the pile through the real parser and asserts the per-file outcome.
C. Manual dashboard walkthrough of the full journey (drop → classify → extract → review/approve/
   waive → launch → export) is confirmed working end to end, backed by e2e coverage and/or
   screenshots.
D. Negative/fuzz coverage proves no file type or malformed input can crash or hang the parser or
   server (the parser always returns a typed status, never throws past its boundary).
E. Every wrong-but-confident value found in the Phase-1 baseline is fixed, or its field is
   honestly down-confidenced/flagged with the reason recorded in the ledger.
F. The full existing validation gate still passes clean and nothing regressed:
   `npm run demo:verify`, `npm --prefix dashboard run build`,
   `npm --prefix dashboard run typecheck`, `npm run test:parsers`, `npm run test:workspace`,
   `npm test`, `npm run test:e2e`, `npm run validate:docs`, `npm run validate:fixtures`,
   `npm run validate:guides`, `npm audit --omit=dev`. README counts/claims match the repo.
G. USABILITY-PLAN.md shows every defect → fixed → with its verification command + real output.
(Optional, bonus only) H. If live Codex auth is available, you MAY report the live-agent
   numbers on one deal as a bonus — but this is never required to satisfy A–G.

────────────────────────────────────────────────────────
FINAL DELIVERABLE
────────────────────────────────────────────────────────
Produce a completion report containing: (1) the trimmed `npm run eval` scorecard + trust numbers,
(2) the real-world-pile smoke result (per-file outcome table), (3) a before/after table of every
defect found in baseline → its fix → evidence, (4) the full validation-gate output, and (5) the
ledger table of every item → final status → evidence. Only after that report is complete and
every Definition-of-Done item A–G is satisfied may you stop.

Begin with Phase 0 now.
