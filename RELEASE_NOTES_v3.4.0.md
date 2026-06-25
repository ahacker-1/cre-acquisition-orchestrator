# Release Notes v3.4.0 - Pipeline Verification + Live Eval Proof

Released: 2026-06-25

v3.4.0 turns the post-3.3.0 hardening work into a verified release. The main change is not a new surface area; it is proof that the existing source-to-IC pipeline and live Codex runtime hold together end to end. Every pipeline phase was exercised, missing artifacts were made first-class, the live-run manifest contract was tightened, and the public evaluation report now reflects a fresh all-8-deal live Codex run.

## Highlights

- **End-to-end pipeline verification ledger** - adds a checked verification ledger covering document intake, source review, due diligence, underwriting, financing, legal, closing, IC package export, offline gates, and live Codex gates.
- **Live Codex proof run** - verifies `npm run codex:status`, `npm run codex:smoke`, `npm run codex:run:full`, `npm run validate:codex`, and `npm run eval:live`.
- **8-deal live eval refresh** - live Codex agents scored all 8 fake benchmark deals with 100% IC exact/directional match, 100% determinable financial accuracy, 100% required red-flag recall, 100% dealbreaker recall, and 0 partial failures. The documented soft spot is model-dependent returns at 25%.
- **Phase artifact hardening** - underwriting now writes and validates the 27-scenario matrix and IC memo side artifacts; closing now writes and validates a structured wire schedule; IC package export now includes first-class document manifest and review decision trail fields.
- **Live manifest schema hardening** - live Codex manifests now validate current runner fields, including root `agentTimeoutMs` and per-result `timedOut`.
- **Source-intake safety** - flagged intake fields block diligence advancement until reviewed, and operator edits continue to win over stale parser reads.

## Pipeline Fixes

- Preserves the pipeline verification ledger across runtime reset paths that clean `data/status`.
- Verifies source-backed document upload, document type classification, parser preview, source hash preservation, extraction candidates, warnings, and conflict review behavior through targeted tests and Playwright paths.
- Records phase-by-phase proof for all acquisition phases:
  - due diligence: 7 specialist agents, unit mix, rent roll, OpEx notes, and risk flags.
  - underwriting: financial model, scenario analysis, 27-scenario matrix, IC memo, DSCR, IRR, equity multiple, and 10-year pro forma.
  - financing: lender outreach, quote comparison, term sheet, and loan sizing.
  - legal: PSA, title/survey, loan docs, insurance, estoppels, transfer docs, and closing conditions.
  - closing: closing coordinator, funds-flow manager, prorations, wire schedule, and funds-flow workpapers.
  - IC package: Markdown export, JSON export, document manifest, evidence graph, and review decision trail.

## Runtime + Security Hardening

- Bounds live Codex agent hangs and records timeout state in the manifest contract.
- Keeps Codex search defaults consistent across presets, direct launches, agent dispatch, phase launches, and retry-failed-agent paths.
- Requires ChatGPT authentication for strict Codex setup.
- Rejects escaping run paths and contains live Codex manifest artifacts.
- Isolates eval answer-key stashes and preserves numeric flag text in eval parsing.
- Adds websocket readiness and production websocket proxy smoke coverage.

## Documentation + Evaluation

- Refreshes README headline evaluation numbers to the June 25 live verification run.
- Updates `EVAL-PLAN.md` so current status, Definition of Done, and work log reflect the full live run instead of older one-deal / 88% historical runs.
- Keeps historical eval notes in place while clearly superseding them with the 2026-06-25 live run.
- Updates the committed trust report and scorecard with the fresh live run, while preserving the all-layer extraction + simulation + live report format through saved-workpaper reparse.

## Verification

The release was verified locally with:

- `npm test`
- `npm run verify:v3:core`
- `npm run test:e2e`
- `npm run validate:docs`
- `npm run validate:guides`
- `npm run validate:codex`
- `npm run codex:status`
- `npm run codex:smoke`
- `npm run codex:run:full`
- `npm run eval:live`
- `node eval/run-eval.mjs --mode all --reparse-run eval-2026-06-25T18-44-12-814Z`

Key live evidence:

- `codex-smoke`: completed with live `financial-model-builder`.
- `codex-1782411174372`: full acquisition workflow completed with 21/21 live agents passing on first attempt.
- `eval-2026-06-25T18-44-12-814Z`: all 8 benchmark deals ran through live Codex agents.
- all-layer reparse report passed `9/9` measured gates.

## Safety Notes

- Live runs still send selected prompts and approved deal context through the user's authenticated Codex CLI / ChatGPT session. Do not use live workflows with confidential deal data unless that data is approved for that environment.
- The deterministic Simulation runtime remains the no-credential fallback for demos, screenshots, and CI-safe validation.
- The live eval benchmark uses synthetic fake deals with committed ground truth; it proves runtime behavior and benchmark performance, not autonomous investment suitability.
