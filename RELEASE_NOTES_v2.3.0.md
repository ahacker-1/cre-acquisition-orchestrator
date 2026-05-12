# v2.3.0 - Operator Workbench

This release turns the document-first cockpit into a more dependable operator workbench. The goal is not a prettier demo screen; it is a clearer path from source documents to launch confidence to a reviewable acquisition package.

## What Changed

- Added workflow-level launch readiness to the deal workspace payload so the dashboard can explain whether each outcome workflow is ready, warning-level, or blocked.
- Added a canonical `config/operator-guides.json` progression guide that defines phase checklists, evidence requirements, helper copy, recommended actions, and workflow mappings outside the React UI.
- Added a first-class Deal Progression Guide tab and persistent Operator Command Bar so the workspace now shows what is missing, why it matters, what it unlocks, and the next action before the operator launches a workflow.
- Added an Operator Briefing on the workspace overview with the best next move, source-backed input coverage, review queue count, phase readiness, and per-workflow readiness cards.
- Added launch-readiness context to the persistent cockpit sidebar and embedded Workflow Launcher.
- Fixed embedded Workflow Launcher scoping so a workspace launch cannot silently inherit a different deal from local browser storage, saved presets, or a stale draft.
- Moved workflow source-field requirements into the workflow catalog and tightened readiness so approved fields only count when their source document, parser evidence, and file hash are still current.
- Added a quick-create upload queue with per-file status, progress, stale deal-ID recovery, partial-failure recovery, failed-file retry, and an open-workspace path for successful partial uploads.
- Improved extraction review with bulk selection of apply-ready fields and a before/after deal-data change summary before applying source-backed inputs.
- Added an IC Review Brief to the Completion Package with the next decision, priority red flags, priority data gaps, and source-readiness warnings.
- Tightened the header layout for narrow viewports so the operator controls wrap instead of forcing document-level horizontal overflow.

## Operator Impact

- First-time users get clearer feedback while uploaded files are being saved.
- Analysts can recover from one failed document without losing the draft deal or successful uploads.
- Operators get a checklist-driven deal path from intake through underwriting, diligence, financing, legal, closing, and package review.
- Manual checklist completion and waive/defer notes persist per deal while still separating source-backed evidence from operator judgment.
- Operators can see why a workflow is ready or warning-level before launch.
- Workspace launches are harder to misfire because the embedded launcher stays pinned to the open deal and blocks source-gated runs with stale or missing evidence.
- Package review is more useful for investment committee handoff because it now separates final recommendation, next decision, red flags, data gaps, and source-confidence warnings.

## Honest Scope

- CSV, TXT, and Markdown extraction behavior is unchanged.
- PDF files remain stored for review.
- Excel files remain stored and classified; field mapping is still not enabled.
- Simulation remains the safe default runtime. Codex / ChatGPT remains opt-in.
- The guide is operational acquisition guidance, not legal, investment, or underwriting advice.

## Verified For Release

- `npm --prefix dashboard run build`
- `npm run validate:guides`
- `npm run test:e2e`
- `npm run demo`
- `node .\scripts\validate-contracts.js --deal-id parkview-2026-001`
