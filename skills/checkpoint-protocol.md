# Checkpoint Protocol

## Purpose

Enable mid-task recovery. Every agent writes checkpoints so work is never lost. If a session ends -- whether due to a timeout, crash, user interruption, or context window exhaustion -- the next session resumes from the last checkpoint without repeating completed work.

Checkpoints are the backbone of reliability in a multi-agent orchestration system. Without them, any interruption means starting from scratch, wasting time, API calls, and operator patience. With them, the system is resilient: agents pick up exactly where they left off.

**Core Principle:** After every significant step, write a checkpoint. If you can't afford to lose it, checkpoint it.

---

## Quick Reference

### Canonical Paths
| Path | Purpose |
|------|---------|
| `data/status/{deal-id}.json` | Master checkpoint (all phases) |
| `data/status/{deal-id}/agents/{agent-name}.json` | Per-agent checkpoint |
| `data/logs/{deal-id}/{phase}.log` | Phase log file |
| `data/status/{deal-id}.json` | Human-readable session state |

### Standard Log Format
```
[{ISO-timestamp}] [{agent-name}] [{level}] {message}
```
Levels: `INFO`, `WARN`, `ERROR`, `DEBUG`

### Checkpoint Lifecycle
```
START → Read checkpoint → If exists: RESUME from last step
                        → If not: START from Step 1
WORK  → Complete step → Write checkpoint with updated last_checkpoint
DONE  → Write final checkpoint with status: COMPLETE
ERROR → Write checkpoint with status: ERROR, preserve partial work
```

### Phase Names (for log paths)
| Phase | Log File |
|-------|----------|
| Due Diligence | `data/logs/{deal-id}/due-diligence.log` |
| Underwriting | `data/logs/{deal-id}/underwriting.log` |
| Financing | `data/logs/{deal-id}/financing.log` |
| Legal | `data/logs/{deal-id}/legal.log` |
| Closing | `data/logs/{deal-id}/closing.log` |

---

## 3-Tier System

The checkpoint system uses three tiers, each serving a different audience and purpose.

### Tier 1: data/status/{deal-id}.json (Human-Readable)

**Path:** `data/status/{deal-id}.json` (project root)

**Audience:** Human operators who open the project and need to understand current status at a glance.

**Format:** Markdown with clear headings, bullet points, and status indicators.

**Contains:**
- Current deal being analyzed
- Current phase and sub-phase
- Which agents have completed, which are running, which are pending
- Key findings so far
- Any errors or data gaps encountered
- What needs to happen next
- Timestamp of last update

**Updated:** By the master orchestrator after every phase transition, agent completion, or significant status change. Not updated by individual agents directly.

**Example structure:**
```markdown
# Session State
Last Updated: 2025-01-15T14:45:00Z

## Active Deal: deal-2025-001 (123 Main St, Austin TX)
Status: Phase 1 - Due Diligence (In Progress)

## Agent Status
- [COMPLETE] ownership-agent: 3 transfers found, 1 lien, risk LOW
- [COMPLETE] zoning-agent: R-4 zoning confirmed, 50-unit max
- [RUNNING] environmental-agent: Querying EPA databases
- [PENDING] financial-agent: Waiting for T-12 data
- [PENDING] market-comp-agent: Waiting for phase start

## Key Findings
- Property flipped 3x in 5 years (potential concern)
- Zoning supports intended use

## Next Steps
- Environmental agent completing EPA queries
- Financial agent needs T-12 operating statement (DATA GAP)
```

### Tier 2: Master Checkpoint (Machine-Readable)

**Path:** `data/status/{deal-id}.json`

**Audience:** The master orchestrator. This is the authoritative record of deal progress.

**Format:** JSON with a defined schema.

**Contains:**
- Deal metadata (ID, address, property type)
- Current phase
- All agent statuses with their outputs
- Phase completion flags
- Error history
- Timestamps

**Updated:** By the master orchestrator after every agent status change.

**Schema:**
```json
{
  "dealId": "deal-2025-001",
  "address": "123 Main St, Austin TX",
  "propertyType": "multifamily",
  "currentPhase": "phase-1-due-diligence",
  "phaseStatus": "in-progress",
  "startedAt": "2025-01-15T14:30:00Z",
  "lastUpdated": "2025-01-15T14:45:00Z",
  "agents": {
    "ownership-agent": {
      "status": "complete",
      "startedAt": "2025-01-15T14:30:05Z",
      "completedAt": "2025-01-15T14:33:00Z",
      "outputPath": "data/analysis/deal-2025-001/ownership.json",
      "riskScore": 15,
      "keyFindings": ["3 transfers in 5 years", "1 active lien"],
      "errors": []
    },
    "environmental-agent": {
      "status": "running",
      "startedAt": "2025-01-15T14:33:10Z",
      "completedAt": null,
      "resumePoint": "epa-echo-query",
      "outputPath": null,
      "errors": []
    }
  },
  "phases": {
    "phase-1-due-diligence": "in-progress",
    "phase-2-underwriting": "pending",
    "phase-3-risk-scoring": "pending"
  },
  "errors": [],
  "dataGaps": ["T-12 operating statement not provided"]
}
```

### Tier 3: Agent Checkpoints (Per-Agent State)

**Path:** `data/status/{deal-id}/agents/{agent-name}.json`

**Audience:** Individual agents resuming their own work.

**Format:** JSON matching the agent checkpoint schema (see `templates/agent-checkpoint.json`).

**Contains:**
- Agent name and assigned task
- Current status (pending, running, complete, failed)
- Resume point (which step to pick up from)
- Steps completed so far
- Partial outputs collected
- Errors encountered
- Timestamps

**Updated:** By the agent itself after every significant step.

**Schema:**
```json
{
  "agentName": "ownership-agent",
  "dealId": "deal-2025-001",
  "task": "Analyze ownership chain and title history",
  "status": "running",
  "startedAt": "2025-01-15T14:30:05Z",
  "lastUpdated": "2025-01-15T14:32:15Z",
  "resumePoint": "lien-search",
  "stepsCompleted": [
    "deed-history-search",
    "transfer-analysis"
  ],
  "stepsPending": [
    "lien-search",
    "title-dispute-check",
    "risk-scoring",
    "output-generation"
  ],
  "partialOutputs": {
    "transfers": [
      {"date": "2024-03-15", "from": "Smith LLC", "to": "Jones Holdings"},
      {"date": "2022-08-01", "from": "Austin Realty", "to": "Smith LLC"},
      {"date": "2020-11-20", "from": "Original Owner", "to": "Austin Realty"}
    ]
  },
  "errors": [],
  "dataGaps": []
}
```

---

## Agent Checkpoint Protocol

Every agent follows this exact protocol:

### Step 1: Read Existing Checkpoint on Start

Before doing any work, check if a checkpoint exists:

```
Read data/status/{deal-id}/agents/{agent-name}.json
```

- If the file exists and `status` is `"complete"` -- the agent's work is already done. Report completion to the orchestrator and exit.
- If the file exists and `status` is `"running"` or `"failed"` -- a previous session was interrupted. Resume from `resumePoint`.
- If the file does not exist -- this is a fresh start. Create the checkpoint with `status: "pending"`.

### Step 2: Resume from Checkpoint (If Applicable)

If `resumePoint` exists in the checkpoint:

1. Read the `stepsCompleted` array to know what is already done
2. Read `partialOutputs` to recover any data already collected
3. Skip directly to the step named in `resumePoint`
4. Do NOT repeat completed steps -- their outputs are already in `partialOutputs`

### Step 3: Checkpoint After Each Significant Step

After completing each step in the agent's workflow:

1. Add the step name to `stepsCompleted`
2. Remove the step name from `stepsPending`
3. Update `resumePoint` to the NEXT step in the workflow
4. Save any outputs from this step to `partialOutputs`
5. Update `lastUpdated` to the current timestamp
6. Write the updated checkpoint to the agent's checkpoint file

### Step 4: On Completion

When the agent finishes all work:

1. Set `status` to `"complete"`
2. Set `resumePoint` to `null`
3. Set `stepsCompleted` to the full list of all steps
4. Set `stepsPending` to an empty array
5. Write all final outputs to the designated output file
6. Update the checkpoint with the output file path
7. Log a COMPLETE entry to the phase log

### Step 5: On Error

When the agent encounters an unrecoverable error:

1. Set `status` to `"failed"`
2. Add the error details to the `errors` array (include message, step, timestamp)
3. Keep `resumePoint` at the failed step (so retry starts there)
4. Preserve all `partialOutputs` collected so far
5. Write the checkpoint
6. Log an ERROR entry to the phase log

---

## Orchestrator Checkpoint Protocol

The master orchestrator manages the Tier 2 checkpoint and coordinates all agents:

### Step 1: Read Master Checkpoint

```
Read data/status/{deal-id}.json
```

If no checkpoint exists, create one with all agents in `"pending"` status.

### Step 2: Evaluate Agent States

For each agent in the checkpoint:

| Agent Status | Orchestrator Action |
|-------------|---------------------|
| `complete` | Use cached output from `outputPath`. Do not re-launch. |
| `failed` | Re-launch with error context. Include the error from the checkpoint so the agent can adjust its approach. |
| `running` | Check if still alive. If the session is fresh (resume scenario), treat as interrupted -- the agent will self-resume via its own checkpoint. |
| `pending` | Check if dependencies are met. If yes, launch. If no, skip for now. |

### Step 3: Update Master Checkpoint

After every agent status change:

1. Update the agent's entry in the master checkpoint
2. Check if all agents in the current phase are complete
3. If all complete, advance `currentPhase` to the next phase
4. Update `lastUpdated`
5. Write the master checkpoint

### Step 4: Update data/status/{deal-id}.json

After every significant status change (agent completion, phase transition, new error):

1. Read the current data/status/{deal-id}.json
2. Update all sections to reflect current state
3. Write the updated data/status/{deal-id}.json

---

## Resume Logic

When a new session begins and needs to resume previous work, follow this step-by-step process:

### 1. Read Master Checkpoint
```
Read data/status/{deal-id}.json
```
This tells you where the deal stands overall.

### 2. Determine Current Phase
Look at `currentPhase` and `phaseStatus`. If the phase is `"complete"`, move to the next phase. If `"in-progress"`, resume it.

### 3. Read Phase Agent States
For each agent in the current phase, read its status from the master checkpoint.

### 4. Skip Completed Agents
Any agent with `status: "complete"` is done. Its outputs are available at `outputPath`. Do not re-launch.

### 5. Re-Launch Failed Agents
Any agent with `status: "failed"` should be re-launched. Include:
- The original task parameters
- The error message from the previous attempt
- The `resumePoint` so the agent knows where it failed
- Any `partialOutputs` already collected

The agent will read its own Tier 3 checkpoint and resume from there.

### 6. Launch Pending Agents
Any agent with `status: "pending"` whose dependencies are met should be launched. Dependencies are typically:
- Input data is available (e.g., rent roll, property address)
- Prerequisite agents have completed (if any)

### 7. Update All Checkpoints
After determining the action for each agent, update both the master checkpoint (Tier 2) and data/status/{deal-id}.json (Tier 1).

---

## Checkpoint File Paths

Template paths for all checkpoint and log files:

| File | Path Template | Updated By |
|------|--------------|------------|
| Session state (human) | `data/status/{deal-id}.json` | Master orchestrator |
| Master checkpoint | `data/status/{deal-id}.json` | Master orchestrator |
| Agent checkpoint | `data/status/{deal-id}/agents/{agent-name}.json` | Individual agent |
| Phase log | `data/logs/{deal-id}/{phase}.log` | All agents in that phase |
| Master log | `data/logs/{deal-id}/master.log` | Master orchestrator |
| Agent output | `data/analysis/{deal-id}/{agent-name}.json` | Individual agent |

**Variable substitution:**
- `{deal-id}`: e.g., `deal-2025-001`
- `{agent-name}`: e.g., `ownership-agent`, `zoning-agent`, `environmental-agent`
- `{phase}`: e.g., `phase-1-due-diligence`, `phase-2-underwriting`

---

## Implementation

### Reading a Checkpoint

```
// Agent startup:
1. checkpoint = Read("data/status/{deal-id}/agents/{agent-name}.json")

2. If checkpoint exists:
   a. Parse JSON
   b. If status == "complete":
      - Log: "[TIMESTAMP] [{agent-name}] [ACTION] Checkpoint shows work already complete. Exiting."
      - Return cached outputs
   c. If status == "running" or "failed":
      - Log: "[TIMESTAMP] [{agent-name}] [ACTION] Resuming from checkpoint. Resume point: {resumePoint}"
      - Load partialOutputs into working memory
      - Skip to resumePoint step
   d. If status == "pending":
      - Log: "[TIMESTAMP] [{agent-name}] [ACTION] Fresh start. No previous work found."
      - Begin from first step

3. If checkpoint does not exist:
   - Create initial checkpoint with status "pending"
   - Write to data/status/{deal-id}/agents/{agent-name}.json
   - Begin from first step
```

### Writing a Checkpoint (After Each Step)

```
// After completing step "deed-history-search":
1. Read current checkpoint from data/status/{deal-id}/agents/{agent-name}.json

2. Update fields:
   - Move "deed-history-search" from stepsPending to stepsCompleted
   - Set resumePoint to next step (e.g., "transfer-analysis")
   - Add any outputs from this step to partialOutputs
   - Set lastUpdated to current ISO timestamp

3. Write updated checkpoint back to data/status/{deal-id}/agents/{agent-name}.json

4. Log: "[TIMESTAMP] [{agent-name}] [ACTION] Checkpoint saved. Completed: deed-history-search. Next: transfer-analysis"
```

### Writing a Completion Checkpoint

```
// After all steps are done:
1. Read current checkpoint

2. Update fields:
   - status = "complete"
   - resumePoint = null
   - stepsPending = []
   - stepsCompleted = [all steps]
   - Set completedAt to current ISO timestamp
   - Set lastUpdated to current ISO timestamp

3. Write final outputs to data/analysis/{deal-id}/{agent-name}.json

4. Write updated checkpoint to data/status/{deal-id}/agents/{agent-name}.json

5. Log: "[TIMESTAMP] [{agent-name}] [COMPLETE] All steps finished. Output written to data/analysis/{deal-id}/{agent-name}.json"
```

### Writing an Error Checkpoint

```
// On unrecoverable error:
1. Read current checkpoint

2. Update fields:
   - status = "failed"
   - Add to errors array: { "step": "{current-step}", "message": "{error-message}", "timestamp": "{ISO timestamp}" }
   - Keep resumePoint at the failed step
   - Preserve all partialOutputs
   - Set lastUpdated to current ISO timestamp

3. Write updated checkpoint to data/status/{deal-id}/agents/{agent-name}.json

4. Log: "[TIMESTAMP] [{agent-name}] [ERROR] Failed at step {current-step}: {error-message}. Checkpoint saved for retry."
```

### Orchestrator Checkpoint Update Pattern

```
// After an agent reports status change:
1. Read master checkpoint from data/status/{deal-id}.json

2. Update the agent's entry:
   - Set new status
   - Update outputPath if complete
   - Update error info if failed

3. Check phase completion:
   - If ALL agents in currentPhase have status "complete" or "failed":
     - Set phaseStatus to "complete" (or "complete-with-errors" if any failed)
     - Advance currentPhase to next phase if applicable

4. Set lastUpdated to current ISO timestamp

5. Write updated master checkpoint to data/status/{deal-id}.json

6. Update data/status/{deal-id}.json with new status information

7. Log: "[TIMESTAMP] [master-orchestrator] [ACTION] Updated checkpoint. {agent-name} now {status}. Phase: {phaseStatus}"
```

---

## How Agents Use This Skill

### When to Read

- **ALL agents** (mandatory on every startup): Every agent must read this document before doing any work. The checkpoint protocol defines how agents recover from interruptions, avoid repeating work, and preserve partial results. An agent that does not follow this protocol will lose its work on any session interruption.
- **ALL orchestrators** (mandatory on every startup and after every agent status change): Orchestrators must understand both their own checkpoint responsibilities (Tier 2 master checkpoint, Tier 1 data/status/{deal-id}.json) and how to interpret agent checkpoints (Tier 3) when evaluating agent status, deciding whether to re-launch failed agents, or advancing phases.

### What to Cross-Reference

- **Agent's own checkpoint file for resume state**: On startup, always read `data/status/{deal-id}/agents/{agent-name}.json` first. This file tells the agent whether to start fresh, resume from a specific step, or exit because work is already complete. Never skip this read -- it is the single most important operation an agent performs on startup.
- **Master checkpoint for phase state**: Orchestrators must read `data/status/{deal-id}.json` to understand the current phase, which agents have completed, which have failed, and which are pending. This drives all orchestrator decisions about agent launching, phase advancement, and error handling.
- **Upstream agent outputs for data availability**: Before starting work that depends on another agent's output, check that the upstream agent's checkpoint shows `status: "complete"` and that the `outputPath` file exists. If the upstream agent failed or is still running, the dependent agent cannot proceed -- it should log a DATA_GAP and wait.

### How to Apply

- **On startup**: Read the agent's checkpoint file. If `status` is `"complete"`, log completion and exit. If `status` is `"running"` or `"failed"`, load `partialOutputs` and skip to `resumePoint`. If the checkpoint does not exist, create an initial checkpoint with `status: "pending"` and start from Step 1.
- **After each significant step**: Write the checkpoint with updated `stepsCompleted`, `stepsPending`, `resumePoint` (set to the next step), and `partialOutputs`. Update `lastUpdated` to the current timestamp. This ensures that if the session ends unexpectedly, the next session picks up from the last completed step.
- **On completion or error**: On success, set `status` to `"complete"`, clear `resumePoint`, and write final outputs. On error, set `status` to `"failed"`, keep `resumePoint` at the failed step, preserve `partialOutputs`, and add the error to the `errors` array. Both cases require writing the checkpoint immediately.

### Common Mistakes

- **Forgetting to write a checkpoint after significant work**: If an agent completes three steps but only writes a checkpoint after the first, a session interruption after step 3 forces the agent to redo steps 2 and 3 on resume. Write a checkpoint after every step that produces data you cannot afford to lose.
- **Not preserving `partialOutputs` on error**: When an agent fails at step 5 of 8, steps 1-4 may have produced valuable partial results. If the error checkpoint does not include these partial outputs, the retry session starts with no data and must repeat all completed steps. Always preserve `partialOutputs` in the error checkpoint.
- **Repeating completed steps instead of reading the checkpoint**: Some agents skip the checkpoint read and start from scratch every time. This wastes time, API calls, and operator patience. The checkpoint exists to prevent exactly this problem. Always read the checkpoint first and honor the `stepsCompleted` list.
