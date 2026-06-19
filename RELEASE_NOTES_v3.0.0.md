# Release Notes v3.0.0 - Evidence-Grade Workbench

Released: 2026-06-19

v3.0.0 turns CRE Acquisition Orchestrator into a verified source-to-IC acquisition workbench. The big shift is trust: every important claim now has a clearer setup path, review boundary, evidence trail, dashboard proof surface, and one-command verification gate.

## Highlights

- **Fresh-clone reliability** - `npm run setup` prepares the dashboard and parser stack, including a repo-local `.venv` with `pandas`, `openpyxl`, and `pdfplumber`.
- **Evidence graph** - IC package JSON includes deterministic source document, approved field, workpaper, red-flag, data-gap, and package-section lineage. Markdown export includes an Evidence Chain section.
- **OCR-ready boundary** - scanned/image-only documents are flagged as OCR-ready with local bridge metadata and a next action, instead of silently implying extraction.
- **Legal diligence checklist candidates** - legal/closing Markdown or text checklists produce review-only `diligence.checklistItems` candidates with line provenance.
- **Proof-path dashboard** - Intake and IC Package views show the Source doc -> Approved field -> Agent workpaper -> IC package path, with honest pending/ready states.
- **Verified release gate** - `npm run verify:v3` proves release drift checks, root tests, parser/workspace/security coverage, dashboard typecheck/build, audits, offline eval, production smoke, and browser E2E.
- **CI gate** - GitHub Actions runs the full v3 verification path on pushes and PRs.

## Operator Impact

The product now feels less like a demo shell and more like a review-grade acquisition workbench:

1. Set up a fresh clone.
2. Drop source documents.
3. Review extracted or OCR-needed evidence honestly.
4. Approve fields before they affect underwriting inputs.
5. Let agents file workpapers.
6. Export an IC starter package with traceable evidence.
7. Run one command to prove the system still works.

## Verification

The release candidate was verified locally with:

```bash
npm run verify:v3
npm run test:security
npm run codex:status
```

The final `verify:v3` run passed with all 29 Playwright browser tests green.

## Notes

- The offline deterministic demo remains the default public path.
- Live Codex execution remains optional and requires local Codex/ChatGPT authentication.
- True OCR extraction is still intentionally not bundled as automatic extraction; v3.0.0 makes the OCR boundary explicit and review-gated.
