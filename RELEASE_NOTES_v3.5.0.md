# Release Notes v3.5.0 - Architectural Graphite + Trust-Boundary Hardening

Released: 2026-07-15

v3.5.0 gives the CRE Acquisition Orchestrator a complete institutional-grade product facelift while tightening every local file boundary identified after v3.4.0. The new Architectural Graphite system carries a quieter, decision-first hierarchy from the document front door through Intake, phase work, specialist handoffs, and the IC package. The release also closes seven path-containment gaps across saved deals, workflow configuration, ingestion, live-run artifacts, and Codex inputs.

## Highlights

- **Architectural Graphite design system** - replaces the prior dense card treatment with full-bleed graphite surfaces, editorial Playfair Display hierarchy, Inter interface typography, restrained copper actions, hairline structure, and semantic color reserved for evidence state.
- **Decision-first deal workspace** - reorganizes every phase around verdict, progress, next action, findings, red flags, and agent activity while preserving the persistent lifecycle spine and live context rail.
- **End-to-end surface consistency** - carries the same system through the upload-first front door, Intake Deal Record, saved-deal library, deal editor, Advanced Workflow Launcher, specialist panel, reports, findings, error states, and completion package.
- **Seven hardened local trust boundaries** - validates deal IDs, preset IDs, scenario names, ingestion IDs, StoryEngine runtime IDs, Codex legal prompt paths, and direct Codex runner input paths before they can escape their intended repository directories.
- **Current public visual proof** - refreshes all seven README screenshots from the live facelift, including real XLSX extraction, source-row inspection, a populated phase brief, specialist workpaper handoff, IC package, and authenticated Codex launch review.

## Product Experience

- Rebuilds the front door around one clear source-package action, Guided Demo, and a quieter Recent Deals continuation path.
- Gives the persistent workspace an institutional three-part composition: lifecycle spine, focused decision surface, and live team/context rail.
- Makes Intake visibly source-backed with the four-step Source doc -> Approved field -> Agent workpaper -> IC package proof path, an auto-filled Deal Record, provenance tags, confidence state, and the explicit `Looks right -> start Diligence` action.
- Reworks phase detail into a ranked decision brief with an immediately visible verdict, completion state, next action, key findings, red flags, and agent progress.
- Reframes specialist handoffs as a dedicated agent workspace with timeline, verdict, caveats, filed workpaper, and follow-up command.
- Rebuilds the IC package around recommendation, package progress, phase outcomes, red flags, data gaps, source readiness, exports, and review handoff.
- Preserves the operational contract: source-backed evidence, saved-deal actions, active-run Stop controls, workflow launches, agent drilldowns, exports, keyboard behavior, and accessibility semantics.
- Adds Tabler line icons and removes the remaining handcrafted interface SVGs.
- Tightens desktop, tablet, and mobile behavior, including the narrow-workspace grid, full-width mobile utility dock, sticky context rail, and command-composer safe space.

## Runtime + Security Hardening

- Rejects unsafe deal IDs before deal-library reads, writes, renames, sample lookup, launch metadata, or status paths are constructed.
- Validates workflow preset IDs and keeps writes anchored to the requested safe ID even when stored preset JSON is malformed.
- Rejects path-shaped scenario names before shared runtime config reads or dashboard child-process launch.
- Rejects unsafe ingest deal IDs before incoming or normalized-output directories are created.
- Keeps legal-document prompt files repo-contained; outside text sources are omitted while safe extraction JSON remains available to Codex.
- Validates StoryEngine deal IDs before creating event, document, manifest, status, or report directories.
- Rejects direct Codex runner `--deal` and `--input-snapshot` paths that resolve outside the repository before authentication checks or file reads begin.
- Adds focused regressions for each trust boundary while preserving valid existing slug-style IDs and repo-relative paths.

## Documentation + Design Proof

- Adds the selected Architectural Graphite reference, design-system inventory, baseline captures, concept explorations, before/after comparisons, desktop states, mobile states, and same-state reference comparison under `audit-artifacts/luxury-facelift-2026-07-15/`.
- Adds `design-qa.md` with the reference state, viewport evidence, iteration history, intentional deviations, and final verification record.
- Refreshes the README Visual Demo Tour with seven current screenshots and accurate state-specific alt text.
- Documents the source-backed Intake proof using a real `rent-roll-basic.xlsx` extraction: 3 units, 66.7% occupancy, Market Rent selected, and source row 3 inspected.
- Updates `SECURITY.md` so the supported-version table reflects the 3.5.x release line.

## Verification

The release was verified with:

- `npm run verify:v3`
- `npm run release:check`
- `npm run validate:docs`
- `npm run validate:guides`
- `npm test`
- `npm run test:parsers`
- `npm run test:workspace`
- `npm --prefix dashboard run typecheck`
- `npm --prefix dashboard run build`
- `npm audit --audit-level=moderate`
- `npm --prefix dashboard audit --audit-level=moderate`
- `node eval/run-eval.mjs --mode offline --no-update-results`
- `node scripts/serve-prod.mjs --smoke`
- 42 Playwright browser tests, including the mobile guided-workspace smoke and automated WCAG A/AA checks
- final browser interaction, console, and independent code/visual audits with no remaining P0/P1 findings

## Safety Notes

- Live Codex runs still send selected prompts and approved deal context through the user's authenticated Codex CLI / ChatGPT session. Do not use live workflows with confidential deal data unless that data is approved for that environment.
- The deterministic Simulation runtime remains the no-credential fallback for demos, screenshots, and CI-safe validation.
- The facelift changes presentation and interaction hierarchy; it does not weaken source-review gates, provenance, schemas, or operator approval boundaries.
