# Roadmap

This roadmap is intentionally public-facing: it shows where the project is going, what is safe for contributors to pick up, and where the current release is honest about its limits.

The north star is to make `cre-acquisition-orchestrator` the leading open-source AI-native workspace for multifamily acquisitions: source-document intake, mission intent, coordinated specialist agents, reviewable workpapers, and an investment committee package that a human operator can audit.

## Current Release Baseline

**v2.4.0 — Agentic Deal Team Workspace** is the current public release. It made the first-time product journey legible: drop documents, state the goal, watch the specialist deal team coordinate, review workpapers, and assemble the IC package.

Release-grade validation for the baseline includes:

- `npm run demo`
- `npm run validate`
- `npm run validate:guides`
- `npm test`
- `npm --prefix dashboard run build`
- `npm --prefix dashboard run test:e2e`
- `npm --prefix dashboard audit --omit=dev --audit-level=high`

## Near-Term Priorities

### 1. Demo Journey and Public Proof

Goal: make a first-time GitHub visitor understand the product in under two minutes and run it locally in under five.

Candidate issues:

- Keep the Quick Demo path short, repeatable, and credential-free as the default public proof point.
- Add a short guided demo script that maps each screenshot to the operator action it proves.
- Extend the deterministic screenshot capture script to include the front door and quick-create modal, not just the completed workspace surfaces.

Already shipped after v2.4.0:

- Current v2.4 screenshots for Acquisition Command, Mission, Deal Team, Workpapers, and IC Package live under `docs/assets/`.
- `npm run screenshots` captures the core v2.4 workspace gallery against a locally running dashboard.
- `docs/QUICK-DEMO.md` gives first-time visitors the shortest offline path from clone to local dashboard.
- `npm run demo:verify` runs the offline demo, contract checks, guide validation, system tests, and dashboard build in one command.

Approval-ready issue text for the first public follow-ups lives in [`docs/ISSUE-SEEDS.md`](docs/ISSUE-SEEDS.md).

### 2. Source-Backed Document Intelligence

Goal: move from classified/stored files toward auditable extraction across the documents operators actually use.

Candidate issues:

- Add source-backed XLSX rent-roll and T12 extraction.
- Add PDF text extraction for offering memoranda and legal checklists with explicit confidence and pending-review states.
- Add field-level provenance links from approved inputs to source document snippets.
- Expand parser fixtures for messy real-world rent rolls, trailing-12s, and unit mixes.

### 3. Review-Grade Workpapers

Goal: make agent outputs feel like diligence workpapers, not generic AI summaries.

Candidate issues:

- Add workpaper quality gates for cited inputs, assumptions, calculations, caveats, and reviewer signoff.
- Add package-level evidence completeness scoring by phase.
- Add red-flag drilldowns from IC Package back to the originating specialist workpaper and source document.
- Add exportable markdown/JSON package manifest for investment committee review.

### 4. Live Agent Runtime Hardening

Goal: keep the optional Codex/ChatGPT path useful while preserving the local deterministic demo as the default.

Candidate issues:

- Add clearer runtime comparison docs: offline simulation vs. live Codex execution.
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
