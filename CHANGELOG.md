# Changelog

All notable changes to this project are documented here.

This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/) and uses semantic versioning for tagged public releases.

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

## [Unreleased]

### Added

- First real-deal upload workflow: the first screen centers the upload package path, with a persistent way back to upload from an open workspace.
- Messy fixture package: `fixtures/first-real-deal` and XLSX parser fixtures model alternate headers, totals rows, blank rows, occupancy conventions, messy rent rolls, and multi-sheet T12s.
- IC starter export: operators can export a source-aware Markdown/JSON package from the workspace after review.
- Verification coverage for parser, workspace, dashboard build, and browser E2E checks covering the first-real-deal path and source-backed review/apply loop.

### Changed

- Workspace navigation, mobile tabs, document polling, and transient local file reads were tightened after real-user UI walkthroughs.

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
| **Current main - First Real Deal Workflow** | Adds the curated first-real-deal fixture package, broader messy XLSX parser coverage, IC starter export, UI walkthrough hardening, and source-backed browser E2E coverage. | [Latest main](https://github.com/ahacker-1/cre-acquisition-orchestrator) |
