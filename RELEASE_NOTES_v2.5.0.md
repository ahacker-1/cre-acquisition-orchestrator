# v2.5.0 - Source-Backed Deal Intake

## What Changed

- Added a persisted source-backed extraction review flow for uploaded deal documents.
- XLSX rent rolls and T12 files now move from upload to parser-backed candidate fields, then operator review, then approved/applied deal inputs.
- Added a stored extraction preview endpoint so review-ready or applied documents can be reopened without re-running the parser.
- Improved the Documents/Evidence tab with explicit `Preview Extraction`, `Review Fields`, and `View Applied Evidence` actions.
- Field cards now show source provenance: parser ID/version, file hash, sheet/row/column or line/page, confidence, current value, and raw source snippet when available.
- Renamed the application step to `Approve & Apply Selected Fields` so underwriting-critical values are not presented as silent automation.
- Added service-level tests for persisted extraction retrieval, conflict-aware apply, approved-field provenance, applied review status, and source-backed launch-readiness coverage.
- Kept the offline demo path deterministic and credential-free while expanding validation to cover parser and workspace review/apply flows.

## Operator Impact

Operators can now use the workspace for a more realistic intake loop:

1. Upload a rent roll or T12.
2. Run local extraction.
3. Review candidate fields with source evidence.
4. Select fields to approve/apply.
5. See approved fields counted in source-backed launch readiness.

This is the core v2.5.0 product promise: **upload a real rent roll and T12, review extracted source-backed deal inputs, and approve them before the acquisition team uses them.**

## Honest Scope

- XLSX/CSV/TXT/Markdown extraction is local and deterministic.
- PDF/OCR extraction is still intentionally pending; PDF evidence is stored and marked for review rather than parsed with false confidence.
- Approval and application are combined in this release as `Approve & Apply`. A separate approve-only queue, reject/waive workflow, and richer review audit UI remain post-v2.5 follow-ups.
- Live Codex runtime support remains separate from the offline demo and source-backed intake flow.

## Verified For Release

Run before tagging:

```bash
git diff --check
npm run demo:verify
npm --prefix dashboard run test:e2e
npm --prefix dashboard audit --omit=dev --audit-level=high
```

`npm run demo:verify` includes parser fixtures, workspace review/apply tests, contract validation, system tests, operator guide validation, and dashboard production build.

## Release Tag

- Git tag: `v2.5.0`
- Release commit: tagged after PR/main CI pass
