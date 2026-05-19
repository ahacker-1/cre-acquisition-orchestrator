# WebSocket Events

Local dashboard socket URL: `ws://127.0.0.1:8080`. In Vite dev, the client can connect through `/ws` on the dev origin. The server origin-checks browser requests and sends a full initial snapshot followed by incremental file/run updates.

## Envelope Types

### `initial`

Sent immediately after a client connects.

```json
{
  "type": "initial",
  "checkpoints": {},
  "logs": {},
  "events": {},
  "documents": {}
}
```

### `checkpoint`

Sent when a checkpoint JSON file is added or changed. `path` is relative to the watched status root.

```json
{
  "type": "checkpoint",
  "path": "parkview-2026-001.json",
  "data": {
    "dealId": "parkview-2026-001",
    "status": "RUNNING",
    "overallProgress": 40
  }
}
```

### `log`

Sent when new log lines are appended.

```json
{
  "type": "log",
  "path": "parkview-2026-001/master.log",
  "lines": [
    "[2026-05-19T20:00:00.000Z] [orchestrator] [INFO] Started"
  ]
}
```

### `event`

Sent for a story event parsed from run NDJSON.

```json
{
  "type": "event",
  "path": "parkview-2026-001/run-local-123-events.ndjson",
  "event": {
    "runId": "local-123",
    "dealId": "parkview-2026-001",
    "seq": 4,
    "ts": "2026-05-19T20:00:00.000Z",
    "kind": "phase_started",
    "phase": "underwriting"
  }
}
```

### `run`

Sent whenever the run manager changes lifecycle state.

```json
{
  "type": "run",
  "event": "started",
  "runId": "local-123",
  "state": "RUNNING",
  "mode": "live",
  "speed": "normal",
  "timestamp": "2026-05-19T20:00:00.000Z",
  "details": {
    "pid": 1234,
    "workflowId": "full-acquisition-review"
  }
}
```

Run lifecycle `event` values are `started`, `state`, `stopped`, `exited`, and `error`. Run states are `IDLE`, `STARTING`, `RUNNING`, `STOPPING`, `COMPLETED`, `FAILED`, and `STOPPED`.

## Story Event Kinds

Story events use this base shape:

```json
{
  "runId": "local-123",
  "dealId": "parkview-2026-001",
  "seq": 1,
  "ts": "2026-05-19T20:00:00.000Z",
  "kind": "run_started"
}
```

Current emitted `kind` values:

| Kind | Meaning |
|---|---|
| `run_started` | A run began. |
| `run_completed` | A run completed. |
| `run_error` | A run failed or was interrupted. |
| `phase_started` | A phase began. |
| `phase_completed` | A phase completed. |
| `phase_failed` | A phase failed. |
| `phase_skipped` | A scoped workflow skipped a phase. |
| `agent_started` | An agent began work. |
| `agent_planned` | An agent was selected/planned. |
| `agent_completed` | An agent completed work. |
| `agent_failed` | An agent failed. |
| `milestone` | A notable run milestone occurred. |
| `decision_made` | The run recorded an underwriting or orchestration decision. |
| `document_created` | A generated artifact was registered. |
| `agent_message` | An agent produced a message. |
| `agent_handoff` | Context moved from one agent to another. |
| `agent_review` | An agent reviewed another output. |
| `agent_dependency` | A dependency relationship was recorded. |
| `phase_handoff` | Context moved between phases. |

## Communication Payload Example

Agent communication events may include `schemaVersion`, `phase`, `fromPhase`, `toPhase`, `fromAgent`, `toAgent`, `agent`, `messageType`, `title`, `summary`, `artifactRefs`, `threadId`, `correlationId`, `importance`, `requiresHuman`, `confidence`, `status`, `dependencyType`, `inputs`, `impact`, and `tags`.

```json
{
  "runId": "local-123",
  "dealId": "parkview-2026-001",
  "seq": 5,
  "ts": "2026-05-19T20:01:00.000Z",
  "kind": "agent_handoff",
  "schemaVersion": 1,
  "phase": "legal",
  "fromAgent": "quote-comparator",
  "toAgent": "psa-reviewer",
  "messageType": "handoff",
  "title": "Debt sizing constraints for PSA review",
  "summary": "Loan proceeds are DSCR constrained; preserve financing contingency protection.",
  "artifactRefs": [
    {
      "docId": "financing:quote-comparator:workpaper-v1"
    }
  ],
  "importance": "high",
  "requiresHuman": false,
  "confidence": 0.92
}
```

