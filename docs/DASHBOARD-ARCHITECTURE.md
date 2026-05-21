# Dashboard Architecture

A map of the dashboard for contributors. It explains how the React client
(`dashboard/src`) and the local Node server (`dashboard/server`) fit together,
how data flows from an operator action through the REST/WebSocket APIs and the
service layer into `data/`, and back out to the views.

For the exact API surface and message envelopes, see the companion docs:

- [API Reference](API-REFERENCE.md) — every REST route, request, and response.
- [WebSocket Events](WEBSOCKET-EVENTS.md) — the `initial` / `checkpoint` / `log` / `event` / `run` envelopes.
- [Dashboard Setup](DASHBOARD-SETUP.md) — how to run it locally.

> The dashboard is **local-first**: the server binds to loopback, origin-checks
> browser requests, and is intended for a single operator on `localhost`, not
> hosted multi-tenant production.

---

## Two processes, two ports

| Process | Entry | Port | Role |
|---------|-------|------|------|
| Client (Vite + React) | `dashboard/src/main.tsx` → `dashboard/src/App.tsx` | Vite dev server | UI; talks to the server over REST + WebSocket. |
| Server (watcher) | `dashboard/server/watcher.ts` | REST `8081`, WS `8080` | Serves REST routes, watches `data/`, broadcasts changes over WS, and spawns runs. |

In Vite dev the client reaches the server through a proxy: `config.ts` derives
`API_URL` (REST) and `WS_URL` (defaults to `/ws` on the dev origin, or
`ws://127.0.0.1:8080`). Both are overridable via `VITE_API_URL` / `VITE_WS_URL`.

```
Operator (browser)
   │
   │  REST (fetch)            WebSocket (live stream)
   ▼                              ▲
┌─────────────────── dashboard/server/watcher.ts ───────────────────┐
│  HTTP server :8081   ──►  service layer  ──►  reads/writes data/   │
│  WS server   :8080   ◄──  chokidar watches data/status & data/logs │
│  RunManager          ──►  spawns scripts/orchestrate.js | codex    │
└────────────────────────────────────────────────────────────────────┘
                                  │ writes
                                  ▼
                       data/  (status, logs, phase-outputs, runs, …)
```

The key idea: **REST is the command channel; the WebSocket is the read channel.**
The client issues commands (save deal, launch workflow, start run) over REST.
Those commands cause files to change under `data/`. The watcher detects those
file changes and pushes them to every connected client over the WebSocket. The
UI is therefore a projection of `data/` rather than holding its own source of
truth.

---

## Server (`dashboard/server`)

### `watcher.ts` — REST router + WebSocket broadcaster (the hub)

The single long-running entry point. It:

- Resolves a `dataRoot` (default `data/`, optionally an arg-supplied path that is
  asserted to live inside the project via `scripts/lib/safe-paths`).
- Starts an **HTTP server on `:8081`** (`createServer`) whose handler is a flat
  router: it matches `req.method` + `req.url` against the route table and
  delegates to the service modules. Routes are grouped as Run Control
  (`/api/run/*`), Codex (`/api/codex/*`), Deal Library (`/api/deals`,
  `/api/deals/:id`), Workspace (`/api/deals/:id/workspace`, `/criteria`,
  `/documents`, `/documents/:docId/extract|extraction|apply-extraction|review-extraction`,
  `/ic-starter-package`, `/phase-state`), Workflows (`/api/workflows`,
  `/api/workflow-presets`, `/api/workflows/:id/launch`), and the swarm planner
  (`/api/swarm/plan`). Requests are origin/loopback-checked and ID path params
  must be safe slugs.
- Starts a **WebSocket server on `:8080`** (`WebSocketServer`). On connect it
  sends one `initial` snapshot (all checkpoints, logs, events, documents) plus
  the current run state, then keeps the client live via `broadcast()`.
- Uses **chokidar** to watch `data/status` (checkpoint JSON, story events) and
  `data/logs`. File adds/changes are converted into `checkpoint`, `log`, and
  `event` WS messages and broadcast to all clients. Log/event reads are
  incremental (tracked offsets) so only new lines are pushed.
- Owns a **`RunManager`** instance and forwards its `run` lifecycle messages over
  the same socket.

It loads several project-root modules via `createRequire`: `config/workflows.json`,
`config/agent-registry.json`, `scripts/lib/goal-helper`, `scripts/lib/runtime-core`,
`scripts/lib/codex-cli`, and `scripts/lib/safe-paths` — so the dashboard and the
CLI share one source of truth for phases, workflows, and the agent registry.

### `run-manager.ts` — run lifecycle + process spawning

Owns the single active run. Tracks a `RunStatus` (lifecycle `IDLE → STARTING →
RUNNING → STOPPING → COMPLETED|FAILED|STOPPED`, runtime provider, pid, timestamps,
exit code). On start it:

- Optionally validates the deal (`spawnSync('node', …)`), then
- **Spawns the runtime as a child process**: `scripts/orchestrate.js` for the
  `simulation` provider, or `scripts/codex-agent-runner.js` for the `codex`
  provider, with the chosen workflow/scenario/seed and Codex options.
- The spawned runtime is what actually writes checkpoints, logs, story events,
  and phase outputs into `data/` — which the watcher then streams to the UI.
- Emits `run` messages (`started`/`state`/`stopped`/`exited`/`error`) that the
  watcher broadcasts. Stop uses `taskkill` (tree kill) on Windows.

### `deal-service.ts` — deal library + validation

Lists saved (`user`) and bundled (`sample`) deals, loads a single deal, saves
user deals, validates deal configs (`draft` vs `launch` mode → `DealValidationResult`
with blocking issues vs warnings), and marks deals launched. This backs
`GET/POST /api/deals` and `GET /api/deals/:id`.

### `workspace-service.ts` — per-deal evidence + readiness

The richest service. Powers the deal workspace: `getDealWorkspace`,
`listDealDocuments`, `saveSourceDocument`, `extractSourceDocument`,
`getSourceExtraction`, `reviewSourceExtraction`, `applySourceExtraction`,
`saveDealCriteria`, `savePhaseState`, `evaluateLaunchReadiness`,
`buildRunInputSnapshot`, and `exportIcStarterPackage`. It manages the
source-document review loop (uploaded → parsed → review_ready → approved/applied)
and computes launch readiness, including the stale-source-evidence gate. It calls
into `parser-service.ts` for extraction.

### `parser-service.ts` — document extraction bridge

Turns uploaded XLSX/CSV/PDF documents into reviewable candidate fields with
provenance (file hash, parser id/version, sheet/row/column or page/line
location, confidence). It shells out to the Python parsers
`scripts/parse_excel.py` and `scripts/parse_pdf.py` via `spawnSync`, with paths
asserted inside the project root. When Python is unavailable it reports a
`parser-unavailable` status rather than crashing.

### `workflow-service.ts` — workflows + presets

Reads workflow definitions (sourced from `config/workflows.json`), lists and
saves operator launch presets, and resolves a workflow id to its phase/agent
selection. Backs `/api/workflows`, `/api/workflow-presets`, and feeds the launch
route.

---

## Client (`dashboard/src`)

### Entry and shell

- **`main.tsx`** mounts the app. **`config.ts`** resolves `API_URL` / `WS_URL`.
- **`App.tsx`** is the shell. It owns top-level UI state (which deal/workspace is
  open, modals for the deal library and the advanced workflow launcher, the
  upload "front door"), wires the data hooks, and decides whether to render the
  upload landing (`DropZoneHero` + `SavedDealsPanel`) or the `DealWorkspace`.
  Heavy routes (`DealWorkspace`, `WorkflowLauncher`) are `lazy`-loaded behind
  `Suspense` and wrapped in `ErrorBoundary`.

### Hooks (`src/hooks`) — the data layer

| Hook | Responsibility |
|------|----------------|
| `useCheckpointData.ts` | Opens the **WebSocket**, consumes `initial`/`checkpoint`/`log`/`event`/`run` envelopes, normalizes them into typed state (deal checkpoint, agent checkpoints, log entries, story events, document artifacts, run status), and auto-reconnects (up to 20 attempts, backoff capped at 30s). Also exposes `startLiveRun` / `stopRun` / `refreshRunStatus` via REST. |
| `useDealLibrary.ts` | REST CRUD against `/api/deals*`: list, load, validate, save, launch. |
| `useDealWorkspace.ts` | REST against `/api/deals/:id/*`: workspace, criteria, document extract/extraction/apply/review, IC-starter-package, phase-state. |
| `useWorkflows.ts` | REST against `/api/workflows` and `/api/workflow-presets`, plus `/api/workflows/:id/launch`. |

### Components — views

- **`DealWorkspace.tsx`** is the primary view once a deal is open. It is tabbed;
  the tabs (`WorkspaceTab` union) are:

  | Tab id | Label in UI | Shows |
  |--------|-------------|-------|
  | `mission` | Command | Mission control / pipeline overview and guided-demo entry. |
  | `documents` | Evidence | Source documents and the extraction review/apply loop. |
  | `agents` | Deal Team | Agent tree / per-agent cards and findings. |
  | `workpapers` | Workpapers | Generated phase report / workpaper output. |
  | `package` | IC Package | Completion package and IC-starter export. |
  | `advanced` | Controls | Advanced orchestration controls (workflow launcher, presets). |

  It also synthesizes per-phase tabs from the checkpoint and renders a guided
  demo tour. The initial tab is chosen from the `initialTab` prop App passes in.

- Supporting components include `MissionControl`, `PipelineView`, `AgentTree` /
  `AgentCard`, `FindingsPanel`, `DocumentWall`, `WorkflowLauncher`,
  `CompletionPackage`, `DealIntakeWizard`, `QuickDealCreate`, `SavedDealsPanel`,
  `StoryNarrative`, `TimelineView`, `LogStream`, and the `components/report/*`
  set that renders the structured deal report (executive summary, pro forma,
  sensitivity, risk, financing, legal/closing, etc.).

### `src/lib`, `src/types`, `src/config.ts`

- **`lib/dealForm.ts`** — deal-form construction/normalization helpers.
- **`lib/documentUpload.ts`** — client-side document upload to the documents API.
- **`types/`** — shared TypeScript contracts mirroring server payloads
  (`checkpoint.ts`, `deals.ts`, `phase-contracts.ts`, `workflows.ts`,
  `workspace.ts`).
- **`config.ts`** — `API_URL` / `WS_URL` resolution (see above).

---

## End-to-end data flow (operator → views)

1. **Operator acts** in the browser (uploads a package, edits deal criteria,
   reviews extracted fields, or launches a workflow).
2. **Client → REST.** A hook (`useDealLibrary` / `useDealWorkspace` /
   `useWorkflows` / `useCheckpointData`) issues a `fetch` to `:8081`.
3. **watcher.ts routes** the request to the matching **service** after
   origin/loopback and slug checks.
4. **Service touches `data/`.** `deal-service` / `workspace-service` /
   `workflow-service` read or write deal configs, source documents, extraction
   state, phase state, and presets under `data/`. A launch sends a request to
   the `RunManager`.
5. **RunManager spawns the runtime** (`scripts/orchestrate.js` or
   `scripts/codex-agent-runner.js`) for a launched run; that child process writes
   checkpoints, logs, story events, and phase outputs into
   `data/status`, `data/logs`, `data/phase-outputs`, `data/runs`, etc.
6. **chokidar detects** the file changes under the watched roots.
7. **WS broadcast.** `watcher.broadcast()` pushes `checkpoint` / `log` / `event`
   (and `run` lifecycle) messages to every connected client.
8. **Client renders.** `useCheckpointData` normalizes the messages into state,
   and `App.tsx` / `DealWorkspace.tsx` and its child views re-render — closing
   the loop from operator action to live UI without polling.

---

## Where to make changes

| Want to… | Touch |
|----------|-------|
| Add/modify a REST route | `dashboard/server/watcher.ts` (router) + the relevant service; document it in [API Reference](API-REFERENCE.md). |
| Add/modify a WS message | `watcher.ts` (`WatcherMessage` types + `broadcast`) + `useCheckpointData.ts`; document it in [WebSocket Events](WEBSOCKET-EVENTS.md). |
| Change deal validation rules | `dashboard/server/deal-service.ts`. |
| Change the source-doc review/readiness loop | `dashboard/server/workspace-service.ts`. |
| Change document parsing | `dashboard/server/parser-service.ts` + `scripts/parse_excel.py` / `scripts/parse_pdf.py`. |
| Change run spawning/lifecycle | `dashboard/server/run-manager.ts`. |
| Add a workspace tab or view | `dashboard/src/components/DealWorkspace.tsx` (+ a new component). |
| Change client API/WS endpoints | `dashboard/src/config.ts` and the `src/hooks/*`. |

---

## Cross-references

- [API Reference](API-REFERENCE.md)
- [WebSocket Events](WEBSOCKET-EVENTS.md)
- [Dashboard Setup](DASHBOARD-SETUP.md)
- [Architecture](ARCHITECTURE.md) — the orchestration/runtime side that produces `data/`.
- [Runtime Comparison](RUNTIME-COMPARISON.md) — simulation vs Codex providers.
