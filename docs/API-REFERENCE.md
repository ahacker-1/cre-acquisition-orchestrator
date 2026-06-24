# API Reference

Local dashboard API base URL: `http://127.0.0.1:8081`. The Vite dev proxy also serves these paths from the client origin. The API is local-first, origin-checked, and intended for loopback development rather than hosted production use.

## Common Behavior

- `403` means the request failed local origin or loopback checks.
- `404` means the route or requested deal/run artifact was not found.
- `413` means the request body exceeded the document upload size cap.
- `429` means the document mutation token bucket rejected the request.
- `500` means an unhandled local server or file operation failed.
- Path parameters that represent IDs must be safe slugs. Invalid IDs return `400`.

## Run Control

| Method | Path | Purpose | Request | Success |
|---|---|---|---|---|
| `GET` | `/api/run/status` | Return current run lifecycle state. | None | `RunStatus` |
| `POST` | `/api/run/start` | Start an offline simulation or live Codex run. | `StartRunRequest` with deal/scenario/workflow/runtime fields and optional Codex controls. | `202` with `runId`, `status`, `mode`, `speed`, `workflowId`, `runtimeProvider`, `pid`, `startedAt`. |
| `POST` | `/api/run/stop` | Stop the active run. | None | `{ "status": "stopping" | "idle", "runId": "...", "state": "...", "pid": 1234 }` |
| `GET` | `/api/run/:runId/events` | Read persisted story events for a run. | `runId` path param. | `{ "runId": "...", "path": "...", "events": [] }` |
| `GET` | `/api/run/:runId/documents` | Read generated document artifacts for a run. | `runId` path param. | `{ "runId": "...", "path": "...", "documents": [], "pending": false, "warning": "..." }` |

Optional live Codex controls accepted by launch requests:

- `runtimeProvider`: `"codex"` or `"simulation"`; omitted launch requests default to Codex where supported.
- `codexMaxAgents`: positive integer cap for the number of specialist agents to run; omit for the workflow's full catalog.
- `codexConcurrency`: positive integer parallelism for live Codex agents; omitted values use the runner default.
- `codexSearch`: boolean that forwards `--search` to the Codex CLI when `true`.
- `codexModel` and `codexSandbox`: optional CLI model and sandbox overrides for advanced local testing.

## Codex Runtime

| Method | Path | Purpose | Request | Success |
|---|---|---|---|---|
| `GET` | `/api/codex/status` | Return local Codex CLI installation/auth status. Loopback only. | None | `{ "installed": true, "loggedIn": true, "usingChatGpt": true, "version": "...", "loginStatus": "...", "storesCredentialsInRepo": false, "authStorage": "user-profile" }` |
| `POST` | `/api/codex/login` | Start detached `codex login`. Loopback only. | None | `202` with `{ "started": true, "pid": 1234, "message": "...", "codexStatus": {} }` |

## Deal Library

| Method | Path | Purpose | Request | Success |
|---|---|---|---|---|
| `GET` | `/api/deals` | List saved and sample deals. | None | `{ "deals": [], "suggestedDealId": "..." }` |
| `POST` | `/api/deals/validate` | Validate a draft or launch-ready deal payload. | `{ "deal": {}, "mode": "draft" | "launch", "currentDealId": "..." }` | `DealValidationResult` |
| `POST` | `/api/deals` | Save a user deal. | `{ "deal": {}, "mode": "draft" | "launch", "currentDealId": "..." }` | `DealRecordResponse` |
| `GET` | `/api/deals/:id` | Load one saved or sample deal. | `id` path param. | `DealRecordResponse` |
| `POST` | `/api/deals/:id/launch` | Launch the selected deal with the default workflow. | `{ "scenario": "...", "speed": "...", "mode": "...", "reset": false, "runtimeProvider": "codex" | "simulation", "codexMaxAgents": 3, "codexConcurrency": 2, "codexSearch": true, "requireSourceBackedInputs": false }` (`runtimeProvider` defaults to `codex`) | `LaunchDealResponse` plus `readiness` and `inputSnapshot`. |

## Workflows

| Method | Path | Purpose | Request | Success |
|---|---|---|---|---|
| `GET` | `/api/workflows` | Return workflow catalog from `config/workflows.json`. | None | `{ "version": 1, "defaultWorkflowId": "...", "workflows": [] }` |
| `GET` | `/api/workflow-presets` | List saved local workflow presets. | None | `{ "presets": [] }` |
| `POST` | `/api/workflow-presets` | Save a workflow preset. | `{ "name": "...", "workflowId": "...", "dealId": "...", "inputs": {} }` | `201` with `{ "preset": {} }` |
| `POST` | `/api/workflows/:workflowId/launch` | Launch a selected workflow. | `WorkflowLaunchRequest` with deal, scenario, speed, mode, `runtimeProvider`, `codexMaxAgents`, `codexConcurrency`, `codexSearch`, and source-backed input enforcement. | `WorkflowLaunchResponse` plus `workflow`, `deal`, `readiness`, and `inputSnapshot`. |
| `POST` | `/api/swarm/plan` | Convert a plain-English operator goal into a recommended workflow and specialist plan. | `{ "dealId": "...", "goal": "..." }` | `{ "workflowId": "...", "workflowName": "...", "agentPlan": [], "readiness": "...", "nextAction": "...", "launchRequest": {}, "deal": {} }` |

## Deal Workspace

| Method | Path | Purpose | Request | Success |
|---|---|---|---|---|
| `GET` | `/api/deals/:dealId/workspace` | Load the full operator workspace. | `dealId` path param. | `DealWorkspace` |
| `POST` | `/api/deals/:dealId/criteria` | Save underwriting criteria. | `DealCriteria` | `{ "criteria": {}, "deal": {} }` |
| `POST` | `/api/deals/:dealId/field-edit` | Apply an inline operator override to an approved source-backed deal field before launch. | `{ "path": "property.totalUnits", "value": 184, "label": "Total Units", "unit": "units", "note": "..." }` | `ApplyOperatorFieldEditResult` with `deal`, `approvedFields`, `field`, and `validation`. |
| `GET` | `/api/deals/:dealId/documents` | List source documents. | `dealId` path param. | `{ "documents": [] }` |
| `POST` | `/api/deals/:dealId/documents` | Upload a source document. | `{ "fileName": "...", "mime": "...", "size": 123, "contentBase64": "..." }` | `201` with `{ "document": {}, "documents": [] }` |
| `POST` | `/api/deals/:dealId/documents/:documentId/extract` | Create an extraction preview. | Route params only. | `{ "document": {}, "extraction": {} }` |
| `GET` | `/api/deals/:dealId/documents/:documentId/extraction` | Read an extraction preview. | Route params only. | `{ "extraction": {} }` |
| `POST` | `/api/deals/:dealId/documents/:documentId/apply-extraction` | Apply approved candidate fields. | `{ "fieldIds": ["..."], "confirmConflictReview": true }` | `ApplyExtractionResult` |
| `POST` | `/api/deals/:dealId/documents/:documentId/review-extraction` | Reject, waive, or review candidate fields. | `{ "fieldIds": ["..."], "reviewStatus": "rejected" | "waived" | "needs_review", "note": "..." }` | `ReviewExtractionResult` |
| `POST` | `/api/deals/:dealId/ic-starter-package` | Export the IC starter package. | `{ "workflowId": "..." }` | `IcStarterPackageExport` |
| `POST` | `/api/deals/:dealId/phase-state` | Save phase checklist and notes. | `{ "phaseSlug": "...", "checklist": [], "notes": "..." }` | `{ "phases": [] }` |

Successful field edits record the previous value and mark provenance as `operator-edited`; missing paths or values, non-editable fields, and validation-breaking edits return `400`.

## Legacy Checkpoint API

These routes remain for compatibility with earlier dashboard flows. Prefer `/api/deals/*` for new work.

| Method | Path | Purpose | Request | Success |
|---|---|---|---|---|
| `POST` | `/api/deal` | Create a legacy checkpoint. | Checkpoint-like object with `dealId`. | `201` with `{ "dealId": "...", "path": "...", "checkpoint": {} }` |
| `GET` | `/api/deal/:id` | Read legacy checkpoint status. | `id` path param. | `{ "deal": {}, "agents": [] }` |
| `POST` | `/api/deal/:id/pause` | Mark a legacy checkpoint paused. | `id` path param. | `{ "dealId": "...", "status": "paused", "lastUpdatedAt": "..." }` |
| `POST` | `/api/deal/:id/resume` | Mark a legacy checkpoint running. | `id` path param. | `{ "dealId": "...", "status": "running", "lastUpdatedAt": "..." }` |
