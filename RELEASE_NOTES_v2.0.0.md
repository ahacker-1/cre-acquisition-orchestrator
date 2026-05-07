# v2.0.0 - Operator Deal Hub

This release moves the project from a monitoring dashboard toward a local-first CRE acquisition portal. Operators can now create or open a deal workspace, upload source documents, approve extracted assumptions, launch outcome-specific workflows, and review a completion package without leaving the app.

## Highlights

- Added the Operator Deal Hub with Overview, Underwriting, Due Diligence, Financing, Legal, Closing, Documents, and Package workspaces.
- Added five built-in outcome workflows:
  - `full-acquisition-review`
  - `quick-deal-screen`
  - `underwriting-refresh`
  - `financing-package`
  - `legal-psa-review`
- Added saved local workflow presets under `data/workflow-presets/`.
- Added dashboard workflow launch APIs and `scripts/orchestrate.js --workflow`.
- Added skipped-phase accounting so scoped workflows show non-selected phases as `SKIPPED` instead of omitting them.
- Added local source-document upload, classification, extraction preview, and apply-to-deal flows.
- Added source-backed input snapshots to workflow launches and completion-package reporting.
- Added a completion package view with phase outcomes, workpapers, findings, decision log, document manifest, source-backed input coverage, and final recommendation.
- Hardened local upload APIs with request-size limits, localhost-only browser origins, malformed content rejection, atomic manifest writes, and safer document IDs.

## Document Intake

- CSV/TXT/MD rent rolls, T12s, and offering memos can be parsed into operator-reviewable fields.
- PDF/XLSX files are accepted, stored, classified, and marked extraction pending for this milestone.
- Approved fields are written with parser-issued field IDs and source references before deal inputs are updated.
- Deal-specific runtime data is stored under `data/deals/{dealId}/` and ignored by git.

## Included Dashboard Flows

- Create or reopen a deal workspace.
- Edit underwriting criteria.
- Navigate phase workspaces and Agent Playbooks.
- Upload local source documents.
- Extract CSV rent roll and T12 data.
- Approve selected extraction fields and update deal inputs.
- Launch a scoped phase workflow or full acquisition review.
- Save and reuse workflow presets.
- Review skipped phases and completion packages after a scoped run.

## Verification

- `npm test`
- `node scripts\validate-contracts.js --deal-id parkview-2026-001`
- `cd dashboard && npm run build`
- `cd dashboard && npm run test:e2e`
- `cd dashboard && npm audit --omit=dev`
- Browser smoke at `http://localhost:5173/`

## Notes

- The default runtime remains local deterministic simulation and does not require API keys.
- Existing sample/demo flows remain available.
- Existing `/api/deals/:id/launch` behavior is preserved by mapping it to `full-acquisition-review`.
- This is an additive release. No migration is required for the shipped sample deal.
