# Dashboard Setup

Guide to installing, configuring, and using the real-time monitoring dashboard for the CRE Acquisition Orchestration System.

---

## Overview

The dashboard provides a local-first agentic deal team workspace for deal setup, source-document intake, mission control, workflow launch, and pipeline execution:

- **Document + goal entry**: Drop deal files, state the desired outcome, and let the workspace recommend the first orchestration path
- **Mission workspace**: Documents, Mission, Agents, Workpapers, Package, and Advanced views for each deal
- **Advanced workflow launcher**: Five outcome workflows with saved local presets and run-now launch for operators who want manual control
- **Runtime selector**: Launch with live Codex / ChatGPT by default, or choose Simulation Demo for deterministic local validation
- **Document intake**: Upload queue, classification, extraction preview, approve/reject/waive review, and source-backed apply from local files
- **Operator briefing**: Best next move, source-backed input coverage, review queue, phase readiness, and workflow-level launch confidence
- **Phase progress**: Visual progress bars for each of the 5 phases, including skipped-phase visibility for scoped workflows
- **Agent status**: Per-agent status indicators (pending, running, complete, failed)
- **Log viewer**: Live log stream from all agents with filtering
- **Package viewer**: Read final reports, IC review briefs, workpapers, findings, document manifests, recommendation packages, and exportable Markdown/JSON IC starter packages directly in the browser
- **Real-time updates**: WebSocket connection pushes updates as agents write checkpoints

The dashboard consists of three local components:
1. **Vite dev server** (port 5173): Serves the React frontend
2. **Watcher process** (port 8080): Monitors checkpoint/log files and pushes updates via WebSocket
3. **Local REST API** (port 8081): Serves deals, workflows, presets, document uploads, extraction previews, and simulation or Codex run launch requests

---

## First-Time Setup

### Prerequisites

- Node.js 18+ installed
- npm 9+ installed

See [Prerequisites](PREREQUISITES.md) for full software requirements.

### Install Dependencies

```powershell
npm run setup
```

This installs all frontend dependencies (React, Vite, Tailwind CSS) and the watcher dependencies. It also tries to prepare the Codex live-agent runtime. The explicit Simulation Demo path still works if Codex is not installed or not logged in.

---

## Starting the Dashboard

```powershell
npm run dashboard
```

This single command starts both:
- The Vite development server on **port 5173**
- The file watcher on **port 8080**
- The local REST API on **port 8081**

You should see output similar to:
```
  VITE v5.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/

  Watcher: Monitoring data/status/ for changes
  Watcher: WebSocket server started on port 8080
  REST API listening on http://localhost:8081
```

---

## Accessing the Dashboard

Open your browser and navigate to:

```
http://localhost:5173
```

The dashboard loads immediately and attempts to connect to the watcher via WebSocket at `ws://localhost:8080`.

### First Real Deal Fast Path

1. Drop a local rent roll, T12, offering memo, or supporting file package on the front door.
2. Create the workspace from the quick deal modal.
3. Open **Evidence** and preview extraction for supported CSV/TXT/MD/XLSX files.
4. Approve/apply trusted fields, reject bad candidates, or waive deferred fields with a note.
5. Use the cockpit sidebar and Operator Briefing to resolve missing evidence and launch readiness.
6. Open **IC Package** and export Markdown or JSON for a reviewable IC starter package.

Parkview Guided Demo remains available for deterministic no-upload tours.

### Connection Status

The dashboard displays a connection indicator:
- **Green dot / "Connected"**: WebSocket is active, receiving real-time updates
- **Red dot / "Disconnected"**: WebSocket lost, data is stale. Refresh the browser or restart the watcher.

---

## Features

### Phase Progress View

The main view shows all 5 phases in the pipeline:

| Phase | Agents | Description |
|-------|--------|-------------|
| Due Diligence | 7 | Property analysis, market study, environmental, title |
| Underwriting | 3 | Financial model, scenarios, IC memo |
| Financing | 3 | Lender outreach, quote comparison, term sheet |
| Legal | 6 | PSA review, title/survey, estoppels, loan docs, insurance, transfer docs |
| Closing | 2 | Closing coordination, funds flow |

Each phase shows:
- Progress bar (0-100%)
- Agent count (completed / total)
- Phase verdict (once complete): GO, CONDITIONAL, NO-GO
- Duration timer

### Agent Status Panel

Click on any phase to expand the agent detail panel:

| Status | Icon | Meaning |
|--------|------|---------|
| Pending | Gray circle | Agent has not started yet |
| Running | Blue spinner | Agent is actively executing |
| Complete | Green check | Agent finished successfully |
| Failed | Red X | Agent encountered an error |

Each agent entry shows:
- Agent name
- Current status
- Last checkpoint ID (if running)
- Confidence level (if complete)
- Duration

### Log Viewer

The log viewer panel shows real-time log output from all agents:

- **Filter by phase**: Select a specific phase to see only its logs
- **Filter by category**: Toggle ACTION, FINDING, ERROR, DATA_GAP, COMPLETE
- **Search**: Free-text search across all log entries
- **Auto-scroll**: Automatically scrolls to the latest entry (toggle on/off)

Log entries are color-coded:
- ACTION: Default text
- FINDING: Blue
- ERROR: Red
- DATA_GAP: Orange
- COMPLETE: Green

### Report Viewer

Once the pipeline completes, view generated reports and package artifacts directly in the dashboard:

- **Final Report**: The comprehensive deal analysis report
- **IC Memo**: The Investment Committee memorandum
- **Phase Outputs**: Individual phase output summaries
- **Completion Package**: Phase outcomes, IC review brief, workpapers, findings, decision log, document manifest, source-backed inputs, and final recommendation

### Agentic Deal Team Workspace

Open a saved deal to work inside its full lifecycle workspace. The default experience is not workflow configuration; it is the acquisition-team journey: source documents, mission, visible agent work, workpapers, and package.

| Workspace | What It Provides |
|-----------|------------------|
| Documents | Source-document upload queue, classification, extraction preview, bulk safe-field selection, before/after change summary, and approved-field apply |
| Mission | Deal-team command center showing the requested goal, readiness, blockers, live agent activity, and next best operator action |
| Agents | Acquisition Team view showing active and planned specialist agents, phase groupings, statuses, confidence, data gaps, and red flags |
| Workpapers | Evidence wall of generated workpapers, reports, outputs, source artifacts, and their creating agents |
| Package | Completion package, IC Review Brief, source confidence, decision checklist, decision log, export controls, and final recommendation for the latest run |
| Advanced | Operator Briefing, Deal Progression Guide, phase workspaces, runtime selector, and embedded workflow launcher for manual orchestration control |

### Mission, Agent Activity, and Operator Command

The **Mission** tab is the default workspace surface for an active run. It summarizes the deal goal, source-document readiness, blockers, active handoffs, recent agent messages, and package readiness. The older guide/briefing/runtime controls remain available in **Advanced** for power users.

The **Deal Progression Guide** is powered by `config/operator-guides.json`, which keeps operational checklist content, helper copy, evidence requirements, and workflow mappings out of React components.

Each guide item shows:

- **Status**: `blocked`, `missing`, `ready`, `in_review`, `complete`, or `waived`
- **Priority and category**: critical/important/optional plus document, extraction, diligence, financing, legal, closing, or package context
- **Why it matters**: practical operator guidance for the acquisition process
- **Evidence required**: the document, source field, workflow output, or operator judgment needed to move forward
- **Recommended action**: upload documents, review extraction, edit criteria, open a phase, launch a workflow from the safe run context, or review the package

Manual completion and waive/defer notes are persisted per deal in `data/deals/{dealId}/phase-state.json`. Source-backed completion remains distinct: uploaded documents, approved extraction fields, launch readiness, and package artifacts still drive the system-derived status.

The persistent **Operator Command Bar** summarizes the active phase, blocker count, warning count, checklist progress, source-backed input coverage, and one primary next action. It is meant to answer the operator's daily question: "What should I do right now to progress this deal?"

### Operator Briefing and Launch Readiness

The Advanced tab shows an **Operator Briefing** before the pipeline cards. It is designed to answer: "What should I do next if I want manual control?"

- **Best next move** points the operator toward upload, extraction review, source-backed input approval, phase review, or workflow launch.
- **Source-backed inputs** shows approved required fields for the full acquisition review.
- **Review queue** counts documents that still need extraction or operator review.
- **Workflow readiness cards** explain whether each configured outcome workflow is `ready`, `warning`, or `blocked`.

Warnings are intentionally not always hard blockers. A workflow can still launch with missing source-backed fields unless the runtime request explicitly enforces source-backed inputs. Treat warnings as operator confidence signals, not hidden validation errors.

### Agent Communication Events

The story event stream now includes explicit communication events in addition to status milestones:

- `agent_message`: task briefs, reviews, and collaboration notes between orchestrators and specialists
- `agent_handoff`: agent-to-orchestrator or orchestrator-to-operator handoffs with linked artifacts
- `agent_review`: self-review or peer-review notes, confidence, and escalation hints
- `agent_dependency`: blockers and dependencies that may require human input
- `phase_handoff`: downstream phase context handoffs with evidence references and risk/data-gap counts

These events are written to `data/status/{dealId}/run-{runId}-events.ndjson` and rendered in Mission/Agent Activity so users can see the multi-orchestration layer working instead of guessing from a progress bar.

### Runtime Selection

The Workflow Launcher and phase workspaces support two runtime providers:

| Runtime | Best For | Output |
|---------|----------|--------|
| Simulation | No-key local demos, regression checks, and deterministic onboarding | Checkpoints, phase outputs, reports, story events, and package artifacts under `data/` |
| Codex / ChatGPT | Running real markdown agents with your ChatGPT-authenticated Codex CLI session | Raw Codex prompts/logs/memos in `data/codex-runs/{runId}/` plus Package-view artifacts in `data/status/{dealId}/run-{runId}-*` |

Codex launches expose agent count, concurrency, and optional web search controls. The default sandbox is read-only.

When **Codex / ChatGPT** is selected, the Workflow Launcher shows a **ChatGPT Authentication** panel. It reports whether Codex CLI is installed, whether the local user is logged in with ChatGPT, and includes a **Login to ChatGPT** button. The button starts `codex login` locally so the user can complete the browser-based ChatGPT sign-in flow. The dashboard returns status only; it never returns or writes Codex credentials into the project.

### Launch API Contract

The dashboard posts workflow launches to:

```text
POST /api/workflows/{workflowId}/launch
```

Important request fields:

| Field | Values | Notes |
|-------|--------|-------|
| `dealId` | saved deal id | Required unless using a saved preset |
| `runtimeProvider` | `codex` or `simulation` | Defaults to `codex`; pass `simulation` only for the deterministic demo lane |
| `codexMaxAgents` | positive integer | Optional cap for live Codex launches |
| `codexConcurrency` | positive integer | Optional live Codex parallelism |
| `codexSandbox` | Codex sandbox string | Defaults to read-only in the runner |
| `codexModel` | model id | Optional Codex CLI model override |
| `codexSearch` | boolean | Enables web search only when the installed Codex CLI supports it |

Run artifacts are available through:

```text
GET /api/run/{runId}/events
GET /api/run/{runId}/documents
```

Codex authentication helpers are available through:

```text
GET /api/codex/status
POST /api/codex/login
```

`/api/codex/status` returns readiness flags only. `/api/codex/login` starts the local Codex CLI login flow so the user can choose ChatGPT in the browser.

### Local Document Intake

1. Open a deal workspace.
2. Select **Documents**.
3. Upload rent rolls, T12s, offering memoranda, LOIs, PDFs, or XLSX files.
4. Quick-create uploads show per-file status and can retry failed files. If at least one file succeeds, you can open the workspace and keep working.
5. For CSV/TXT/MD files and supported XLSX rent-roll/T12 workbooks, click **Extract** and review the preview.
6. Use **Select Safe Fields** for apply-ready fields, confirm conflicts if needed, review the before/after change summary, then apply them to deal inputs.
7. Use **Reject Selected** for bad candidates or **Waive Selected** for deferred fields that should remain visible but not silently change deal inputs.

Runtime uploads live under `data/deals/{dealId}/documents/`. Extraction previews live under `data/deals/{dealId}/extractions/`. These local deal files are ignored by git.

PDF extraction is review-first: text-based PDFs can produce page-backed candidate fields, and readable scanned/image-only PDFs route through the local OCR bridge before returning candidate fields with confidence, warnings, raw snippets, and page provenance. XLSX extraction is intentionally narrow and review-first: supported rent rolls can use alternate unit/layout/rent/status headers, blank rows, total rows, and common occupancy conventions; supported T12 workbooks can use one or more sheets as long as one sheet has recognizable line-item/account labels and a total, annual, trailing-12, or rightmost numeric column. Unsupported shapes remain stored source files with extraction pending, OCR metadata, or parser warnings rather than silently changing deal inputs. Known unsupported shapes include password-protected workbooks, unreadable or table-heavy scanned files, heavily merged summary layouts, rent rolls without unit identifiers, T12s without line-item labels, and formulas that do not expose cached numeric values.

Package exports live under `data/deals/{dealId}/packages/` and include approved inputs, source references, assumptions, open questions, red flags, and source-backed launch readiness.

---

## Port Configuration

### Changing the Vite Dev Server Port (Default: 5173)

If port 5173 conflicts with another process, edit `dashboard/vite.config.ts`:

```typescript
export default defineConfig({
  // ...
  server: {
    port: 3000,  // Change to desired port
  },
})
```

Then access the dashboard at `http://localhost:3000`.

### Changing the Watcher/API Ports (Defaults: 8080 and 8081)

If port 8080 or 8081 conflicts, edit `dashboard/server/watcher.ts`:

```typescript
const WS_PORT = 8080;  // WebSocket port
const API_PORT = 8081; // REST API port
```

You must also update the URLs in the frontend hooks:

```typescript
const WS_URL = 'ws://localhost:8080'
const API_URL = 'http://localhost:8081'
```

After changing ports, restart the dashboard: stop the process and run `npm run dashboard` again.

---

## Multi-Browser Support

The dashboard works in all modern browsers:

| Browser | Supported | Notes |
|---------|-----------|-------|
| Chrome | Yes | Recommended. Best developer tools for debugging. |
| Firefox | Yes | Full support. |
| Edge | Yes | Full support (Chromium-based). |
| Safari | Yes | WebSocket support confirmed. |

Multiple browser windows can connect to the same dashboard simultaneously. All receive the same real-time updates.

---

## Stopping the Dashboard

Press `Ctrl+C` in the terminal where `npm run dashboard` is running. This stops both the Vite server and the file watcher.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank page at localhost:5173 | Vite dev server not running | Run `npm run dashboard` |
| "Cannot find module" error | Dependencies not installed | Run `npm run setup` |
| Port 5173 in use | Another process occupying the port | Kill the process or change the port (see above) |
| Port 8080 in use | Another process occupying the port | Kill the process or change the port (see above) |
| "Disconnected" status | Watcher crashed or was not started | Restart with `npm run dashboard` |
| Phase progress stuck at 0% | Watcher cannot find checkpoint files | Verify `data/status/{deal-id}.json` exists. Check that the watcher's watch path matches your data directory. |
| Log viewer empty | Pipeline has not started yet | Logs appear only after agents begin executing. Launch the pipeline first. |
| Codex run button fails immediately | Codex CLI is missing or not logged in | In the Workflow Launcher, choose Codex / ChatGPT and click **Login to ChatGPT**. Or run `npm run codex:status`, then `codex login` and choose ChatGPT |
| Login to ChatGPT button does not open a login flow | Codex CLI is missing or the API server is not running | Run `npm run setup`, then restart `npm run dashboard` and retry |
| Codex run completes but Package is empty | Browser is viewing a different deal or stale run | Reopen the deal workspace and verify `data/status/{dealId}/run-{runId}-documents.json` exists |
| Stale data after pipeline re-run | Browser cache showing old data | Hard refresh (Ctrl+Shift+R) or clear browser cache |
| Watcher shows file change events but UI doesn't update | WebSocket message format mismatch | Check browser console for errors. Ensure watcher and frontend versions match. |

### Checking Watcher Health

Open the browser developer console (F12) and look for WebSocket messages:

```
WebSocket connected to ws://localhost:8080
Received: { type: "checkpoint", phase: "due-diligence", ... }
```

If you see connection errors, the watcher may not be running or the port may be blocked.

---

## Running in Production Mode

For a production build (optimized, no hot reload):

```powershell
npm --prefix dashboard run build
```

This outputs static files to `dashboard/dist/`. Serve them with any static file server. Note that the watcher still needs to run separately for real-time updates.

---

## Cross-References

- Software prerequisites: [Prerequisites](PREREQUISITES.md)
- Full troubleshooting: [Troubleshooting](TROUBLESHOOTING.md)
- Understanding dashboard data: [Interpreting Results](INTERPRETING-RESULTS.md)
- System architecture: [Architecture](ARCHITECTURE.md)
