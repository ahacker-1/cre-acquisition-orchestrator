# Dashboard Setup

Guide to installing, configuring, and using the real-time monitoring dashboard for the CRE Acquisition Orchestration System.

---

## Overview

The dashboard provides a local-first operator cockpit for deal setup, source-document intake, workflow launch, and pipeline execution:

- **Deal workspace**: Overview, Underwriting, Due Diligence, Financing, Legal, Closing, Documents, and Package views for each deal
- **Workflow launcher**: Five outcome workflows with saved local presets and run-now launch
- **Document intake**: Upload, classify, extract, review, and apply source-backed inputs from local files
- **Phase progress**: Visual progress bars for each of the 5 phases, including skipped-phase visibility for scoped workflows
- **Agent status**: Per-agent status indicators (pending, running, complete, failed)
- **Log viewer**: Live log stream from all agents with filtering
- **Package viewer**: Read final reports, workpapers, findings, document manifests, and recommendation packages directly in the browser
- **Real-time updates**: WebSocket connection pushes updates as agents write checkpoints

The dashboard consists of three local components:
1. **Vite dev server** (port 5173): Serves the React frontend
2. **Watcher process** (port 8080): Monitors checkpoint/log files and pushes updates via WebSocket
3. **Local REST API** (port 8081): Serves deals, workflows, presets, document uploads, extraction previews, and run launch requests

---

## First-Time Setup

### Prerequisites

- Node.js 18+ installed
- npm 9+ installed

See [Prerequisites](PREREQUISITES.md) for full software requirements.

### Install Dependencies

```bash
cd dashboard
npm install
```

This installs all frontend dependencies (React, Vite, Tailwind CSS) and the watcher dependencies.

---

## Starting the Dashboard

```bash
cd dashboard
npm run dev
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
- **Completion Package**: Phase outcomes, workpapers, findings, decision log, document manifest, source-backed inputs, and final recommendation

### Operator Deal Hub

Open a saved deal to work inside its full lifecycle workspace:

| Workspace | What It Provides |
|-----------|------------------|
| Overview | Pipeline progress, criteria, source coverage, and embedded workflow launcher |
| Underwriting | Required documents, checklist, Agent Playbook, and underwriting workflow launch |
| Due Diligence | Diligence checklist, document coverage, Agent Playbook, and quick-screen launch |
| Financing | Debt assumptions, required lender package documents, and financing package workflow |
| Legal | PSA/title/survey readiness, legal Agent Playbook, and legal / PSA review workflow |
| Closing | Closing readiness checklist, required closing documents, and full review launch |
| Documents | Source-document upload, classification, extraction preview, and approved-field apply |
| Package | Completion package for the latest run |

### Local Document Intake

1. Open a deal workspace.
2. Select **Documents**.
3. Upload rent rolls, T12s, offering memoranda, LOIs, PDFs, or XLSX files.
4. For CSV/TXT/MD files, click **Extract** and review the preview.
5. Select fields to approve, confirm conflicts if needed, then apply them to deal inputs.

Runtime uploads live under `data/deals/{dealId}/documents/`. Extraction previews live under `data/deals/{dealId}/extractions/`. These local deal files are ignored by git.

PDF and XLSX files are stored and classified in v2.0.0, but deep extraction is intentionally marked pending.

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

After changing ports, restart the dashboard: stop the process and run `npm run dev` again.

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

Press `Ctrl+C` in the terminal where `npm run dev` is running. This stops both the Vite server and the file watcher.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank page at localhost:5173 | Vite dev server not running | Run `cd dashboard && npm run dev` |
| "Cannot find module" error | Dependencies not installed | Run `cd dashboard && npm install` |
| Port 5173 in use | Another process occupying the port | Kill the process or change the port (see above) |
| Port 8080 in use | Another process occupying the port | Kill the process or change the port (see above) |
| "Disconnected" status | Watcher crashed or was not started | Restart with `npm run dev` |
| Phase progress stuck at 0% | Watcher cannot find checkpoint files | Verify `data/status/{deal-id}.json` exists. Check that the watcher's watch path matches your data directory. |
| Log viewer empty | Pipeline has not started yet | Logs appear only after agents begin executing. Launch the pipeline first. |
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

```bash
cd dashboard
npm run build
```

This outputs static files to `dashboard/dist/`. Serve them with any static file server. Note that the watcher still needs to run separately for real-time updates.

---

## Cross-References

- Software prerequisites: [Prerequisites](PREREQUISITES.md)
- Full troubleshooting: [Troubleshooting](TROUBLESHOOTING.md)
- Understanding dashboard data: [Interpreting Results](INTERPRETING-RESULTS.md)
- System architecture: [Architecture](ARCHITECTURE.md)
