# Changelog

All notable changes to this project are documented here.

This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/) and uses semantic versioning for tagged public releases.

## [2.8.0](https://github.com/ahacker-1/cre-acquisition-orchestrator/compare/v2.7.0...v2.8.0) (2026-05-25)

Two themes: hardening the real-world document-drop journey, and shipping an honest open
evaluation harness that proves the live agents detect document-buried ("narrative") risks the
deterministic demo is blind to. The offline demo remains the default; all changes are
backward-compatible.

### Features

* **Real-world drop-flow hardening:** a messy real-world pile (T12s, rent rolls, offering memos, plus junk files) now flows through classify → extract → review → workflow → export with no crashes, silent skips, or confidently-wrong numbers. Vacant `$0` rent rows no longer deflate in-place rent averages (Excel and CSV paths); rent roll vs T12 is classified by document content, not just filename; oversized CSVs and corrupt/unreadable workbooks degrade to a graceful `parse_failed` (no hangs); local filesystem paths are redacted from parser errors; and Python-interpreter selection falls back resiliently. An automated smoke test (`npm run test:pile`) drives the nasty pile through the real parser and asserts a typed per-file outcome.
* **Threshold-driven IC verdict:** the deterministic engine now consults `config/thresholds.json` for dealbreakers (instead of scenario-baked text) and uses a deal-specific exit cap — fixing a clean deal that was wrongly marked FAIL.
* **Open evaluation harness (`npm run eval`):** scores the orchestrator on a benchmark of 8 synthetic deals (core-plus / value-add / distressed, with both determinable and narrative document-buried planted risks) against committed ground truth, and writes an honest trust report to `eval/results/{scorecard.json,TRUST-REPORT.md}`. An `npm run eval:offline` mode runs the no-API extraction + simulation layers. The report measures three non-equivalent layers — deterministic extraction, the simulation *fixture* (not reasoning), and live Codex agent reasoning — and reports where the system falls short.
* **Live narrative-risk proof:** the live (Codex) layer is proven on the hard, document-buried deals — it genuinely flags tenant concentration, insurance understatement, and missing Phase I that the deterministic fixture is structurally blind to. Offline scores all 8 deals; live covers a representative 6-deal subset: **live narrative red-flag recall 100%, IC verdict 100% exact (n=6), determinable financial 96%**. The remaining honest soft spot is model-dependent returns (IRR / equity multiple) at ~50%. Nothing was tuned to flatter; ground truth is fixed and committed. See [eval/results/TRUST-REPORT.md](eval/results/TRUST-REPORT.md).

### Bug Fixes

* **eval:** hardened the live-workpaper extractor — source EGI from the OpEx analyst; match values to labels on the same line only (a value never binds across a line break); prefer going-in metrics over pro-forma/stabilized/exit/interest-only variants; and parse `DSCR (amortizing): X`. Backed by a required machine-parseable agent `## Metrics` block (amortizing-basis DSCR) and a threshold-driven verdict rule. These lifted live determinable-financial accuracy and IC verdict to target.

## [Unreleased]

### Real-world drop-flow hardening

Hardening pass focused on the offline document-drop journey so a messy real-world pile (T12s, rent
rolls, offering memos, plus junk files) flows through classify → extract → review → workflow →
export with no crashes, silent skips, or confidently-wrong numbers.

* **Parser confident-wrong fix:** vacant `$0` rent rows no longer deflate in-place rent averages — a vacant unit contributes its market rent to GPR but `$0` to in-place rent instead of dragging the average down. Applied to both the Excel and CSV parsing paths.
* **Parser robustness:** CSV inputs over the size cap now degrade to a graceful `parse_failed` status instead of hanging or crashing; corrupt/unreadable workbooks return `parse_failed` (rather than the misleading `parser-unavailable`); local filesystem paths are redacted from parser error messages; and the Python-interpreter selection is now resilient (falls back across available interpreters instead of failing when one is missing).
* **Content-aware document classification:** rent roll vs T12 is now classified by document content (not just filename), preventing a mislabeled file from being silently routed to the wrong parser and losing data.
* **Threshold-driven IC verdict:** the deterministic engine now consults `config/thresholds.json` for dealbreakers when forming the IC verdict (instead of relying on scenario-baked text), and uses a deal-specific exit cap. This fixed a clean deal being wrongly marked FAIL.
* **Real-world pile smoke test:** an automated test (`npm run test:pile`) drives a deliberately nasty pile of files through the real parser and asserts a typed per-file outcome — every file is classified and stored, parseable files extract with provenance, and unparseable/irrelevant files are flagged gracefully.
* **Eval benchmark trimmed:** the benchmark is now 3 representative deals (one per archetype: `cp-stabilized-clean`, `va-overlevered-ltv`, `ds-occupancy-collapse`); the other archetype specs remain defined in `eval/generators/generate_deals.py` for extension. Added an `npm run eval:offline` mode that runs the offline (extraction + simulation) layers without the live agents.

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
