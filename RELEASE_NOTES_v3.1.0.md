# Release Notes v3.1.0 - Local OCR Bridge

Released: 2026-06-19

v3.1.0 ships the working local OCR bridge for scanned/image-only PDFs. The system now moves readable scanned PDFs from "OCR-ready" to reviewable, source-backed candidate fields while keeping the operator approval gate intact.

## Highlights

- **Local scanned-PDF OCR** - pages render locally with PyMuPDF and run through `tesseract.js`; this repo does not send scanned PDFs to an external OCR service.
- **Review-backed candidates** - OCR-derived asking price, unit count, occupancy, and NOI include confidence, source hash, page provenance, raw snippets, parser metadata, and review status before they can change deal inputs.
- **Fail-soft behavior** - unreadable scans or scans without supported headline fields return explicit OCR metadata and warnings instead of guessed values.
- **Fresh-clone setup** - `npm run setup` now installs and verifies `PyMuPDF` alongside `pandas`, `openpyxl`, and `pdfplumber`.
- **OCR fixture** - `fixtures/parsers/scanned-offering-memo-ocr.pdf` proves a true image-only offering memo excerpt can extract through the local bridge.

## Operator Impact

The document intake path is more operational:

1. Drop a readable scanned offering memo PDF.
2. The parser detects the missing text layer.
3. The local OCR bridge renders and reads the pages.
4. Extracted values appear as candidate fields, not applied inputs.
5. The operator reviews confidence, page, raw snippet, warnings, and provenance before applying anything.

## Verification

The release candidate was verified locally with:

```powershell
npm run setup -- --skip-install --skip-codex-install --skip-login
npm run test:parsers
npm run test:pile
npm run test:workspace
npm run demo:verify
npm run verify:v3
```

The final `verify:v3` run passed with all 29 Playwright browser tests green.

## Notes

- OCR is local and review-gated.
- The bridge currently targets readable scanned PDFs and headline CRE fields.
- Remaining hardening targets include common image uploads, table-heavy scanned rent rolls, diligence checklists, and richer OCR region/bounding-box provenance.
