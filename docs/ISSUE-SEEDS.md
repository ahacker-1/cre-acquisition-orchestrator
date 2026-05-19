# Public Issue Seeds

Use these as approval-ready GitHub issues after v2.5.0. They are intentionally scoped to make the project more legible, impressive, and contributor-friendly for first-time visitors.

Do not create these issues automatically from automation. Review the text, adjust labels/milestones, then publish from the GitHub UI or `gh issue create` when ready. If using the CLI snippets below, save each issue body to the referenced `/tmp/*.md` file first.

## Recommended Labels

- `enhancement`
- `documentation`
- `good first issue`
- `dashboard`
- `demo`
- `validation`

## Shipped after v2.5.0

- `docs/QUICK-DEMO.md` gives first-time visitors a five-minute offline path from clone to dashboard.
- `npm run demo:verify` runs the deterministic demo, contract validation, guide validation, system tests, and dashboard production build in one command.
- `docs/RUNTIME-COMPARISON.md` documents the offline demo vs live Codex split, artifact paths, and no-secret/data-sharing boundaries.
- XLSX rent rolls and T12s now produce source-backed candidate fields with review/apply persistence and provenance.

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

Extend the existing `npm run screenshots` / the existing screenshot capture script flow so it captures the first-run front door and quick-create modal in addition to the completed workspace surfaces.

## Acceptance Criteria

- [ ] Preserve the existing `npm run screenshots` command.
- [ ] Capture front door and quick-create modal without depending on stale browser local storage.
- [ ] Continue capturing Acquisition Command, Mission, Deal Team, Workpapers, and IC Package surfaces.
- [ ] Update `docs/assets/dashboard-front-door.png` and `docs/assets/quick-deal-create.png` intentionally.
- [ ] Ensure the command fails clearly if the dashboard cannot start or sample data is missing.
- [ ] Run `npm --prefix dashboard run build`.
- [ ] Run relevant Playwright tests.
```

## 2. Expand source-backed parser fixtures for messy real-world rent rolls and T12s

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

Broaden the v2.5 XLSX parser beyond the basic fixture shapes so it handles more messy real-world rent rolls and T12 workbooks.

## Scope

Add fixture variants for alternate headers, totals rows, occupancy conventions, blank rows, and multi-sheet T12 workbooks while preserving the v2.5 safe default: extracted fields must be reviewed and approved/applied before changing deal inputs.

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
