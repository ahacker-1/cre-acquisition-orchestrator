# Public Issue Seeds

Use these as approval-ready GitHub issues after v3.1.0. They are intentionally scoped to make the project more legible, impressive, and contributor-friendly for first-time visitors — especially around source-backed deal intake, reviewable workpapers, and the source-to-IC proof path.

Do not create these issues automatically from automation. Review the text, adjust labels/milestones, then publish from the GitHub UI or `gh issue create` when ready. If using the CLI snippets below, save each issue body to the referenced `/tmp/*.md` file first.

## Recommended Labels

- `enhancement`
- `documentation`
- `good first issue`
- `dashboard`
- `demo`
- `validation`

## Shipped through v3.1.0

- `docs/QUICK-DEMO.md` gives first-time visitors a local path from clone to the current deal-space dashboard.
- `docs/DEMO-JOURNEY.md` documents the no-video guided demo and the source-to-IC proof path.
- `docs/PROOF-PATH.md` and `npm run proof` provide the fastest local proof path from source document to uploaded data inspector to extraction review to IC package.
- `docs/RUNTIME-COMPARISON.md` documents the offline demo vs live Codex split, artifact paths, and no-secret/data-sharing boundaries.
- XLSX/CSV/TXT/MD and text-based PDF sources can produce reviewable candidate fields with provenance, confidence, warnings, approval state, and applied-evidence links.
- Readable scanned/image-only PDFs can run through the local OCR bridge with review-gated candidate fields rather than silently guessed deal inputs.
- Parser fixtures cover alternate rent-roll headers, blank rows, total/subtotal rows, common occupancy conventions, multi-sheet T12 selection, merged cells, synonym headers, trailing notes, currency symbols, and image-only workbook detection.
- v2.8.0 hardened a messy real-world document pile and added an honest 8-deal evaluation harness.
- v2.8.5 redesigned the dashboard into one persistent deal space: document-first front door, auto-filling Intake, lifecycle spine, Live Feed / Your Team rail, command bar, summonable agent panels, and IC package view.
- v3.0.0 added fresh-clone parser setup, OCR-ready metadata, legal checklist candidates, deterministic evidence graph lineage, proof-path dashboard UI, CI, and the `npm run verify:v3` release gate.
- v3.1.0 added local scanned-PDF OCR with PyMuPDF and `tesseract.js`, review-gated OCR candidates, OCR fixture coverage, and setup/docs support.

## 1. Add public source-to-IC proof path to the demo journey

Status: shipped locally. Keep this issue seed only if you want a follow-up GitHub issue for richer screenshots, a Loom/GIF, or deeper drilldowns beyond the current `npm run proof` + `docs/PROOF-PATH.md` path.

Suggested labels: `demo`, `dashboard`, `documentation`, `good first issue`

```bash
gh issue create \
  --title "Add public source-to-IC proof path to the demo journey" \
  --label demo --label dashboard --label documentation --label "good first issue" \
  --body-file /tmp/cre-source-to-ic-proof-path.md
```

Issue body:

```markdown
## Goal

Make the source-backed acquisition story obvious to a first-time GitHub visitor without requiring a video: source document -> uploaded data inspector -> extraction review -> approved evidence -> specialist workpaper -> IC package drilldown/export.

## Scope

Refresh the public demo journey, screenshots, and first-run docs so a visitor can pick one field, red flag, or data gap and follow it across the product.

## Acceptance Criteria

- [x] `docs/DEMO-JOURNEY.md` includes a clear source-to-IC reviewer script.
- [x] README points first-time visitors to the source-to-IC proof path.
- [x] `docs/QUICK-DEMO.md` and `docs/FIRST-DEAL-GUIDE.md` use current v3.2.0 persistent deal-space language.
- [x] Screenshots or documented manual review steps show source extraction review, approved field provenance, workpaper output, and IC package references/export where current UI state supports it.
- [x] No video, external account, cloud service, or private deal file is required.
- [x] Run `npm run validate:docs`.
- [x] Run `npm run validate:guides`.
- [x] Run `npm run proof -- --smoke --no-open`.
```

## 2. Harden OCR extraction for scanned/image-only source documents

Suggested labels: `enhancement`, `dashboard`, `validation`

```bash
gh issue create \
  --title "Harden OCR extraction for scanned/image-only source documents" \
  --label enhancement --label dashboard --label validation \
  --body-file /tmp/cre-ocr-source-extraction.md
```

Issue body:

```markdown
## Goal

Extend the new local OCR bridge beyond readable scanned offering memo excerpts into table-heavy rent rolls, diligence checklists, and common image uploads.

## Scope

Harden OCR while preserving the review-first contract: OCR-derived values must remain source-backed candidates with confidence, warnings, provenance, and human approval state before changing deal inputs.

## Acceptance Criteria

- [ ] Add OCR coverage for common image files and table-heavy scanned rent rolls.
- [ ] Preserve richer source provenance: file name, hash, page/image number, OCR confidence, snippet/bounding boxes when available, extracted value, parser metadata, and review status.
- [ ] Route ambiguous OCR values to candidate review with warnings instead of silently applying them.
- [ ] Keep text-based PDF parsing and image-only detection behavior backward-compatible.
- [ ] Add fixtures for at least one scanned rent roll or diligence checklist beyond the offering memo OCR fixture.
- [ ] Update `docs/FIRST-DEAL-GUIDE.md`, `docs/QUICK-DEMO.md`, and `docs/RUNTIME-COMPARISON.md` with OCR support boundaries.
- [ ] Run `npm run test:parsers`.
- [ ] Run `npm run test:workspace`.
- [ ] Run `npm --prefix dashboard run build`.
```

## 3. Expand legal and diligence checklist extraction into structured review candidates

Suggested labels: `enhancement`, `dashboard`, `validation`

```bash
gh issue create \
  --title "Expand legal and diligence checklist extraction into structured review candidates" \
  --label enhancement --label dashboard --label validation \
  --body-file /tmp/cre-legal-checklist-extraction.md
```

Issue body:

```markdown
## Goal

Make the document-first workspace useful earlier in legal/diligence by extracting checklist obligations, dates, missing items, responsible parties, and statuses from text-based legal/diligence PDFs and Markdown/TXT checklists.

## Scope

Build on the text-based PDF parser and source-review model. Extract checklist rows into reviewable candidates that can inform readiness, workpapers, and IC data gaps without bypassing operator review.

## Acceptance Criteria

- [ ] Add parser support for common diligence checklist fields: item/obligation, category, due date, responsible party, status, and notes.
- [ ] Preserve page/line/snippet provenance for every extracted checklist candidate.
- [ ] Surface missing dates, conflicting statuses, or ambiguous owners as review warnings.
- [ ] Add fixtures for at least two checklist layouts: legal/diligence PDF and Markdown/TXT.
- [ ] Wire approved checklist candidates into workspace readiness or package data gaps where appropriate.
- [ ] Update `docs/FIRST-DEAL-GUIDE.md` and `docs/API-REFERENCE.md` if response shapes change.
- [ ] Run `npm run test:parsers`.
- [ ] Run `npm run test:workspace`.
- [ ] Run `npm run validate`.
```

## 4. Expand messy parser fixtures for real-world rent rolls and T12s

Suggested labels: `enhancement`, `dashboard`, `validation`, `good first issue`

```bash
gh issue create \
  --title "Expand messy parser fixtures for real-world rent rolls and T12s" \
  --label enhancement --label dashboard --label validation --label "good first issue" \
  --body-file /tmp/cre-messy-parser-fixtures.md
```

Issue body:

```markdown
## Goal

Keep the source-backed intake path honest against the ugly rent rolls and T12s operators actually receive.

## Scope

Add fixture variants and parser expectations for real-world spreadsheet quirks while preserving graceful degradation and review-first behavior.

## Acceptance Criteria

- [ ] Add at least four fixture variants across rent roll and T12 inputs.
- [ ] Cover at least two of: hidden rows, merged headers, owner-formatted summary tabs, trailing notes, mixed date formats, subtotal traps, confusing occupancy conventions, or mislabeled sheets.
- [ ] Preserve field-level provenance: file name, sheet name, row/column or cell reference, extracted value, confidence/status, and warning state.
- [ ] Route ambiguous fields to candidate review with warnings instead of silently applying them.
- [ ] Keep existing parser fixtures green.
- [ ] Update docs if support boundaries change.
- [ ] Run `npm run test:parsers`.
- [ ] Run `npm run test:workspace`.
```
