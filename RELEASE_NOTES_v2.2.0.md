# v2.2.0 - Document-First Acquisition Cockpit

This release makes the dashboard feel like an acquisition cockpit from the first screen. New users no longer have to complete the full deal wizard before uploading source materials. They can drop documents first, name the deal, and land directly in the Documents workspace.

## What Changed

- Added a document-first dashboard homepage with a large drop zone for rent rolls, T12s, offering memoranda, LOIs, PSAs, title, insurance, and lender files.
- Added a quick draft creation flow: selected files open a one-field deal-name modal, save a draft deal, upload the files, and route to the Documents tab.
- Added a shared frontend document upload helper so homepage uploads and workspace uploads use the same local API contract.
- Added a responsive Deal Cockpit Sidebar inside the existing workspace. It shows required document coverage, one next action, and phase readiness without replacing the 8-tab Operator Deal Hub.
- Added a compact Recent Deals strip for the homepage while preserving the full Deal Library modal and existing selectors.
- Kept the New Deal wizard intact for detailed setup and editing.

## Honest Document Scope

- CSV, TXT, and Markdown files can extract locally through the existing parser flow.
- PDFs are stored and classified with extraction marked pending.
- Excel files are stored and classified, but source-backed field mapping is not enabled in this release.
- No backend ingestion, OCR, parser-service, or Codex extraction contract changed in this release.

## Open-Source Readiness

- Existing header CTA selectors and workspace/test selectors are preserved for downstream contributors.
- The quick-create modal includes dialog semantics, focus containment, Escape handling, retry-safe file selection, and inline error handling.
- Document uploads retry transient Windows/OneDrive manifest rename locks without changing the API contract.
- E2E coverage now verifies the document-first flow, compact recent deals, cockpit sidebar navigation/status, PDF/XLSX status honesty, and existing wizard/library/workflow paths.

## Verified For Release

- `npm --prefix dashboard run build`
- `npm run test:e2e`

The E2E suite currently covers 12 Chromium tests and passed cleanly on Windows.
