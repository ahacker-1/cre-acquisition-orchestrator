# Roadmap

This roadmap is intentionally public-facing: it shows where the project is going, what is safe for contributors to pick up, and where the current release is honest about its limits.

The north star is to make `cre-acquisition-orchestrator` the leading open-source AI-native workspace for multifamily acquisitions: source-document intake, mission intent, coordinated specialist agents, reviewable workpapers, and an investment committee package that a human operator can audit.

## Current Release Baseline

**v2.7.0 — Completion Pass** is the current public release. Building on the v2.6.0 credibility-hardening baseline, it implements the near-term priorities below and closes the prior known limits: text-based PDF extraction, merged-cell/image-only workbook handling, review-grade workpapers (quality gates, evidence completeness, red-flag drilldowns), live Codex runtime hardening, single-operator self-host deployment, and contributor tooling — while keeping the deterministic offline demo as the default.

Release-grade validation for this baseline includes:

- `npm run demo`
- `npm run validate`
- `npm run test:parsers`
- `npm run test:workspace`
- `npm run validate:guides`
- `npm test`
- `npm --prefix dashboard run build`
- `npm --prefix dashboard run test:e2e`
- `npm --prefix dashboard audit --omit=dev --audit-level=high`

Shipped in v2.6.0:

- Replaced thin Parkview sample artifacts with populated workpapers and stricter completeness checks.
- Added strict AJV schema validation, canonical shared enums, and per-agent schema coverage for critical specialist outputs.
- Hardened local dashboard boundaries around paths, uploads, watcher state, loopback assumptions, and CSV formula sanitization.
- Added API reference, WebSocket events documentation, agent catalog documentation, fixture validation, docs drift checks, and refreshed public screenshots.

## Near-Term Priorities

### 1. Source-Backed Document Intelligence

Goal: move from classified/stored files toward auditable extraction across the documents operators actually use.

Candidate issues:

- Continue expanding parser fixtures for messy real-world rent rolls, trailing-12s, and unit mixes.
- True OCR for scanned/image-only documents (these are currently detected and flagged for OCR, not extracted).

Shipped in v2.5.0:

- XLSX rent-roll and T12 uploads now route through the local Excel parser into source-backed candidate fields with document hash, parser metadata, sheet/row provenance, confidence, and operator-review status.
- Review-ready and applied documents can reopen persisted extraction previews without re-running the parser.
- The Documents tab exposes `Preview Extraction`, `Review Fields`, and `View Applied Evidence` actions.
- `npm run test:parsers` validates XLSX parser fixtures for rent roll and T12 field mapping.
- `npm run test:workspace` validates persisted extraction retrieval, conflict-aware approve/apply, approved-field provenance, and launch-readiness source coverage.
- Parser fixtures now cover alternate rent-roll headers, blank rows, total rows, common occupancy conventions, and multi-sheet T12 workbook selection while preserving candidate review warnings and field-level provenance.

Shipped on current main (completion pass):

- Text-based PDF extraction for offering memoranda / rent rolls via the local Python bridge (`scripts/parse_pdf.py`, pdfplumber): per-field confidence, page-level provenance, and candidate-review status; scanned/image-only PDFs are detected and flagged for OCR rather than silently skipped.
- Merged-cell workbook handling (unmerge + forward-fill before header detection) and image-only workbook detection (flagged needs-OCR), plus additional messy rent-roll/T12 fixtures (currency symbols, subtotal/total rows, trailing notes, synonym headers).
- Source-field decision audit trail: timestamped approve/reject/waive/needs-review history retrievable per field, with cross-document conflict blocking before apply.

### 2. Demo Journey and Public Proof

Goal: make a first-time GitHub visitor understand the workspace quickly and run a first real local source package in 10 minutes.

Candidate issues:

- Keep the Quick Demo path short, repeatable, credential-free, and centered on local source-backed deal intake.
- Extend the deterministic screenshot capture script to include the front door, quick-create modal, and source-backed extraction review panel.
- Rename the screenshot capture script to a version-neutral path.

Shipped through v2.6.0:

- Current workspace screenshots for Acquisition Command, Mission, Deal Team, Workpapers, and IC Package live under `docs/assets/`.
- `npm run screenshots` captures the core workspace gallery against a locally running dashboard.
- `docs/QUICK-DEMO.md` gives first-time visitors the shortest offline path from clone to local dashboard.
- `docs/FIRST-DEAL-GUIDE.md` now leads with local source package intake, extraction review, launch readiness, and Markdown/JSON IC starter export.
- `npm run demo:verify` runs the offline demo, contract checks, parser/workspace tests, guide validation, system tests, and dashboard build in one command.
- Mission includes a Swarm Goal Console that maps an operator goal to a recommended specialist swarm, blockers, handoffs, and next action.
- `docs/RUNTIME-COMPARISON.md` explains offline simulation vs. live Codex execution, including artifact paths, credential boundaries, and when each path is appropriate.

Approval-ready issue text for public follow-ups lives in [`docs/ISSUE-SEEDS.md`](docs/ISSUE-SEEDS.md).

### 3. Review-Grade Workpapers

Goal: make agent outputs feel like diligence workpapers, not generic AI summaries.

Candidate issues:

- Add workpaper quality gates for cited inputs, assumptions, calculations, caveats, and reviewer signoff.
- Add package-level evidence completeness scoring by phase.
- Add red-flag drilldowns from IC Package back to the originating specialist workpaper and source document.
- Extend the Markdown/JSON IC starter package with richer source drilldowns, reviewer signoff, and package version history.

### 4. Live Agent Runtime Hardening

Goal: keep the optional Codex/ChatGPT path useful while preserving the local deterministic demo as the default.

Candidate issues:

- Add live-runtime hardening around partial failures now that the offline-vs-live runtime comparison doc exists.
- Add per-agent Codex retry/backoff and operator-visible partial-failure recovery.
- Add stricter sandbox documentation and no-secret logging checks.
- Add sample live-run artifact manifests with sensitive fields redacted.

### 5. Open-Source Contributor Experience

Goal: make the repo easier to trust, extend, and discuss publicly.

Candidate issues:

- Add `good first issue` labels for docs, parser fixtures, and screenshot automation.
- Add a contributor guide section for creating a new specialist agent end-to-end.
- Add a dashboard architecture map for contributors who want to change the workspace UI.
- Add release checklist automation for version bumps, release notes, validation commands, screenshots, and tag readiness.

## Out of Scope for Now

These are valuable but should not distract from demo legibility and source-backed review quality:

- Production investment decisioning without qualified human review.
- External data-provider integrations that require paid credentials by default.
- Cloud-hosted multi-tenant deployment.
- Autonomous posting, outreach, or investor communications.
- Secret storage inside the repository.

## Suggested GitHub Topics

If updating repository metadata, use topics that match the current positioning:

`commercial-real-estate`, `cre`, `multifamily`, `proptech`, `ai-agents`, `multi-agent-systems`, `llm-orchestration`, `agentic-workflows`, `real-estate-tech`, `investment-analysis`, `due-diligence`, `react`, `typescript`, `open-source`
