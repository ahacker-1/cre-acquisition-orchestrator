# Launch Procedures

Five ways to launch and operate the CRE Acquisition Orchestration System. Each procedure includes exact commands, expected behavior, and what to watch for.

For the quick-reference version, see [LAUNCH.md](../LAUNCH.md) in the project root.

---

## Procedure 1: Full Pipeline

Run a complete 5-phase acquisition analysis from scratch.

### Prerequisites

- `config/deal.json` populated with your deal data (see [DEAL-CONFIGURATION.md](DEAL-CONFIGURATION.md))
- `config/thresholds.json` reviewed and adjusted if needed (see [THRESHOLD-CUSTOMIZATION.md](THRESHOLD-CUSTOMIZATION.md))
- Dashboard running (optional but recommended)

### Commands

**Terminal 1 -- Dashboard (optional):**
```bash
cd dashboard
npm install    # first time only
npm run dev
```

**Terminal 2 -- Pipeline:**
```bash
claude
```

Once Claude Code is running, paste this prompt:

```
Read orchestrators/master-orchestrator.md and config/deal.json.

Launch the full CRE acquisition pipeline for the deal described in config/deal.json.
Follow the master orchestrator instructions exactly. Execute all 5 phases:
Due Diligence, Underwriting, Financing, Legal, and Closing.

Write all checkpoints to data/status/.
Write all logs to data/logs/.
Write all reports to data/reports/.
Update data/status/<deal-id>.json after every phase event.
```

### Expected Behavior

1. Master orchestrator reads deal config, thresholds, and agent registry
2. Creates fresh checkpoint at `data/status/{deal-id}.json`
3. Updates `data/status/<deal-id>.json` with deal summary
4. Launches Phase 1: Due Diligence (7 agents, 5 in parallel + 2 sequential)
5. After DD completes, launches Phase 2: Underwriting (3 agents, sequential)
6. After DD reaches 80%+, launches Phase 4: Legal (early start, 5 of 6 agents)
7. After UW completes, launches Phase 3: Financing (3 agents)
8. After Financing completes, Legal launches loan-doc-reviewer (6th agent)
9. After all prior phases complete, launches Phase 5: Closing (2 agents)
10. Produces final report with Go/No-Go verdict at `data/reports/{deal-id}/final-report.md`

### What to Watch For

| Signal | Meaning |
|--------|---------|
| `data/status/<deal-id>.json` updates | Pipeline is progressing normally |
| Dashboard shows green phase status | Phase completed successfully |
| Yellow/amber phase status | Phase completed with conditions |
| Red phase status | Phase failed -- check logs |
| No dashboard updates for 10+ minutes | Check `data/logs/{deal-id}/master.log` for errors |
| "Pipeline finished. Verdict: PASS" in log | Analysis complete, deal recommended |

### Estimated Duration

A full pipeline typically takes 30-90 minutes depending on deal complexity, model speed, and web research latency. The majority of time is spent on Due Diligence (market research, environmental lookups) and Legal (estoppel tracking for large properties).

---

## Procedure 2: Dashboard Only

Start just the monitoring dashboard without running the pipeline. Useful for reviewing an in-progress or completed deal.

### Commands

```bash
cd dashboard
npm install    # first time only
npm run dev
```

### Expected Behavior

1. Vite dev server starts at `http://localhost:5173`
2. Dashboard reads checkpoint data from `data/status/`
3. Displays current or most recent deal status
4. If a pipeline is actively running in another terminal, dashboard updates in real-time
5. If no active pipeline, dashboard shows the last saved state

### What to Watch For

| Signal | Meaning |
|--------|---------|
| "No active deal" displayed | No checkpoint data found in `data/status/` |
| Stale timestamps | Pipeline is not currently running; showing historical data |
| WebSocket connection errors | Dashboard cannot read status files; check file permissions |

---

## Procedure 3: Resume Interrupted Pipeline

Pick up from the last checkpoint after a session interruption (terminal closed, power loss, rate limit, etc.).

### Prerequisites

- A previously started deal with checkpoint data in `data/status/{deal-id}.json`
- The same `config/deal.json` used for the original run (do not change deal config between runs)

### Commands

**Terminal 1 -- Dashboard (optional):**
```bash
cd dashboard
npm run dev
```

**Terminal 2 -- Resume:**
```bash
claude
```

Paste this prompt (replace `{deal-id}` with your actual deal ID):

```
Read orchestrators/master-orchestrator.md, config/deal.json, and data/status/{deal-id}.json.

Resume the CRE acquisition pipeline for deal {deal-id}.
The pipeline was previously interrupted. Check the checkpoint at data/status/{deal-id}.json
to determine which phases are complete, which are in progress, and which are pending.

For completed phases: skip them and use cached outputs from the checkpoint.
For in-progress or failed phases: re-launch from the phase orchestrator level.
For pending phases: launch when dependencies are met.

Continue until all 5 phases are complete and a final report is produced.
```

### Expected Behavior

1. Master orchestrator reads the existing checkpoint
2. Logs: `[ACTION] Skipping {phase} - already complete` for each completed phase
3. Re-launches the first incomplete phase with full context
4. Continues the pipeline from that point forward
5. All previously collected data (findings, metrics, reports) is preserved

### What to Watch For

| Signal | Meaning |
|--------|---------|
| "Skipping Due Diligence - already complete" | DD results preserved from previous run |
| "Resuming Underwriting from checkpoint" | Re-launching an interrupted phase |
| Progress jumps ahead | Completed phases are skipped, overall progress reflects prior work |
| Agent-level re-runs | If a phase orchestrator re-launches, it checks its own agent checkpoints and skips completed agents |

### How to Find Your Deal ID

```powershell
# List all deal checkpoints
Get-ChildItem data/status/

# Or check data/status/<deal-id>.json
Get-Content data/status/<deal-id>.json
```

---

## Procedure 4: Validation Run

Run pre-flight checks against synthetic test data without launching a real pipeline. Use this to verify the system is correctly installed and configured.

### Commands

```bash
claude
```

Paste this prompt:

```
Read validation/validation-runner.md.

Run the validation suite against the synthetic test deal.
Use validation/test-deal.json as the deal configuration.
Compare outputs against validation/expected-outputs/.
Report pass/fail for each phase and agent.

Do NOT write to production data directories. Use data/status/VALIDATION-TEST/ for any temporary state.
```

### Expected Behavior

1. Reads the validation runner prompt and synthetic test deal
2. Runs a subset of agents against known test data
3. Compares outputs to expected results in `validation/expected-outputs/`
4. Reports a pass/fail summary for each agent and phase
5. Does not affect any production deal data

### What to Watch For

| Signal | Meaning |
|--------|---------|
| All agents pass | System is correctly installed and configured |
| Agent failures | Check the specific agent prompt file and dependencies |
| Missing expected-outputs | Validation suite may not be fully populated yet |
| Network errors | Web research agents need internet access |

### When to Run Validation

- After initial setup, before your first real deal
- After upgrading Claude Code or changing model versions
- After modifying agent prompt files
- After changing threshold configurations significantly

---

## Procedure 5: Single Phase

Run just one phase of the pipeline in isolation. Useful for re-running a specific analysis with updated data or testing changes to a phase.

### Commands

```bash
claude
```

Choose the phase you want to run and paste the corresponding prompt:

**Due Diligence Only:**
```
Read orchestrators/due-diligence-orchestrator.md and config/deal.json.
Read config/thresholds.json and config/agent-registry.json.

Run the Due Diligence phase for the deal in config/deal.json.
Execute all 7 DD agents. Write outputs to data/phase-outputs/{deal-id}/due-diligence/.
Write the DD report to data/reports/{deal-id}/dd-report.md.
Update data/status/{deal-id}.json with DD phase results.
```

**Underwriting Only (requires DD outputs):**
```
Read orchestrators/underwriting-orchestrator.md, config/deal.json, and data/status/{deal-id}.json.
Read config/thresholds.json.

Run the Underwriting phase for deal {deal-id}.
Use the DD outputs from the checkpoint as input data.
Execute all 3 UW agents. Write the UW report to data/reports/{deal-id}/underwriting-report.md.
```

**Financing Only (requires UW outputs):**
```
Read orchestrators/financing-orchestrator.md, config/deal.json, and data/status/{deal-id}.json.
Read config/thresholds.json.

Run the Financing phase for deal {deal-id}.
Use the UW outputs from the checkpoint as input data.
Execute all 3 Financing agents. Write the report to data/reports/{deal-id}/financing-report.md.
```

**Legal Only (requires DD outputs; loan-doc-reviewer needs Financing):**
```
Read orchestrators/legal-orchestrator.md, config/deal.json, and data/status/{deal-id}.json.
Read config/thresholds.json.

Run the Legal phase for deal {deal-id}.
Use the DD outputs from the checkpoint. If financing data is available, also provide it.
Execute all 6 Legal agents. Write the report to data/reports/{deal-id}/legal-report.md.
```

**Closing Only (requires all prior phase outputs):**
```
Read orchestrators/closing-orchestrator.md, config/deal.json, and data/status/{deal-id}.json.
Read config/thresholds.json.

Run the Closing phase for deal {deal-id}.
All prior phases must be complete. Use their outputs from the checkpoint.
Execute both Closing agents. Write the report to data/reports/{deal-id}/closing-report.md.
```

### Expected Behavior

- The phase orchestrator runs its specialist agents
- Outputs are written to the deal-specific directories
- The checkpoint is updated with phase results
- No other phases are launched

### What to Watch For

| Signal | Meaning |
|--------|---------|
| "Missing upstream data" errors | You are trying to run a phase without its required inputs |
| Partial results | Some agents may fail if dependent data is missing |
| Checkpoint overwrite | Running a single phase overwrites that phase's checkpoint data |

### Phase Dependencies Reminder

| Phase | Requires |
|-------|----------|
| Due Diligence | Nothing (can always run standalone) |
| Underwriting | DD outputs in checkpoint |
| Financing | UW outputs in checkpoint |
| Legal | DD outputs (partial OK); Financing outputs for loan-doc-reviewer |
| Closing | All 4 prior phases complete |

---

## Quick Reference Table

| Procedure | Use Case | Time Estimate |
|-----------|----------|---------------|
| Full Pipeline | New deal analysis, end-to-end | 30-90 minutes |
| Dashboard Only | Monitor or review deal status | Instant |
| Resume Pipeline | Continue after interruption | Depends on remaining phases |
| Validation Run | Verify system installation | 10-15 minutes |
| Single Phase | Re-run specific analysis | 5-30 minutes per phase |

---

## See Also

- [LAUNCH.md](../LAUNCH.md) -- Quick-start commands (project root)
- [FIRST-DEAL-GUIDE.md](FIRST-DEAL-GUIDE.md) -- Complete first deal walkthrough
- [ARCHITECTURE.md](ARCHITECTURE.md) -- System design and phase dependencies
