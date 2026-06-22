# First Deal Guide

A source-backed path from fresh clone to a local IC starter package.

If you want the fastest no-upload trust loop first, run `npm run proof` and follow [`docs/PROOF-PATH.md`](PROOF-PATH.md). Then come back here for your own source package.

---

## Step 1: Install and Verify

From the repo root:

```powershell
npm install
npm run setup
```

This verifies Node/npm, installs dashboard dependencies, prepares the local parser `.venv` with `pandas`, `openpyxl`, `pdfplumber`, and `PyMuPDF`, and tries to prepare the optional Codex live-agent runtime. If Codex install or login is skipped, the local dashboard and deterministic sample still work.

If you want live AI agents, choose **Sign in with ChatGPT** during the Codex login flow. For a strict live-agent setup check, run:

```powershell
npm run setup -- --require-codex
```

Verify Codex auth:

```powershell
npm run codex:status
```

Expected login output includes `Logged in using ChatGPT`.

---

## Step 2: Start the Dashboard

```powershell
npm run dashboard
```

Open:

```text
http://localhost:5173
```

The dashboard is the default first-deal path. You do not need to edit `config/deal.json` to create a workspace from source documents.

---

## Step 3: Drop a Local Source Package

Use the front door to upload the files you actually have:

- rent roll
- T12 or trailing operating statement
- offering memo
- LOI, PSA, title, survey, lender, environmental, or diligence support files

Supported CSV/TXT/MD files, supported XLSX rent-roll/T12 workbooks, text-based PDFs, readable scanned/image-only PDFs, and Markdown/TXT legal checklists can produce extracted candidate fields. OCR-derived values stay candidate-only with confidence, warnings, page provenance, and raw snippets until a human reviews them. Unsupported workbook shapes are detected and stored instead of being silently guessed.

The repo includes a realistic local fixture package:

```text
fixtures/first-real-deal/
```

It points to messy XLSX rent roll and T12 workbooks plus an offering memo excerpt. Use it as a safe practice package before using confidential deal files.

---

## Step 4: Review Source-Backed Fields

Open the **Intake** source-review surface in the deal workspace.

Before approving candidates, use the uploaded data inspector to inspect parsed source tables, field types, fill rates, examples, source rows, and row-level detail. This is the quickest way to verify that extracted values are grounded in the files you uploaded.

For each supported source document:

1. Click **Preview Extraction**.
2. Review the field value, confidence, source file, sheet/row/cell or line reference, raw snippet, warnings, and current deal value.
3. Select trusted fields and click **Approve & Apply**.
4. Use **Reject Selected** when the field should not be used.
5. Use **Waive Selected** when the field is acceptable to defer, with a short note.

Critical deal inputs are not silently applied. They must be reviewed before they become source-backed deal inputs. Approved values become the evidence layer that downstream workflows and specialist workpapers can cite.

Legal or diligence checklist candidates use the `diligence.checklistItems` path with low confidence and line provenance. Treat them as review-only to-do evidence, not underwriting inputs. If a scanned PDF is readable, the local OCR bridge runs inside the parser path and returns reviewable candidates; if OCR cannot find supported fields, the document remains stored with explicit OCR metadata and no guessed inputs.

---

## Step 5: Resolve Missing Evidence

Use these surfaces before launching work:

- **Lifecycle spine:** where the deal stands from Intake through IC.
- **Live Feed / Your Team rail:** current specialist activity, missing evidence, and who can be summoned next.
- **Command bar / stage actions:** the next plain-English action to resolve blockers and move the deal forward.

The launch gate can enforce approved source-backed inputs for critical fields. Ambiguous fields should stay in review, be rejected, or be waived. Do not treat a waiver as proof that the value is true.

---

## Step 6: Launch the Right Review Path

When the source-backed inputs are ready, launch a focused workflow from the workspace:

- **Quick Deal Screen:** fastest go/no-go style path.
- **Underwriting Refresh:** source-backed underwriting pass.
- **Full Acquisition Review:** broader diligence, underwriting, financing, legal, and closing package path.

The offline simulation runtime is local and credential-free. The live Codex / ChatGPT runtime is optional and should be used only after you understand data-sharing boundaries in [Runtime Comparison](RUNTIME-COMPARISON.md).

---

## Step 7: Export the IC Starter Package

Open **IC Package** and export:

- Markdown for human review
- JSON for downstream tools or audit checks

The export includes approved inputs, source references where available, assumptions, open questions, red flags, workpaper links, and launch-readiness status. Use it to review at least one decision point from the IC package back to the originating workpaper or approved source evidence when that provenance is present. It is a reviewable starting package, not financial, legal, or investment advice.

Generated package files are written under:

```text
data/deals/{dealId}/packages/
```

Runtime files remain local and are ignored by git.

---

## Parkview Sample Fallback

If you want a deterministic no-upload walkthrough, click **Start Guided Demo** or run:

```powershell
npm run demo
npm run dashboard
```

Parkview is best for screenshots, public demos, and validating the end-to-end sample. The first real-deal path is the dashboard document intake and review loop above.

---

## What You Have Now

After the first deal run, you have:

1. A local deal workspace created from source documents.
2. Uploaded table inspection with field quality, examples, source rows, and row-level detail.
3. A source-backed approved-field manifest with provenance and review status.
4. A plain-English missing-evidence checklist and one best next action.
5. A gated workflow launch path for critical approved inputs.
6. A Markdown/JSON IC starter package you can audit and adapt.
7. A demonstrable source-to-IC review path for at least one approved field, red flag, or data gap where the current package exposes provenance.
