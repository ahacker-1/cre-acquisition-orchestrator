# Public Issue Seeds

Use these as approval-ready GitHub issues after v2.6.0. They are intentionally scoped to make the project more legible, impressive, and contributor-friendly for first-time visitors.

Do not create these issues automatically from automation. Review the text, adjust labels/milestones, then publish from the GitHub UI or `gh issue create` when ready. If using the CLI snippets below, save each issue body to the referenced `/tmp/*.md` file first.

## Recommended Labels

- `enhancement`
- `documentation`
- `good first issue`
- `dashboard`
- `demo`
- `validation`

## Shipped through v2.6.0

- `docs/QUICK-DEMO.md` gives first-time visitors a five-minute offline path from clone to dashboard.
- `npm run demo:verify` runs the deterministic demo, contract validation, guide validation, system tests, and dashboard production build in one command.
- `docs/RUNTIME-COMPARISON.md` documents the offline demo vs live Codex split, artifact paths, and no-secret/data-sharing boundaries.
- XLSX rent rolls and T12s now produce source-backed candidate fields with review/apply persistence and provenance.
- Parser fixtures now cover alternate rent-roll headers, blank rows, total rows, common occupancy conventions, and multi-sheet T12 workbook selection.
- v2.6.0 refreshed public screenshots, API/WebSocket docs, agent catalog docs, strict schema validation, local dashboard hardening, and practitioner-grade Parkview workpapers.

## 1. Add PDF text extraction for offering memoranda and legal checklists

Suggested labels: `enhancement`, `dashboard`, `validation`

```bash
gh issue create \
  --title "Add PDF text extraction for offering memoranda and legal checklists" \
  --label enhancement --label dashboard --label validation \
  --body-file /tmp/cre-pdf-source-extraction.md
```

Issue body:

```markdown
## Goal

Move the document-first workspace beyond spreadsheets by extracting reviewable text fields from common CRE PDFs without bypassing human approval.

## Scope

Add local PDF text extraction for offering memoranda and legal/diligence checklists. Extracted values should become source-backed candidates with confidence, warnings, file hashes, page references, and review/apply state before changing deal inputs.

## Acceptance Criteria

- [ ] Add a local parser path for text-based PDFs; image-only PDFs should return an explicit unsupported/OCR-needed warning.
- [ ] Preserve source provenance: file name, hash, page number, snippet, extracted value, confidence/status, and parser metadata.
- [ ] Route ambiguous extracted values to candidate review with warnings instead of silently applying them.
- [ ] Add fixtures for at least one offering memo excerpt and one legal/diligence checklist PDF.
- [ ] Update `docs/FIRST-DEAL-GUIDE.md` and `docs/QUICK-DEMO.md` with supported/unsupported PDF boundaries.
- [ ] Run `npm run test:parsers`.
- [ ] Run `npm run test:workspace`.
- [ ] Run `npm --prefix dashboard run build`.
```

## 2. Continue expanding source-backed XLSX rent-roll and T12 extraction

Suggested labels: `enhancement`, `dashboard`, `validation`

```bash
gh issue create \
  --title "Continue expanding source-backed XLSX rent-roll and T12 extraction" \
  --label enhancement --label dashboard --label validation \
  --body-file /tmp/cre-xlsx-rent-roll-extraction.md
```

Issue body:

```markdown
## Goal

Broaden the v2.5+ XLSX parser beyond the current fixture set so it handles more messy real-world rent rolls and T12 workbooks.

## Scope

Add fixture variants beyond the current alternate-header, totals-row, blank-row, occupancy-convention, and multi-sheet T12 coverage while preserving the safe default: extracted fields must be reviewed and approved/applied before changing deal inputs.

## Acceptance Criteria

- [ ] Add at least four additional XLSX fixtures across rent roll and T12 variants.
- [ ] Preserve field-level provenance: file name, sheet name, row/column or cell reference, extracted value, confidence/status.
- [ ] Route ambiguous fields to candidate review with warnings instead of silently applying them.
- [ ] Keep existing basic parser fixtures green.
- [ ] Update docs to clarify XLSX support boundaries and known unsupported workbook shapes.
- [ ] Run `npm run test:parsers`.
- [ ] Run `npm run test:workspace`.
- [ ] Run `npm --prefix dashboard run build`.
```

## 3. Add workpaper quality gates and reviewer signoff states

Suggested labels: `enhancement`, `validation`

```bash
gh issue create \
  --title "Add workpaper quality gates and reviewer signoff states" \
  --label enhancement --label validation \
  --body-file /tmp/cre-workpaper-quality-gates.md
```

Issue body:

```markdown
## Goal

Make agent outputs feel like diligence workpapers a human operator can review, not generic AI summaries.

## Scope

Define and validate minimum workpaper fields for cited inputs, assumptions, calculations, caveats, open questions, and reviewer signoff.

## Acceptance Criteria

- [ ] Define a workpaper quality checklist or schema extension.
- [ ] Surface missing citations, assumptions, calculations, or caveats as review warnings.
- [ ] Add reviewer signoff state to package/workpaper metadata.
- [ ] Link quality warnings back to the originating phase/agent where possible.
- [ ] Update sample outputs or fixtures to demonstrate compliant workpapers.
- [ ] Run `npm run validate`.
- [ ] Run `npm test`.
- [ ] Run `npm --prefix dashboard run build`.
```

## 4. Add a dashboard contributor architecture map

Suggested labels: `documentation`, `good first issue`, `dashboard`

```bash
gh issue create \
  --title "Add a dashboard contributor architecture map" \
  --label documentation --label "good first issue" --label dashboard \
  --body-file /tmp/cre-dashboard-architecture-map.md
```

Issue body:

```markdown
## Goal

Help contributors understand where to change the local dashboard without reverse-engineering the entire React/API/WebSocket workspace.

## Scope

Add a contributor-facing dashboard architecture map covering major screens, shared hooks/services, local REST API routes, WebSocket watcher behavior, state persisted under `data/`, and screenshot/test entry points.

## Acceptance Criteria

- [ ] Document the front-door, workspace, evidence/review, deal-team, workpapers, and IC package components.
- [ ] Document the local API and WebSocket boundaries with links to `docs/API-REFERENCE.md` and `docs/WEBSOCKET-EVENTS.md`.
- [ ] Document which tests to run for UI-only, parser/workspace, and release-screenshot changes.
- [ ] Link the map from `CONTRIBUTING.md` and/or `docs/ARCHITECTURE.md`.
- [ ] Run `git diff --check`.
```

## 5. Add release checklist automation for tag-readiness

Suggested labels: `enhancement`, `validation`, `documentation`

```bash
gh issue create \
  --title "Add release checklist automation for tag-readiness" \
  --label enhancement --label validation --label documentation \
  --body-file /tmp/cre-release-checklist-automation.md
```

Issue body:

```markdown
## Goal

Reduce release hygiene drift by giving maintainers one local command that checks version alignment, docs, screenshots, validation posture, and release-note readiness before requesting approval to tag or publish.

## Scope

Add a local-only release readiness script/checklist. It should not push, tag, publish, or create GitHub releases.

## Acceptance Criteria

- [ ] Check root and dashboard package versions for alignment.
- [ ] Check `CHANGELOG.md`, `README.md`, `ROADMAP.md`, and release-notes references for the target version.
- [ ] Check required public screenshot assets exist and are newer than the last release tag when intentionally refreshed.
- [ ] Print the exact validation commands maintainers should run before tagging.
- [ ] Print approval-ready `git tag` / `gh release create` commands without executing them.
- [ ] Document the command in `CONTRIBUTING.md` or release docs.
- [ ] Run `npm run validate:docs`.
- [ ] Run `npm --prefix dashboard run build`.
```
