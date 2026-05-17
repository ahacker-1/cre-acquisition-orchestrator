# Public Issue Seeds

Use these as approval-ready GitHub issues after v2.4.0. They are intentionally scoped to make the project more legible, impressive, and contributor-friendly for first-time visitors.

Do not create these issues automatically from automation. Review the text, adjust labels/milestones, then publish from the GitHub UI or `gh issue create` when ready.

## Recommended Labels

- `enhancement`
- `documentation`
- `good first issue`
- `dashboard`
- `demo`
- `validation`

## 1. Add v2.4 screenshot gallery for the agentic deal-team workspace

Suggested labels: `documentation`, `demo`, `good first issue`

```bash
gh issue create \
  --title "Add v2.4 screenshot gallery for the agentic deal-team workspace" \
  --label documentation --label demo --label "good first issue" \
  --body-file /tmp/cre-v24-screenshot-gallery.md
```

Issue body:

```markdown
## Goal

Make a first-time GitHub visitor understand the v2.4 product journey without running the app first.

## Scope

Capture and add current screenshots for:

- Acquisition Command
- Mission / intent state
- Deal Team handoffs
- Workpapers & Evidence
- IC Package review

## Acceptance Criteria

- [ ] Run `npm run demo` so the sample deal has current artifacts.
- [ ] Run `npm run dashboard` and open the completed sample workspace.
- [ ] Capture the five screenshots listed above.
- [ ] Save images under `docs/assets/` using stable, descriptive names.
- [ ] Update `README.md` Dashboard Preview with the new gallery.
- [ ] Update `docs/DEMO-JOURNEY.md` so no completed v2.4 screenshot is still marked "needed".
- [ ] Run `git diff --check`.
- [ ] Run `npm --prefix dashboard run build`.
```

## 2. Add deterministic screenshot capture for release hygiene

Suggested labels: `enhancement`, `demo`, `validation`

```bash
gh issue create \
  --title "Add deterministic screenshot capture for release hygiene" \
  --label enhancement --label demo --label validation \
  --body-file /tmp/cre-deterministic-screenshot-capture.md
```

Issue body:

```markdown
## Goal

Make public screenshots part of the release process instead of a manual, easy-to-forget step.

## Scope

Add a script or Playwright flow that can launch the dashboard against the deterministic sample run and capture the core v2.4 surfaces.

## Acceptance Criteria

- [ ] Add a repeatable command, for example `npm run screenshots` or `npm --prefix dashboard run screenshots`.
- [ ] Capture front door, Acquisition Command, Mission, Deal Team, Workpapers, and IC Package surfaces.
- [ ] Store generated screenshots in a documented output folder or update `docs/assets/` intentionally.
- [ ] Document prerequisites and how to refresh screenshots before a release.
- [ ] Ensure the command fails clearly if the dashboard cannot start or sample data is missing.
- [ ] Run `npm --prefix dashboard run build`.
- [ ] Run relevant Playwright tests.
```

## 3. Add source-backed XLSX rent-roll extraction

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

## 4. Add workpaper quality gates and reviewer signoff states

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

## 5. Document offline simulation vs live Codex execution

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
