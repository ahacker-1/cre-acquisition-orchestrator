# Public Issue Seeds

Use these as approval-ready GitHub issues after v2.4.0. They are intentionally scoped to make the project more legible, impressive, and contributor-friendly for first-time visitors.

Do not create these issues automatically from automation. Review the text, adjust labels/milestones, then publish from the GitHub UI or `gh issue create` when ready. If using the CLI snippets below, save each issue body to the referenced `/tmp/*.md` file first.

## Recommended Labels

- `enhancement`
- `documentation`
- `good first issue`
- `dashboard`
- `demo`
- `validation`

## Shipped after v2.4.0

- `docs/QUICK-DEMO.md` gives first-time visitors a five-minute offline path from clone to dashboard.
- `npm run demo:verify` runs the deterministic demo, contract validation, guide validation, system tests, and dashboard production build in one command.
- `docs/RUNTIME-COMPARISON.md` documents the offline demo vs live Codex split, artifact paths, and no-secret/data-sharing boundaries.

## 1. Extend deterministic screenshot capture to front door and quick-create surfaces

Suggested labels: `enhancement`, `demo`, `validation`

```bash
gh issue create \
  --title "Extend deterministic screenshot capture to front door and quick-create surfaces" \
  --label enhancement --label demo --label validation \
  --body-file /tmp/cre-front-door-screenshot-capture.md
```

Issue body:

```markdown
## Goal

Make the entire first-time visitor path reproducible, including the front door before a workspace is open.

## Scope

Extend the existing `npm run screenshots` / `dashboard/scripts/capture-v24-screenshots.mjs` flow so it captures the first-run front door and quick-create modal in addition to the completed workspace surfaces.

## Acceptance Criteria

- [ ] Preserve the existing `npm run screenshots` command.
- [ ] Capture front door and quick-create modal without depending on stale browser local storage.
- [ ] Continue capturing Acquisition Command, Mission, Deal Team, Workpapers, and IC Package surfaces.
- [ ] Update `docs/assets/dashboard-front-door.png` and `docs/assets/quick-deal-create.png` intentionally.
- [ ] Ensure the command fails clearly if the dashboard cannot start or sample data is missing.
- [ ] Run `npm --prefix dashboard run build`.
- [ ] Run relevant Playwright tests.
```

## 2. Add source-backed XLSX rent-roll extraction

Suggested labels: `enhancement`, `dashboard`, `validation`

```bash
gh issue create \
  --title "Add source-backed XLSX rent-roll extraction" \
  --label enhancement --label dashboard --label validation \
  --body-file /tmp/cre-xlsx-rent-roll-extraction.md
```

Issue body:

```markdown
## Goal

Move XLSX rent rolls from "stored and routed" to source-backed extraction with operator review.

## Scope

Support common multifamily rent-roll workbook structures while preserving the current safe default: extracted fields must be previewed and approved before changing deal inputs.

## Acceptance Criteria

- [ ] Add parser support for XLSX rent-roll fixtures.
- [ ] Preserve field-level provenance: file name, sheet name, row/column or cell reference, extracted value, confidence/status.
- [ ] Route ambiguous fields to pending review instead of silently applying them.
- [ ] Add fixtures for at least two workbook shapes.
- [ ] Show extracted fields in the existing dashboard extraction review flow.
- [ ] Update docs to clarify CSV/TXT/MD and XLSX extraction support boundaries.
- [ ] Run `npm run validate`.
- [ ] Run `npm test`.
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

## 4. Document offline simulation vs live Codex execution

Suggested labels: `documentation`, `good first issue`

```bash
gh issue create \
  --title "Document offline simulation vs live Codex execution" \
  --label documentation --label "good first issue" \
  --body-file /tmp/cre-runtime-comparison-doc.md
```

Issue body:

```markdown
## Goal

Help new users choose the right runtime path without confusing the deterministic demo with optional live-agent execution.

## Scope

Add a clear comparison table for offline simulation and Codex / ChatGPT live execution.

## Acceptance Criteria

- [ ] Explain which path requires no API keys or subscription.
- [ ] Explain which path requires local Codex CLI authentication.
- [ ] List what artifacts each path produces.
- [ ] Clarify sandbox and no-secret expectations for live runs.
- [ ] Link from README Quick Start and Demo Journey.
- [ ] Run `git diff --check`.
```
