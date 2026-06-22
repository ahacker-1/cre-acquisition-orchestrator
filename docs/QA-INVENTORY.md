# Production-Scale Local QA Inventory

Last reviewed: 2026-06-22

This inventory defines the finite user-facing surface covered by the local production-scale QA pass. The pass is local-only: it seeds sanitized data under `data/`, runs the dashboard against loopback services, and never uses production credentials, production data, or destructive actions.

## Local Data Acceptance

Command:

```powershell
npm run seed:prod-local -- --count 150
```

Acceptance criteria:

- Generates `QA-LOCAL-2026-*` deals only, with no production or personal data sources read.
- Writes complete workspace artifacts for each deal: `deal.json`, `meta.json`, `document-manifest.json`, `approved-fields.json`, `criteria.json`, `phase-state.json`, source documents, extraction JSON, run status, and completed-run reports where applicable.
- Validates every generated deal against `config/deal-schema.json`.
- Preserves source-backed provenance from document `sourceHash` to each approved field `sourceRef.fileHash`.
- Includes a realistic status mix across `PENDING`, `RUNNING`, `FAILED`, and `COMPLETE`.
- Keeps output inside the repository and rejects `--data-root` outside the repo.

Risk-based edge cases:

- Minimum and maximum count bounds: 1 and 500.
- Idempotent reseed with `--clean`.
- Sensitive-token scan across JSON, CSV, and Markdown generated artifacts.
- Windows path safety and absolute document paths consumed by the local watcher.
- Stale generated namespace cleanup without touching user-created data outside `QA-LOCAL-2026-*`.

## Routes And Top-Level States

There is one browser route, `/`, with state-driven views.

Acceptance criteria:

- Connected state shows when the watcher is reachable; disconnected state is visible when it is not.
- Front door opens for new-document intake, supports guided sample entry, and keeps local-first messaging.
- Manual workspace state renders the persistent lifecycle frame for a selected deal.
- Run-revealed workspace state can show an active or completed run without hiding manual deal navigation forever.
- Skeleton and error states are visible, recoverable, and do not trap the page.

Risk-based edge cases:

- Empty local data directory.
- Large generated library with 150 deals.
- Leftover completed run before opening a different saved deal.
- Server restart while the browser is open.
- Narrow/mobile viewport and desktop viewport.

## User-Facing Roles

Human roles:

- Local operator: can seed/open local deals, upload source documents, review extracted fields, run simulations, and export packages.
- Reviewer: can trace source-backed values and package evidence without using live credentials.
- Live Codex operator: can optionally choose Codex runtime and authenticate outside the default proof path.

AI roles visible in the app:

- Orchestrators: `master-orchestrator`, `due-diligence-orchestrator`, `underwriting-orchestrator`, `financing-orchestrator`, `legal-orchestrator`, `closing-orchestrator`.
- Ingestion: `document-orchestrator`, `rent-roll-parser`, `financials-parser`, `offering-memo-parser`.
- Due diligence: `rent-roll-analyst`, `tenant-credit`, `market-study`, `opex-analyst`, `physical-inspection`, `environmental-review`, `legal-title-review`.
- Underwriting: `financial-model-builder`, `scenario-analyst`, `ic-memo-writer`.
- Financing: `lender-outreach`, `quote-comparator`, `term-sheet-builder`.
- Legal: `psa-reviewer`, `title-survey-reviewer`, `estoppel-tracker`, `insurance-coordinator`, `loan-doc-reviewer`, `transfer-doc-preparer`.
- Closing: `closing-coordinator`, `funds-flow-manager`.

Acceptance criteria:

- Intake always shows the ingestion crew.
- Each lifecycle phase shows the expected staffed specialists.
- Agent panels show status, stream lines, output/workpaper links when present, and safe disabled live follow-up behavior in simulation mode.

Risk-based edge cases:

- Agent checkpoint missing for a staffed role.
- Failed agent in partial run recovery.
- Command bar opens a single targeted agent panel.
- Summon/advanced controls do not require live credentials in simulation mode.

## Header Buttons

Buttons:

- `Advanced` opens the workflow launcher modal.
- `New Deal` opens the document-first front door.
- `Deals` opens the deal library.
- `Start Guided Demo` appears when a workspace is open.

Acceptance criteria:

- Each button is keyboard/click reachable, has stable visible text, and opens the intended surface.
- Modals/drawers can be dismissed without losing the current deal state.
- Header text wraps without overlap on small viewports.

Risk-based edge cases:

- Open a modal while a manual workspace is active.
- Open a modal with a completed run visible.
- Close with button and Escape where supported.
- Reopen after a failed network request.

## Modals And Drawers

Surfaces:

- Deal library modal.
- Workflow launcher modal.
- Quick deal create modal.
- Edit/intake wizard modal.
- Agent panel drawer.
- Advanced drawer.
- Guided demo overlay.

Acceptance criteria:

- Each surface has a clear close path.
- Dialog-like surfaces expose dialog semantics where implemented and do not leave body scroll locked after close.
- Inputs preserve or intentionally reset state.
- Errors are displayed inline and leave retry paths available.

Risk-based edge cases:

- Deal library at 150 saved deals.
- Workflow launcher with zero deals, one deal, and many deals.
- Quick-create with unsupported files, parse failures, and open-anyway path.
- Advanced drawer opened from a lifecycle stage and from a workflow suggestion.

## Inputs And Controls

Inputs:

- File inputs for source document upload and quick deal creation.
- Deal selector, workflow selector, runtime provider, scenario, speed, mode, Codex agent limit, Codex concurrency, source-backed-input toggle, preset name.
- Criteria scenario and target fields.
- Uploaded field search.
- Extraction review note and conflict confirmation.
- Command bar input.
- Agent follow-up input.
- Guide checklist notes.

Acceptance criteria:

- Each input accepts valid local values, rejects or safely gates invalid values, and preserves source-backed review semantics.
- Numeric inputs do not produce invalid deal JSON.
- Search/filter inputs update visible results without blanking the whole page.
- Disabled live-agent controls explain or visibly signal unavailable state.

Risk-based edge cases:

- Empty strings, very long strings, currency-like values, percentages, and decimal values.
- Required source-backed inputs missing.
- Codex selected without authenticated status.
- Concurrent saving/extracting state disables destructive duplicate submissions.

## Workspace Features

Features:

- Lifecycle spine: Intake, Diligence, Underwriting, Financing, Legal, Closing, IC.
- Intake source documents, extraction preview, uploaded data inspector, approval/waiver/rejection actions, and source drilldowns.
- Criteria panel and save action.
- Progression guide checklists, notes, complete, waive, reopen.
- Stage workflow launch controls and phase agent cards.
- Operator briefing, next action, source-backed input score, and workflow readiness cards.
- Partial failure recovery.
- Live feed, team rail, and command bar.
- Advanced drawer: mission control, current spec, workflow launcher, deal team, workpapers, progression guide, event log.
- IC package: phase outcomes, source-backed input summary, review brief, red flag drilldowns, Markdown export, JSON export.

Acceptance criteria:

- A seeded complete deal can be opened from the library and navigated across all seven stages.
- Applied source documents can be reviewed, searched, and traced to file hashes and source locations.
- Workflow readiness reports no missing approved fields for generated deals.
- Package export produces a success message and writes local artifacts.
- No uncaught browser errors or console errors appear during the production-scale path.

Risk-based edge cases:

- Applied, review-ready, missing, parser-failed, waived, and rejected document states.
- Source hash mismatch or stale source document.
- Completed package with no red flags, multiple red flags, and missing workpaper origin.
- Failed run with retryable failed agents.
- Large uploaded-data inspector preview with truncated rows.

## Workflows

Launchable workflows:

- `full-acquisition-review`
- `quick-deal-screen`
- `underwriting-refresh`
- `financing-package`
- `legal-psa-review`

Acceptance criteria:

- Workflow launcher lists all five workflows.
- Each workflow can be selected with scenario, speed, mode, runtime provider, source-backed-input requirement, and optional preset save.
- Simulation launches stay local and do not require external auth.
- Codex launches remain opt-in and visibly gated by auth/status.

Risk-based edge cases:

- Launch with no deal selected.
- Launch with source-backed-input requirement and missing approved fields.
- Launch while a run is already active.
- Save preset with empty or duplicate names.
- Runtime provider switches between simulation and Codex without leaking credentials.

## Regression Commands

Focused local-data gate:

```powershell
npm run test:prod-local-data
```

Browser inventory gate:

```powershell
npm --prefix dashboard run test:e2e -- production-scale-inventory.spec.ts
```

Release-adjacent gates used for this pass:

```powershell
npm run validate:docs
npm run validate:guides
npm --prefix dashboard run typecheck
```
