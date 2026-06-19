# Roadmap

This roadmap is intentionally public-facing: it shows where the project is going, what is safe for contributors to pick up, and where the current release is honest about its limits.

The north star is to make `cre-acquisition-orchestrator` the leading open-source AI-native workspace for multifamily acquisitions: source-document intake, mission intent, coordinated specialist agents, reviewable workpapers, and an investment committee package that a human operator can audit back to source evidence.

## Current Release Baseline

**v3.1.0 - Local OCR Bridge** is the current public release. It adds local scanned-PDF OCR with PyMuPDF and `tesseract.js`, review-gated OCR candidates, OCR fixture coverage, and setup/docs support on top of the `v3.0.0` evidence-grade workbench.

The stable baseline remains:

- **Local-first** — offline dashboard, deterministic Parkview sample, source-backed extraction, and IC package export require no API keys.
- **Review-first** — critical inputs do not silently change underwriting state; operators approve/apply, reject, or waive candidate fields before workflows use them.
- **Agent-visible** — 31 roles are represented as named orchestrators, specialists, and ingestion agents; the UI exposes handoffs, live/replayed work, workpapers, and package state.
- **Honest about limits** — readable scanned/image-only PDFs can run through a local review-gated OCR bridge, low-confidence or unsupported OCR stays pending, live Codex is optional, cloud multi-tenancy is out of scope, and all investment decisions require qualified human review.

Release-grade local validation for this baseline includes:

- `npm run demo`
- `npm run validate`
- `npm run validate:fixtures`
- `npm run validate:docs`
- `npm run validate:guides`
- `npm run test:parsers`
- `npm run test:workspace`
- `npm run test:pile`
- `npm run demo:verify`
- `npm --prefix dashboard run build`
- `npm --prefix dashboard run test:e2e`

## What Has Shipped

### v3.1.0 - Local OCR Bridge

- Added a local OCR bridge for readable scanned/image-only PDFs using PyMuPDF page rendering and `tesseract.js`, with review-gated candidate fields and page/confidence/raw-snippet provenance.
- Added an image-only scanned offering memo fixture that verifies asking price, unit count, occupancy, and NOI can extract through OCR without silently applying values.

### v3.0.0 — Evidence-Grade Workbench

- Added fresh-clone parser setup, OCR-ready metadata, legal checklist candidates, deterministic evidence graph lineage, proof-path dashboard UI, CI, and `verify:v3`.

### v2.8.5 — Deal Workspace Redesign

- Replaced the multi-tab dashboard with one persistent deal space: deal header, lifecycle spine, focused center stage, Live Feed / Your Team rail, and command bar.
- Made **New Deal** document-first: the front door and create flow now lead with dropping source files instead of manual data entry.
- Added summonable agent panels that show live/replayed reasoning, elapsed time, task echo, workpaper output, and follow-up tasking.
- Reduced first-run friction: less runtime chrome before a deal exists, clearer PDF expectations, and plainer create-step language.

### v2.8.0 — Drop-Flow Hardening + Honest Eval

- Hardened a deliberately messy real-world document pile: no silent skips, confident-wrong averages, parser hangs, or path-leaking errors.
- Added an open evaluation harness across 8 synthetic deals, including live Codex proof that narrative risks can be detected where the deterministic fixture is blind.
- Documented honest soft spots: model-dependent return assumptions and one borderline verdict oscillation.

### v2.7.0 and earlier — Completion + Source-Backed Foundation

- Added text-based PDF extraction, merged-cell workbook handling, image-only workbook detection, source-decision audit trail, review-grade workpaper gates, IC drilldowns, single-operator self-host serve path, and contributor documentation.
- Added XLSX/CSV rent-roll and T12 candidate extraction with confidence, provenance, warnings, persisted review/apply state, and launch-readiness source coverage.
- Hardened the public sample, schemas, enums, API/WebSocket docs, and local dashboard boundaries.

## Near-Term Priorities

### 1. Source-to-IC Public Proof

Goal: make a first-time visitor see how a value or red flag moves from source document to extraction review, approved evidence, specialist workpaper context, and available IC package references/export without needing a video.

Candidate issues:

- Keep `docs/DEMO-JOURNEY.md`, `docs/QUICK-DEMO.md`, and README aligned around the source-to-IC proof path.
- Extend the deterministic screenshot capture flow or manual screenshot checklist to show approved-field provenance and IC drilldowns when the current UI state supports it.
- Add a small sample package/export note that tells visitors exactly which field or red flag can be reviewed across the demo, with honest caveats where provenance is not yet exposed.

### 2. OCR Hardening for Scanned/Image-Only Documents

Goal: harden the new local OCR bridge beyond readable scanned PDFs into broader scanned offering memoranda, rent rolls, diligence checklists, and image files.

Candidate issues:

- Add OCR coverage for common image uploads and table-heavy scanned rent rolls.
- Preserve richer OCR provenance when available: bounding boxes, page/image regions, parser metadata, confidence, snippet context, and review status.
- Route ambiguous or low-confidence OCR values to candidate review with warnings instead of silently applying them.

### 3. Legal and Diligence Checklist Extraction

Goal: make the document-first workspace useful earlier in legal/diligence by extracting obligations, dates, missing items, responsible parties, and statuses from legal/diligence PDFs and Markdown/TXT checklists.

Candidate issues:

- Add fixtures for at least two checklist layouts.
- Preserve page/line/snippet provenance and review warnings.
- Wire approved checklist candidates into readiness, workpapers, or IC data gaps where appropriate.

### 4. Messy Parser Fixture Expansion

Goal: keep pushing source-backed intake toward the ugly files operators actually receive.

Candidate issues:

- Add more rent-roll/T12 variants: merged headers, trailing notes, owner-formatted tabs, hidden rows, subtotal traps, mixed date formats, and confusing occupancy conventions.
- Keep parser failures typed, reviewable, and non-blocking.
- Update docs when support boundaries change.

### 5. Contributor Experience for Product Extensions

Goal: make the repo easier to extend without forcing contributors to reverse-engineer the dashboard/runtime.

Candidate issues:

- Add `good first issue` labels for docs, parser fixtures, and screenshot/storyboard improvements.
- Keep the specialist-agent contributor guide and dashboard architecture docs linked from top-level contributor surfaces.
- Prefer product-proof and source-review improvements over release-plumbing tasks.

Approval-ready issue text for public follow-ups lives in [`docs/ISSUE-SEEDS.md`](docs/ISSUE-SEEDS.md).

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
