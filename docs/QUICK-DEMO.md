# Quick Demo: First Real Deal Workspace in 10 Minutes

Use this path when you want to prove the product locally before reading the architecture docs. The primary path is a local, source-backed workspace for your own files. Parkview remains the deterministic fallback when you want a no-upload sample.

## What You Will See

The current demo follows the v3.1.0 evidence-grade deal-space journey:

1. **Drop documents** — start from source material, not a blank automation form. XLSX/CSV/TXT/MD, text-based PDF sources, and readable scanned/image-only PDFs can become reviewable candidates; low-confidence OCR remains review-gated with warnings.
2. **Review extraction** — candidate fields show confidence, warnings, source file, file hash, and source location before they change underwriting inputs.
3. **Approve evidence** — trusted fields are applied; ambiguous values are rejected or waived with a reason.
4. **Watch the team work** — the persistent deal space shows the lifecycle spine, Your Team rail, Live Feed, and summonable agent panel.
5. **Trace to IC** — the proof path and evidence graph connect source documents, approved fields, workpapers, red flags, data gaps, and the IC package export.

## Start the Dashboard

From a fresh clone:

```powershell
git clone https://github.com/ahacker-1/cre-acquisition-orchestrator.git
cd cre-acquisition-orchestrator
npm install
npm run dashboard
```

Open:

```text
http://localhost:5173
```

The dashboard runs locally. No external AI APIs are called unless you explicitly choose the optional Codex / ChatGPT runtime later.

## Run a First Real Deal

1. Drop a local rent roll, T12, offering memo, or supporting document package on the front door.
2. Name the deal and create the workspace.
3. In **Intake**, review supported source files as candidate fields with provenance, confidence, warnings, and source location.
4. Approve/apply trusted fields, or reject/waive ambiguous fields with a note.
5. Use the lifecycle spine, right rail, and command bar to resolve missing evidence and move from Intake into Diligence.
6. Summon a specialist or launch the appropriate review path; inspect the filed workpaper and its cited inputs.
7. Open **IC Package** and export Markdown or JSON for an IC starter package.

The repo includes a realistic source-backed package at [`fixtures/first-real-deal`](../fixtures/first-real-deal). It references messy XLSX rent roll and T12 fixtures plus an offering memo excerpt.

If you are deciding between the offline demo and optional live Codex agents, read [`docs/RUNTIME-COMPARISON.md`](RUNTIME-COMPARISON.md). The short version: use the offline demo for first evaluation, screenshots, and release validation; use live Codex only after authentication and data-sharing boundaries are understood.

## Use Guided Demo Mode

Once the dashboard is open, click **Start Guided Demo** on the front door. If a workspace is already open, click **Parkview Demo** in the header to reopen the deterministic sample.

Guided Demo Mode opens the deterministic Parkview sample without uploads or API keys, then walks through:

1. **The Deal Space** — the persistent frame: lifecycle spine, center stage, Live Feed, Your Team, and command bar.
2. **Command Your Team** — plain-English tasking and suggestion chips.
3. **Your Team** — the specialist rail and summonable 31-role team.
4. **Watch It Work** — an agent panel with replayed/live reasoning and a filed workpaper.
5. **IC Package** — recommendation, phase outcomes, source-backed inputs, red flags, data gaps, manifest, review trail, and export.

## Verify the Offline Demo

Before showing the project to someone else, run the full release verification path:

```powershell
npm run verify:v3
```

This command runs release drift checks, root regression tests, parser/workspace evidence tests, dashboard typecheck/build, root and dashboard audits, offline eval, production self-host smoke, and browser E2E. It is offline and credential-free by default.

## Screens to Review

After the dashboard opens, use the sample deal/workspace and review these surfaces in order:

| Screen | What to Look For |
|--------|------------------|
| **Front Door** | Document-first intake and the deterministic Parkview guided-demo option. |
| **Intake / Extraction Review** | Source documents becoming candidate fields with confidence, warnings, and provenance before approval. |
| **Deal Space** | One persistent frame: lifecycle spine, center stage, Live Feed, Your Team, and command bar. |
| **Agent Panel / Workpaper** | A specialist's reasoning and filed workpaper, with findings/caveats and available source or workpaper references. |
| **IC Package** | Proof path, evidence chain, recommendation, red flags, data gaps, manifest, review trail, workpaper links, and Markdown/JSON export. |

Current public screenshots for these surfaces live under [`docs/assets/`](assets/). The longer source-to-IC storyboard is in [`docs/DEMO-JOURNEY.md`](DEMO-JOURNEY.md).

## What Is Real vs Simulated

### Offline deterministic demo

The deterministic sample uses Parkview data and local orchestration artifacts. It is best for repeatable screenshots, validation, and public walkthroughs.

Use it to evaluate:

- product journey
- workspace information architecture
- acquisition-team positioning
- generated workpapers/package shape
- source/evidence expectations
- release screenshots and docs

### Local first-real-deal workspace

The real-deal path uses user-supplied local documents. Supported extraction still routes candidate fields to operator review before changing deal inputs. The IC starter export is an auditable package starter, not investment advice or autonomous decisioning.

### Optional live Codex / ChatGPT path

Live-agent execution is optional. If Codex CLI is installed and authenticated with ChatGPT, the dashboard can launch workflows that execute the markdown agent instructions through the local Codex runtime.

Use it after the offline path is clear. The live path is useful for validating runtime behavior, but it is not required to understand the product.

## Refresh the Demo State

If the dashboard looks stale or you want fresh deterministic artifacts:

```powershell
npm run demo
```

Then restart the dashboard:

```powershell
npm run dashboard
```

## Refresh Public Screenshots

When preparing release notes, README updates, or launch material:

```powershell
npm run demo
npm run dashboard
# in a second terminal while the dashboard is running:
npm run screenshots
```

This updates the current public gallery under `docs/assets/` for:

- front door / document drop
- Intake auto-fill and source extraction review
- persistent deal space / lifecycle spine
- agent panel and filed workpaper
- IC package / review trail

Review the image diff before committing. Public screenshots should not show contradictory states like a completed package paired with blocked source inputs.

## Troubleshooting

### Port already in use

The dashboard uses:

- `5173` — Vite frontend
- `8080` — WebSocket watcher
- `8081` — local REST API

On Windows PowerShell, clear stale listeners with:

```powershell
$ports = @(5173, 8080, 8081)
Get-NetTCPConnection -State Listen |
  Where-Object { $ports -contains $_.LocalPort } |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

Then restart:

```powershell
npm run dashboard
```

### Dashboard opens but looks empty or stale

Run:

```powershell
npm run demo
npm run dashboard
```

Then refresh `http://localhost:5173`.

If the browser still shows stale state, clear local storage for `localhost:5173` or open a private/incognito window.

### Build or dependency issues

Run:

```powershell
npm install
npm --prefix dashboard install
npm --prefix dashboard run build
```

### Validate the local repo

For a stronger local confidence check, start with:

```powershell
npm run verify:v3
```

For a narrower deterministic artifact check:

```powershell
npm run demo:verify
```

## Next Reading

- [`docs/FIRST-DEAL-GUIDE.md`](FIRST-DEAL-GUIDE.md) - source-backed first-real-deal walkthrough.
- [`docs/DEMO-JOURNEY.md`](DEMO-JOURNEY.md) - public operator storyboard and screenshot refresh path.
- [`docs/RUNTIME-COMPARISON.md`](RUNTIME-COMPARISON.md) - offline demo vs live Codex expectations, artifacts, and safety boundaries.
- [`README.md`](../README.md) - project overview, release journey, architecture summary, and setup.
- [`ROADMAP.md`](../ROADMAP.md) - current priorities and contribution directions.
- [`docs/ISSUE-SEEDS.md`](ISSUE-SEEDS.md) - approval-ready issue drafts for public follow-up work.
