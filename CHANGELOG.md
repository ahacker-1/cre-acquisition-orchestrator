# Changelog

All notable changes to this project are documented here.

This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/) and uses semantic versioning for tagged public releases.

## [3.4.1](https://github.com/ahacker-1/cre-acquisition-orchestrator/compare/v3.4.0...v3.4.1) (2026-06-30)


### Bug Fixes

* contain codex legal prompt files ([706a1fa](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/706a1fa8d44b438154995153931338142e0ea43e))
* harden codex runner input paths ([dd42f48](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/dd42f48c627731c115473a333ff82ce19b5a5df1))
* harden deal id path handling ([e817b20](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/e817b2040fc5d740313dfd8c9a36af69ba6e359b))
* harden ingest deal ids ([096ede3](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/096ede305485fcf795b0a48ed6332f03c1bbcddc))
* harden scenario config paths ([ab82914](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/ab82914ba7e868366b493409df4f45ef36c5cf7e))
* harden story engine deal ids ([3b9bdee](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/3b9bdee381ed58a4ad92e7f7541e23e25122fa8c))
* harden workflow preset paths ([5bc39d5](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/5bc39d5986020e36767a2442ce495b354fd646c4))

## [3.4.0](https://github.com/ahacker-1/cre-acquisition-orchestrator/compare/v3.3.0...v3.4.0) (2026-06-25)

Turns the post-3.3.0 hardening work into a verified release. Every acquisition phase now has recorded
pipeline proof, the live Codex runtime has fresh smoke/full/eval evidence, and the public trust report
reflects a new all-8-deal live run.

### Features

* **Pipeline verification ledger:** adds a checked ledger covering document intake, source review,
  due diligence, underwriting, financing, legal, closing, IC package export, offline gates, and live
  Codex gates.
* **First-class phase artifacts:** underwriting now writes and validates the 27-scenario matrix and
  IC memo side artifacts; closing now writes and validates a structured wire schedule; IC package
  export now includes first-class document manifest and review decision trail fields.
* **Fresh live Codex evaluation:** live agents ran all 8 synthetic benchmark deals with IC exact and
  directional match at 100%, determinable financial accuracy at 100%, required red-flag recall at
  100%, dealbreaker recall at 100%, and 0 partial failures. Model-dependent returns remain the
  documented weak spot at 25%.

### Bug Fixes

* **Intake gating:** flagged source-backed intake fields now block diligence advancement until
  reviewed.
* **Operator edit precedence:** operator-edited approved fields continue to override stale parser
  reads in the deal record.
* **Live manifest validation:** the Codex run manifest schema now accepts current runner fields,
  including root `agentTimeoutMs` and per-result `timedOut`.
* **Runtime containment:** live Codex artifact paths are contained, escaping run paths are rejected,
  answer-key stashes are isolated, live agent hangs are bounded, and production websocket proxy
  readiness is smoke-tested.
* **Codex launch controls:** Codex search defaults are preserved across presets, direct launches,
  phase launches, agent dispatch, swarm launch, and retry-failed-agent flows.

### Documentation

* README headline evaluation numbers now match the June 25 live run: Codex CLI 0.142.0, all 8 deals,
  100% IC exact/directional match, 100% determinable financials, 100% required red-flag recall, 100%
  dealbreaker recall, and model-dependent returns at 25%.
* `EVAL-PLAN.md` now marks the live eval as complete and records the full 2026-06-25 live
  verification sequence.
* `eval/results/scorecard.json` and `eval/results/TRUST-REPORT.md` were refreshed from the saved live
  workpapers while preserving the full extraction + simulation + live report shape.

### Verification

* `npm test`
* `npm run verify:v3:core`
* `npm run test:e2e`
* `npm run validate:docs`
* `npm run validate:guides`
* `npm run validate:codex`
* `npm run codex:status`
* `npm run codex:smoke`
* `npm run codex:run:full`
* `npm run eval:live`
* `node eval/run-eval.mjs --mode all --reparse-run eval-2026-06-25T18-44-12-814Z`

## [3.3.0](https://github.com/ahacker-1/cre-acquisition-orchestrator/compare/v3.2.0...v3.3.0) (2026-06-22)

Makes **live Codex / ChatGPT the default workflow lane** and gives the agent team **real web
search**, so a launched workflow actually goes online and pulls cited market, lender, and
environmental data instead of reasoning only over local fixtures. Also adds lean legal-document
parsing and lands the intake/extraction/launch UX fixes and e2e/CI stabilization from the 3.2.x line.

### Features

* **Codex is the main workflow runtime:** the dashboard now launches the selected workflow on live
  Codex / ChatGPT by default. The Workflow Launcher, Swarm Goal Console, and saved presets default
  to the Codex runtime (Codex listed first, "All selected" agents, concurrency 2), with the
  deterministic Simulation runtime kept as the no-credential fallback for demos, screenshots, and
  CI. `docs/RUNTIME-COMPARISON.md` is reframed accordingly.
* **Live agents actually use web search:** the Codex runner now threads a `searchEnabled` flag into
  the agent prompt and, when `--search` is on, directs agents to actively look up and cite real
  rent/sales comps, submarket rents, occupancy, cap rates, demographics, supply pipeline, and
  current interest/lender rates — and not to claim web search is unavailable when it is enabled.
  Web search is on by default for Codex runs with a visible toggle, and the Swarm launch and
  retry-failed-agents paths both keep it on.
* **Lean legal-document parsing:** PSA, title commitment, and estoppel documents parse into
  review-gated candidate fields with provenance, with committed fixtures and tests.
* **Swarm console can launch live Codex:** the Swarm Goal Console launches the recommended swarm on
  the Codex runtime (with web search) rather than only the deterministic simulation.

### Bug Fixes

* **T12 operating expenses** are stored as a positive magnitude to satisfy the deal schema
  (`financials.trailingT12Expenses` `minimum: 0`), so the extraction applies cleanly instead of
  throwing "Applied extraction would make the deal invalid" on every workspace load.
* **Source reconciliation** no longer false-flags equal values: `valuesDiffer` compares numerically
  with unit normalization (decimal vs percent) and a 0.1% tolerance, and the "Sources disagree"
  message now names the actual conflicting read's value (e.g. `applied 312,000 vs T12 253,548`)
  instead of re-showing the applied value.
* **Blocked phase launch** surfaces the specific missing required fields inline under the Run
  button — with an "Open Edit Deal" shortcut to the wizard — instead of failing silently.
* **Edit Deal wizard** step pills are clickable buttons that jump to a step.
* **Sample/demo deals** are aligned to the schema's `timeline.extensionOptions` object shape so the
  bundled samples validate.
* **Uploaded data inspector** renders negative spreadsheet cells without the CSV formula-injection
  text-qualifier apostrophe (display only; the sanitizer and its security test are unchanged), and
  the IC starter-package source-coverage line is reworded to `N approved (M required)`.
* **Scoped-workflow reports** list only the agents that actually ran in the Workpaper Index, so a
  scoped workflow no longer links workpaper files that were never generated.
* **e2e / CI stabilization:** fixes the dashboard workspace overlay race and modal staging that made
  recovery and stage flows flaky, and speeds up CI feedback for the v3 checks.

### Verification

* `npm test`
* `npm --prefix dashboard run typecheck`
* `npm --prefix dashboard run test:e2e`
* `npm run codex:status` + live Codex single-agent and multi-agent (`quick-deal-screen`) runs with
  web search, confirming real cited sources (Census, FRED, HUD/Fannie Mae, county appraisal,
  apartment-listing data) and passing `validate-contracts --codex-run-id`.

## [3.2.0](https://github.com/ahacker-1/cre-acquisition-orchestrator/compare/v3.1.0...v3.2.0) (2026-06-22)

Ships a production-scale local QA harness and a clearer public proof path. The release adds a
sanitized 150-deal local data path, documents the dashboard's full user-facing surface, exercises
the app like a real operator, and hardens the workspace bugs exposed by that pass.

### Features

* **Production-scale local seed:** `npm run seed:prod-local -- --count 150` creates sanitized
  `QA-LOCAL-2026-*` deals with source documents, extraction artifacts, approved fields, criteria,
  phase state, checkpoint status, and completed-report artifacts under local `data/`.
* **Production local data regression:** `npm run test:prod-local-data` validates schemas,
  source-hash provenance, local-only output boundaries, idempotent reseeding, and generated
  artifact sensitive-token avoidance.
* **Browser inventory gate:** adds a Playwright production-scale inventory that opens a 150-deal
  library, loads a completed seeded workspace, checks lifecycle stages, source review, uploaded
  data inspection, underwriting controls, advanced workflow launch, agent panel routing, and IC
  package export.
* **Public proof path:** adds `npm run proof` and `docs/PROOF-PATH.md` so first-time visitors can
  regenerate Parkview, start the dashboard, and trace one source-backed fact from upload through
  inspection, review, workpaper context, and IC package.

### Bug Fixes

* Reopened completed deals now preserve their checkpoint/source-backed evidence instead of
  synthesizing a pending workspace from saved metadata only.
* Switching between saved deals clears deal-scoped workspace state and remounts the workspace by
  deal ID, preventing stale documents, extraction previews, or package context from bleeding into
  the next deal.
* Manual extraction review actions now use local submission state so unrelated background
  workspace work no longer disables Apply, Reject, or Waive.
* Quick-create duplicate-ID retry handling now waits for a successful create response and detects
  duplicate-ID evidence across sanitized validation payloads.
* API response sanitization now treats repeated safe objects correctly while still breaking true
  circular references.
* Browser test helpers now retry transient loopback setup requests and fall back from the
  recent-deals strip to the Deal Library when auto-refresh detaches a card.

### Documentation

* Adds `docs/QA-INVENTORY.md` with user-facing routes, roles, modals, buttons, inputs, workflows,
  acceptance criteria, and finite risk-based edge cases.
* Adds `docs/QA-BUG-LOG.md` with every production-scale QA defect, reproduction evidence, fix, and
  verification result.
* Updates README, quick demo, first-deal, demo journey, roadmap, and issue seeds around the proof
  path and uploaded data inspector.

### Verification

* `npm test`
* `npm run validate:docs`
* `npm run validate:guides`
* `npm --prefix dashboard run typecheck`
* `npm --prefix dashboard run test:e2e` with all 30 Playwright browser tests passing.

## [3.1.0](https://github.com/ahacker-1/cre-acquisition-orchestrator/compare/v3.0.0...v3.1.0) (2026-06-19)

Ships the local OCR bridge that v3.0.0 made explicit as a review boundary. Readable
scanned/image-only PDFs now render locally, OCR locally, and return source-backed
candidate fields with confidence and provenance instead of stopping at "OCR-ready."

### Features

* **Local scanned-PDF OCR bridge:** scanned/image-only PDFs render to page images with
  PyMuPDF and run through `tesseract.js` locally, with no external OCR service.
* **Review-gated OCR candidates:** OCR-derived asking price, unit count, occupancy, and NOI
  become normal candidate fields with raw snippets, page provenance, source hash, confidence,
  parser metadata, and human review status before any deal input changes.
* **Fail-soft OCR metadata:** unreadable scans or scans without supported headline fields keep
  explicit OCR status, warnings, and next action instead of silently guessing.
* **Fresh-clone OCR setup:** `npm run setup` now installs and verifies `PyMuPDF` alongside
  `pandas`, `openpyxl`, and `pdfplumber`, and `tesseract.js` is tracked in npm dependencies.
* **OCR fixture coverage:** adds a true image-only scanned offering memo fixture that extracts
  asking price, unit count, occupancy, and NOI through the local bridge.

### Documentation

* README, roadmap, first-deal, runtime comparison, demo, setup, launch, prerequisites, and
  troubleshooting docs now describe local OCR support and the remaining hardening boundary.
* Public issue seeds now treat OCR as shipped and point contributors toward image uploads,
  table-heavy scanned rent rolls, diligence checklists, and richer OCR region provenance.

### Verification

* `npm run setup -- --skip-install --skip-codex-install --skip-login`
* `npm run test:parsers`
* `npm run test:pile`
* `npm run test:workspace`
* `npm run demo:verify`
* `npm run verify:v3` with all 29 Playwright browser tests passing.

## [3.0.0](https://github.com/ahacker-1/cre-acquisition-orchestrator/compare/v2.8.5...v3.0.0) (2026-06-18)

Turns the project into a verified, evidence-grade source-to-IC acquisition workbench. This release
keeps the local-first/operator-review contract, then makes the full chain more trustworthy:
fresh-clone setup prepares parser dependencies, document intelligence is more explicit about OCR
boundaries, legal diligence checklists become review-only candidates, IC packages carry a
deterministic evidence graph, the dashboard shows an honest proof path, and one command verifies
the whole release surface.

### Features

* **Fresh-clone parser setup:** `npm run setup` now creates a repo-local `.venv`, installs
  `scripts/requirements.txt` (`pandas`, `openpyxl`, `pdfplumber`), supports read-only `--check`,
  and lets dashboard parser execution prefer the repo virtualenv before system Python.
* **Evidence graph in IC packages:** package JSON now includes source document, approved field,
  workpaper, red-flag, data-gap, and package-section nodes with deterministic edges and graph hash;
  Markdown export adds an Evidence Chain section for source-to-decision review.
* **OCR-ready document handling:** scanned/image-only PDFs and image-only workbooks now expose
  explicit local OCR bridge metadata and a clear next action instead of implying extraction happened
  or silently skipping the file.
* **Legal diligence checklist candidates:** Markdown/TXT legal or closing checklists can produce
  low-confidence, review-only `diligence.checklistItems` candidates with line/raw-text provenance
  and no automatic economic field application.
* **Source-to-IC proof path UI:** Intake and IC package views now show a four-step proof strip
  (`Source doc` -> `Approved field` -> `Agent workpaper` -> `IC package`) with accessible list
  semantics and conservative pending/ready states.
* **Full v3 verification gate:** `npm run verify:v3` runs release drift checks, root tests,
  parser/workspace/security paths, dashboard typecheck/build, root/dashboard audits, offline eval
  without mutating committed eval results, production smoke, and browser E2E.
* **CI verification:** GitHub Actions now installs root/dashboard/Python/parser/Playwright
  dependencies and runs the full v3 gate.

### Bug Fixes

* Dashboard Playwright tests can use local Chrome or Edge when the bundled Chromium cache is
  unavailable, and video recording is opt-in so local e2e does not require Playwright ffmpeg.
* Browser E2E now clears benchmark eval runtime artifacts before deal-library tests, so
  `eval:offline` can run before E2E in the same verification command without stale completed
  benchmark deals hijacking the dashboard.
* README fixture-count validation now ignores generated/ignored stress fixtures and counts
  release-visible fixture files consistently.
* Dashboard dependency audit is clean after refreshing vulnerable transitive packages.

### Documentation

* README, launch, deployment, prerequisites, troubleshooting, runtime comparison, first-deal, and
  contributor docs now describe the parser `.venv`, OCR-ready boundary, legal checklist candidates,
  proof-path surface, and `npm run verify:v3` release gate.

## [2.8.5](https://github.com/ahacker-1/cre-acquisition-orchestrator/compare/v2.8.0...v2.8.5) (2026-05-27)

Redesigns the operator dashboard into one living "deal space" — a persistent frame you drive by
summoning agents — without touching the engine. Drop documents and the deal record auto-populates;
you only edit what the team flags. The deterministic offline demo (Parkview) remains the default
public path and needs no API keys; all changes are presentation plus three thin, guarded backend
hooks, and are backward-compatible.

### Features

* **Persistent "deal space" frame:** the old six-tab dashboard is replaced by one frame — deal header + a 7-step lifecycle spine (Intake → Diligence → Underwriting → Financing → Legal → Closing → IC) + a context-sensitive center stage + a right rail (live feed + "Your Team") + a command bar. The power-user knobs (runtime/scenario/Codex limits, criteria overrides, workflow presets, mission control, logs, timeline, partial-failure recovery) move into an Advanced drawer with dialog a11y (focus, Escape-close, body scroll-lock).
* **Intake with no manual entry:** dropping the rent roll / T12 / offering memo auto-extracts and auto-applies every trusted source-backed value (confidence ≥ 0.7, no conflict, validated, source-hash matched); only conflicts and low-confidence reads are flagged for inline edit, which persists with provenance + a decision-audit entry. One document-first front door — the numbers come from the documents, not a data-entry form.
* **Summon agents and watch them work:** click a teammate (rail), type a command, or tap a chip to open a slide-in agent panel that streams the agent's reasoning with an elapsed timer, renders its workpaper (summary / finding / verdict / caveats) with "open full workpaper," and echoes the task it was given — plus a follow-up box to keep tasking it (live Codex single-agent dispatch via `--agent`; offline replays recorded work). The live feed keeps running behind it.
* **Editorial-premium visual system:** a real type scale (tight display headlines, wide-tracked uppercase labels), hairline structure, and a four-state functional status color (live / done / review / blocked) layered on the monochrome brand so progress is legible at a glance.

### Bug Fixes

* **Intake "Your Team" rail is staffed:** the default landing stage previously read "No agents staffed"; it now surfaces the ingestion crew (Document Orchestrator + rent-roll / financials / offering-memo parsers), and team status keys on the agent id so each member's live state renders.
* **Agent panel completeness:** the promised elapsed timer is now populated from the agent's event span; the panel echoes the task it was summoned with; and a declined/failed live dispatch surfaces an actionable notice instead of sitting silently idle.
* **Honest operator copy:** the front-door promise matches the real flow, and a gated live review explains exactly which source-backed inputs to provide first.
* **"New Deal" is document-first too:** the prominent New Deal button still opened the legacy manual data-entry wizard, contradicting the "no data-entry form" intake promise above. It now opens the same document-drop front door — drop the package and the team fills + flags the deal record — while the step-through wizard is kept only for editing an existing deal (the redundant "Upload Package" header button folds into "New Deal").
* **Lower-friction first run:** the front-door header hides run-time chrome (the run-status chip, Run Demo, Stop) until a deal is open or a run is active, leaving one clear create path and a single demo entry; dropping a PDF now sets an honest expectation up front — "PDFs upload for one-click extraction" (they don't auto-fill like CSV/Excel rent rolls and T12s), with an in-flow note instead of a silently empty record; and the create step trades orchestration jargon ("mission" / raw workflow id) for plain language.

## [2.8.0](https://github.com/ahacker-1/cre-acquisition-orchestrator/compare/v2.7.0...v2.8.0) (2026-05-25)

Two themes: hardening the real-world document-drop journey, and shipping an honest open
evaluation harness that proves the live agents detect document-buried ("narrative") risks the
deterministic demo is blind to. The offline demo remains the default; all changes are
backward-compatible.

### Features

* **Real-world drop-flow hardening:** a messy real-world pile (T12s, rent rolls, offering memos, plus junk files) now flows through classify → extract → review → workflow → export with no crashes, silent skips, or confidently-wrong numbers. Vacant `$0` rent rows no longer deflate in-place rent averages (Excel and CSV paths); rent roll vs T12 is classified by document content, not just filename; oversized CSVs and corrupt/unreadable workbooks degrade to a graceful `parse_failed` (no hangs); local filesystem paths are redacted from parser errors; and Python-interpreter selection falls back resiliently. An automated smoke test (`npm run test:pile`) drives the nasty pile through the real parser and asserts a typed per-file outcome.
* **Threshold-driven IC verdict:** the deterministic engine now consults `config/thresholds.json` for dealbreakers (instead of scenario-baked text) and uses a deal-specific exit cap — fixing a clean deal that was wrongly marked FAIL.
* **Open evaluation harness (`npm run eval`):** scores the orchestrator on a benchmark of 8 synthetic deals (core-plus / value-add / distressed, with both determinable and narrative document-buried planted risks) against committed ground truth, and writes an honest trust report to `eval/results/{scorecard.json,TRUST-REPORT.md}`. An `npm run eval:offline` mode runs the no-API extraction + simulation layers. The report measures three non-equivalent layers — deterministic extraction, the simulation *fixture* (not reasoning), and live Codex agent reasoning — and reports where the system falls short.
* **Live narrative-risk proof + full 8/8 coverage:** at v2.8.0 release time, the live (Codex) layer was proven on the hard, document-buried deals — it genuinely flagged tenant concentration, insurance understatement, and missing Phase I that the deterministic fixture was structurally blind to. That historical run covered **all 8 deals** with narrative red-flag recall 100%, determinable financial 100%, dealbreaker recall 100%, and IC verdict 88% exact (7 of 8). The current mutable trust report is refreshed by later releases; see the latest changelog entry for current live-eval numbers.

### Bug Fixes

* **eval:** hardened the live-workpaper extractor — source EGI from the OpEx analyst; match values to labels on the same line only (a value never binds across a line break); prefer going-in metrics over pro-forma/stabilized/exit/interest-only variants; and parse `DSCR (amortizing): X`. Backed by a required machine-parseable agent `## Metrics` block (amortizing-basis DSCR) and a threshold-driven verdict rule. These lifted live determinable-financial accuracy and IC verdict to target.
* **eval:** the live-workpaper extractor preserves the negative sign on IRR / equity multiple, so a distressed deal's correctly-reported `-99.0% IRR / -2.38x EM` is no longer read as `+99% / +2.38` (fixed `ds-occupancy-collapse` model-dependent scoring 0% → 100%; regression test added).

## [2.7.0](https://github.com/ahacker-1/cre-acquisition-orchestrator/compare/v2.6.0...v2.7.0) (2026-05-21)

A completion pass that closes the README "known limits", implements the ROADMAP near-term
priorities (1–5), and reconciles documentation/claims with the codebase. The deterministic
offline demo remains the default; all changes are backward-compatible.

### Features

* **Document intelligence:** text-based PDF extraction via a local `pdfplumber` bridge (`scripts/parse_pdf.py`) with per-field confidence, page-level provenance, and candidate-review status; scanned/image-only PDFs are detected and flagged for OCR rather than silently skipped.
* **Excel parsing:** merged-cell handling (unmerge + forward-fill before header detection) and image-only workbook detection; additional messy rent-roll/T12 parser fixtures (currency symbols, subtotal/total rows, trailing notes, synonym headers).
* **Review-grade workpapers:** workpaper quality gates (cited inputs, assumptions, calculations, caveats, reviewer signoff) with a new `schemas/workpapers/quality-gate.schema.json`, per-phase evidence-completeness scoring, IC-package red-flag drilldowns back to the originating workpaper/source, and richer Markdown/JSON IC export with source drilldowns, reviewer signoff, and package version history.
* **Source review:** field-level decision audit trail (timestamped approve/reject/waive history with cross-document conflict blocking) and field-level provenance deep links from approved inputs to the source snippet/location.
* **Live Codex runtime hardening:** per-agent retry/backoff, partial-failure semantics with re-run-only-failed agents, secret redaction at the logging boundary, a committed redacted sample manifest, and a `schemas/codex/run-manifest.schema.json` contract. Operator-visible "retry failed agents" recovery in the dashboard.
* **Deployment:** single-operator self-host serve path (`scripts/serve-prod.mjs`, `npm run serve`) that serves the built dashboard and the loopback API/WS together (loopback-default; not multi-tenant), documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
* **Contributor experience:** end-to-end "add a new specialist agent" guide, a dashboard architecture map, and a `npm run release:check` readiness gate.

### Bug Fixes

* Corrected the README "Validation Gate" type-check commands (npm 11 swallowed `--noEmit`); added a cwd-correct `npm --prefix dashboard run typecheck` script.
* Registered the 4 document-ingestion roles and the `self-review-protocol` skill in `config/agent-registry.json` (now reports the full 31 roles / 8 skills).

### Documentation

* Scoped the "19-section prompt anatomy" claim to the 21 acquisition specialists (orchestrators and ingestion roles use their own templates); reconciled the dashboard view table and PDF/known-limits wording with the implementation.
* Updated "By the Numbers" to 31 roles / 8 skills / 27 schemas / 5 workflows / 20 fixtures / 8 test scripts; added the Evidence extraction-review screenshot to the demo tour.

## [2.6.0](https://github.com/ahacker-1/cre-acquisition-orchestrator/compare/v2.5.1...v2.6.0) (2026-05-19)


### Features

* generate practitioner-grade parkview workpapers ([6943392](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/69433925577afc0f34df8dd0baff2e770424194c))
* polish dashboard runtime boundaries ([36a3cc5](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/36a3cc50a8438fd7610a43f01c6d10dbbf342b9a))


### Bug Fixes

* align parkview demo with austin underwriting ([b813c74](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/b813c74279578440d44100fb198c7a333a7e4896))
* align underwriting taxonomy and thresholds ([c1deebe](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/c1deebea0dcf85ae91739e4871cb9e6a5b8729de))
* enforce parkview workpaper completeness ([5e22b9d](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/5e22b9db19f41e9ba3991f1ca19dd1b60aac2a6d))
* enforce strict schema contracts and canonical enums ([c48d230](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/c48d230d4ef95272b88ba1f7f1fce2f8f67a8eaf))
* harden local dashboard security ([419f7ea](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/419f7ea68b4c966c7e2d048535bec4b666b98142))
* reveal completed checkpoint workspaces ([7c1b9b9](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/7c1b9b938dd7072b7c1959d5390dca52f0dc6768))
* stabilize CI lock handling ([8052130](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/805213084fdf939338fd522ffe8a78176ecc91be))
* stabilize dashboard launch lifecycle ([4edd907](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/4edd90783525dba1a103b3fdbd20bf1285bf5cb0))
* stabilize fast checkpoint workspace reveal ([09496f4](https://github.com/ahacker-1/cre-acquisition-orchestrator/commit/09496f4aa83b702821010429b527ebc6ae1e1c28))

## [2.5.1] - Stale Source Evidence Gate

### Added

- Stale source evidence gate: workflow launches now surface stale source-evidence risk instead of allowing operators to proceed on outdated extracted values.
- Source readiness signal: the workspace carries source freshness into launch readiness so missing, stale, or unapproved evidence stays visible at the decision point.

### Changed

- Package baseline moved to `2.5.1`; current `main` builds on that tag with additional fixture and first-real-deal workflow work.

## [2.5.0] - Source-Backed Deal Intake

### Added

- Source-backed deal intake: XLSX/CSV rent rolls and T12s can become reviewable candidate deal fields with parser metadata, file hashes, confidence, and source-location provenance.
- Persisted extraction review: review-ready and applied document evidence can be reopened without re-running extraction.
- Approve and apply flow: underwriting-critical fields are selected, conflict-reviewed, and approved/applied explicitly before changing deal inputs.
- Release-grade parser coverage for XLSX parser fixtures, workspace review/apply persistence, and source-backed launch-readiness coverage.

### Changed

- v2.4's Acquisition Command, Swarm Goal Console, visible handoffs, workpapers, and IC package surfaces became the public demo shell around the new source-backed intake path.

## [2.4.0] - Agentic Deal Team Workspace

### Added

- Acquisition Command for package readiness, orchestration stage, team pulse, evidence state, and decision-package status.
- Mission intent persistence for acquisition goal, outcome intent, and recommended workflow.
- Visible `agent_message`, `agent_handoff`, `agent_review`, `agent_dependency`, and `phase_handoff` events.
- Deal Team view with human-readable team roles and active, filed, and queued status language.
- Workpapers and evidence as a first-class review surface tied to the IC package.

### Changed

- Completed sample runs now show the bundled evidence behind the package instead of implying live documents are missing.

## [2.3.0] - Operator Workbench

### Added

- Operator Briefing with best next move, source-backed input coverage, review queue, phase readiness, and workflow-level launch confidence.
- Deal Progression Guide with phase checklists, missing evidence, unlock logic, and recommended actions.
- Operator Command Bar with readiness state, blocker count, checklist progress, source-input coverage, and primary next action.
- Reliable upload queue with per-file upload status, progress, failed-file retry, and open-workspace path for partial success.
- Source-backed review with bulk selection of apply-ready fields and before/after deal-data changes before apply.
- IC Review Brief highlighting next decision, priority red flags, priority data gaps, and source-readiness warnings.
- Verified feature paths for dashboard-launched simulation runs and contract validation.

### Changed

- Embedded workflow launches stay scoped to the open deal instead of inheriting stale browser draft state from local storage.
- CSV/TXT/MD and supported XLSX rent-roll/T12 files remain source-backed extraction paths, while PDFs and unsupported workbook shapes are classified and routed for review.
- Chain verification, legacy CLIs, browser E2E startup, and Codex artifacts were hardened for the public release.

## Release Journey

This project has grown from agent architecture into a local-first acquisition workspace: first the orchestration catalog, then a usable dashboard, then live Codex-backed execution, then a document-first cockpit, then an operator workbench, then an agentic deal-team workspace, then source-backed deal intake, and now a first-real-deal workflow that makes uploaded rent rolls and T12s reviewable before they affect underwriting inputs.

| Release | What Changed | Full Notes |
|---------|--------------|------------|
| **v1.0.0 - Initial Public Release** | Published the first open-source CRE acquisition orchestration framework: markdown agents, phase orchestration, schemas, domain skills, deterministic simulation, and sample Parkview output. | [GitHub Release](https://github.com/ahacker-1/cre-acquisition-orchestrator/releases/tag/v1.0.0) |
| **v1.1.0 - Dashboard Deal Wizard** | Moved setup into the product with a guided New Deal Wizard, saved deal library, launch-ready deal flow, and Playwright coverage for key dashboard paths. | [RELEASE_NOTES_v1.1.0.md](RELEASE_NOTES_v1.1.0.md) |
| **v2.0.0 - Operator Deal Hub** | Turned the dashboard into a local-first acquisition cockpit with phase workspaces, document intake, source-backed inputs, outcome workflows, presets, and completion packages. | [RELEASE_NOTES_v2.0.0.md](RELEASE_NOTES_v2.0.0.md) |
| **v2.1.0 - Codex / ChatGPT Workflow Runtime** | Added the optional live-agent path: ChatGPT-authenticated Codex CLI execution, in-app login status, dashboard-launched Codex runs, and release-ready setup validation. | [RELEASE_NOTES_v2.1.0.md](RELEASE_NOTES_v2.1.0.md) |
| **v2.2.0 - Document-First Acquisition Cockpit** | Made the dashboard front door document-first with quick draft creation, upload-to-documents routing, compact recent deals, and a persistent cockpit sidebar. | [RELEASE_NOTES_v2.2.0.md](RELEASE_NOTES_v2.2.0.md) |
| **v2.3.0 - Operator Workbench** | Added guided deal progression, workflow readiness, upload queue recovery, source-backed change review, safer embedded launch scoping, IC review handoff, and verified public feature paths. | [RELEASE_NOTES_v2.3.0.md](RELEASE_NOTES_v2.3.0.md) |
| **v2.4.0 - Agentic Deal Team Workspace** | Reframed the dashboard around Acquisition Command, mission intent, visible agent handoffs, specialist team activity, workpapers/evidence, and IC package assembly. | [RELEASE_NOTES_v2.4.0.md](RELEASE_NOTES_v2.4.0.md) |
| **v2.5.0 - Source-Backed Deal Intake** | Turned XLSX/CSV rent rolls and T12s into persisted, reviewable, provenance-backed candidate fields operators can approve/apply before workflows use them. | [RELEASE_NOTES_v2.5.0.md](RELEASE_NOTES_v2.5.0.md) |
| **v2.5.1 - Stale Source Evidence Gate** | Added source-freshness protection to workflow launch readiness and bumped the package baseline to `2.5.1`. | [GitHub Tag](https://github.com/ahacker-1/cre-acquisition-orchestrator/tree/v2.5.1) |
| **v2.6.0 - Credibility and Infrastructure Hardening** | Aligns Parkview around Austin, replaces stub workpapers, enforces strict schemas/enums, hardens local security, documents APIs/events, and refreshes public repo infrastructure. | [RELEASE_NOTES_v2.6.0.md](RELEASE_NOTES_v2.6.0.md) |
