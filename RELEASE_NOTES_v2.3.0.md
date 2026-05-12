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
- Hardened dashboard simulation launches so both normal and fast modes use the workflow-aware orchestrator and run contract validation before the UI reports completion.
- Made document intake claims explicit: CSV, TXT, and Markdown files can produce source-backed extraction previews; PDF and XLSX files are stored, classified, routed, and marked extraction-pending.
- Tightened `verify-chain` so scoped workflows cannot pass as complete full acquisition chains.
- Updated legacy CLI helpers (`launch-deal`, `generate-checkpoint`, and `dry-run`) to accept current safe-slug deal IDs and emit checkpoint contracts compatible with current validation.
- Hardened browser E2E startup so stale project dashboard servers are cleared and unrelated port conflicts fail early instead of silently testing old code.
- Added release validation coverage for the Codex smoke path, full catalog dry-run, and live quick multi-agent workflow artifacts.
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

- CSV, TXT, and Markdown extraction produce source-backed previews.
- PDF files remain stored and classified for review with extraction pending.
- Excel files remain stored and classified with extraction pending; field mapping is still not enabled.
- Simulation remains the safe default runtime. Codex / ChatGPT remains opt-in.
- The guide is operational acquisition guidance, not legal, investment, or underwriting advice.

## Verified For Release

- `npm run setup -- --check --require-codex --skip-login`
- `npm --prefix dashboard run build`
- `npm run validate:guides`
- `npm run validate`
- `npm run test:e2e`
- `npm run demo`
- `node .\scripts\validate-contracts.js --deal-id parkview-2026-001`
- `node .\scripts\verify-chain.js --deal-id parkview-2026-001`
- `npm test`
- `node .\scripts\demo-replay.js --deal config\deal.json --scenario core-plus --seed 42`
- `node .\scripts\run-validation.js`
- `npm run codex:smoke`
- `npm run validate:codex`
- `node .\scripts\codex-agent-runner.js --workflow full-acquisition-review --dry-run --run-id codex-full-dry-run-v23 --concurrency 3`
- `node .\scripts\validate-contracts.js --codex-run-id codex-full-dry-run-v23`
- `npm run codex:run -- --run-id codex-quick-live-final`
- `node .\scripts\validate-contracts.js --codex-run-id codex-quick-live-final`
