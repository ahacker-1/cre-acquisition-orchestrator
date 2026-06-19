# Troubleshooting

Symptom-based troubleshooting guide for the CRE Acquisition Orchestration System. Find your symptom in the table, identify the cause, and apply the fix.

---

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Pipeline won't start | Invalid or incomplete `deal.json` | Run pre-flight validation. Ensure all REQUIRED fields are populated. See [Deal Configuration](DEAL-CONFIGURATION.md) for field-by-field requirements. |
| Agent hangs / never completes | Context window exhaustion, a stalled live Codex run, or an interrupted deterministic run | For deterministic runs, resume with `node scripts/orchestrate.js --deal config/deal.json --resume`. For live Codex runs, inspect `data/codex-runs/{runId}/` and rerun the selected workflow. |
| Dashboard shows no data | Watcher process not started or no run has been generated yet | Run `npm run demo`, then start the dashboard with `npm run dashboard`. |
| Dashboard shows "Disconnected" | WebSocket connection lost between browser and watcher | Refresh the browser. If the issue persists, restart the watcher with `npm run dashboard`. |
| Source-backed XLSX/PDF extraction reports parser dependencies unavailable | `.venv` is missing or does not have `pandas`, `openpyxl`, and `pdfplumber` installed | Run `npm run setup`. For a read-only check, run `npm run setup -- --check`. If you intentionally only need the dashboard shell, rerun setup with `--skip-python-install`. |
| `npm run codex:status` does not show ChatGPT login | Codex CLI is missing or authenticated with a different method | In the dashboard, choose Codex / ChatGPT and click **Login to ChatGPT**. Or run `codex login`, choose ChatGPT, then rerun `npm run codex:status`. |
| Codex run completes but package artifacts are missing | Run was not launched from the dashboard, or the deal/run ID does not match the open workspace | Inspect `data/codex-runs/{runId}/` for raw outputs and `data/status/{dealId}/run-{runId}-documents.json` for Package-view artifacts. |
| Checkpoint shows "failed" | Agent encountered an unrecoverable error | Check `data/logs/{deal-id}/master.log` and the relevant files under `data/status/{deal-id}/agents/`. Fix the underlying issue, then resume with `node scripts/orchestrate.js --deal config/deal.json --resume`. |
| Missing phase data | Upstream phase incomplete or skipped | Verify all prior phases show status COMPLETE in `data/status/{deal-id}.json`. The master orchestrator enforces sequential phase dependencies. |
| "File not found" errors | Mismatched deal-id or incorrect file paths | Confirm `dealId` in `config/deal.json` matches the directory names under `data/status/` and `data/logs/`. Paths are case-sensitive. |
| Agent produces empty output | Missing input data from upstream agent or deal config | Check the agent's `inputs` field in `config/agent-registry.json`. Verify each required input file exists and contains data. |
| Scores don't match expectations | Threshold configuration misaligned with strategy | Review `config/thresholds.json`. Ensure `investmentStrategy` in `deal.json` matches the intended thresholds under `strategyThresholds`. See [Threshold Customization](THRESHOLD-CUSTOMIZATION.md). |
| Resume skips agents that should re-run | Stale checkpoint marks agent as complete | Delete the specific agent checkpoint file at `data/status/{deal-id}/agents/{agent-name}.json` and re-run the pipeline. The orchestrator will treat that agent as not started. |
| Agent reports LOW confidence on everything | Critical source documents missing | Check `data_quality_notes` and `uncertainty_flags` in the agent output. Provide the missing source documents (rent roll, T-12, Phase I ESA, etc.) and re-run. |
| Multiple agents fail simultaneously | Deal config missing critical fields | Run `npm run demo` on the sample deal to verify the install, then compare your deal config against [Deal Configuration](DEAL-CONFIGURATION.md). |
| Pipeline completes but no final report | Report generation agent failed silently | Check `data/logs/{deal-id}/closing.log` for errors. Verify that all phase output files exist under `data/phase-outputs/`. |
| Scenario analysis shows 0/27 passing | Unrealistic deal parameters | Review `config/deal.json` financial inputs. Common causes: asking price too high relative to NOI, estimated rate too high, or target returns set unrealistically. |

---

## Checkpoint Inspection

Checkpoints are JSON files that record an agent's progress. Understanding their structure helps diagnose issues.

### Master Checkpoint

Location: `data/status/{deal-id}.json`

```
Key fields:
  dealId          - Must match config/deal.json
  status          - RUNNING | COMPLETE | FAILED
  currentPhase    - Which phase is active (1-5)
  phases          - Object with each phase's status and progress
  overallProgress - Percentage (0-100)
  startTime       - ISO timestamp
  lastUpdate      - ISO timestamp
```

### Phase Checkpoint

Embedded within the master checkpoint under `phases.{phaseName}`:

```
Key fields:
  status          - NOT_STARTED | RUNNING | COMPLETE | FAILED
  progress        - Percentage for this phase
  agentsLaunched  - Count of agents started
  agentsComplete  - Count of agents finished
  agentsFailed    - Count of agents that errored
  verdict         - GO | CONDITIONAL | NO-GO (set on completion)
```

### Agent Checkpoint

Location: `data/status/{deal-id}/agents/{agent-name}.json`

```
Key fields:
  agent           - Agent name (must match registry)
  status          - RUNNING | COMPLETE | PARTIAL | FAILED
  last_checkpoint - Checkpoint ID (e.g., RR-CP-03)
  checkpoint_data - Saved intermediate state
  startTime       - When the agent started
  lastUpdate      - Last checkpoint write time
  error           - Error details if status is FAILED
```

### How to Read a Stale Checkpoint

1. Open the agent checkpoint file
2. Check `status` -- if FAILED, read the `error` field
3. Check `last_checkpoint` -- this tells you how far the agent got
4. Look at `checkpoint_data` -- this contains all work completed up to that point
5. Cross-reference with the agent's Checkpoint Protocol section to understand which steps completed

---

## Force Fresh Start

To clear all checkpoints and start the pipeline from scratch:

**WARNING**: This permanently deletes all progress, logs, and outputs for the deal. Make sure you have saved any reports or outputs you need.

### Steps

1. **Identify the deal-id** from `config/deal.json`

2. **Delete the master checkpoint**:
   ```
   Delete: data/status/{deal-id}.json
   ```

3. **Delete all agent checkpoints**:
   ```
   Delete entire directory: data/status/{deal-id}/
   ```

4. **Delete all logs** (optional but recommended for a clean start):
   ```
   Delete entire directory: data/logs/{deal-id}/
   ```

5. **Delete all phase outputs** (optional):
   ```
   Delete all files in: data/phase-outputs/
   ```

6. **Delete reports** (optional):
   ```
   Delete entire directory: data/reports/{deal-id}/
   ```

7. **Clear data/status/<deal-id>.json** (optional):
   ```
   Reset data/status/<deal-id>.json to initial template
   ```

8. **Re-run the pipeline**:
   ```powershell
   npm run demo
   ```

### Partial Reset

To re-run only a specific phase:

1. Delete agent checkpoints for that phase only:
   ```
   Delete: data/status/{deal-id}/agents/{agent-name}.json
   (for each agent in the target phase)
   ```

2. Update the master checkpoint to set that phase's status back to `NOT_STARTED`

3. Resume the deterministic runner:
   ```powershell
   node scripts/orchestrate.js --deal config/deal.json --resume --from-phase <phase>
   ```

**Note**: Re-running an upstream phase does NOT automatically re-run downstream phases. If you re-run Due Diligence, you should also clear Underwriting checkpoints since they depend on DD outputs.

---

## Log Analysis

### Log Location

All logs are written to `data/logs/{deal-id}/{phase}.log`. Each phase has its own log file:

| Phase | Log File |
|-------|----------|
| Due Diligence | `data/logs/{deal-id}/due-diligence.log` |
| Underwriting | `data/logs/{deal-id}/underwriting.log` |
| Financing | `data/logs/{deal-id}/financing.log` |
| Legal | `data/logs/{deal-id}/legal.log` |
| Closing | `data/logs/{deal-id}/closing.log` |
| Master Orchestrator | `data/logs/{deal-id}/master.log` |

### Log Format

Every log entry follows this structure:

```
[ISO-timestamp] [agent-name] [CATEGORY] message
```

### Log Categories

| Category | Meaning | When to Investigate |
|----------|---------|-------------------|
| `ACTION` | Agent performed a step (read file, web search, write output) | Rarely -- these are informational |
| `FINDING` | Agent discovered something noteworthy | Always review FINDING entries for HIGH severity |
| `ERROR` | Something went wrong | Always investigate ERROR entries |
| `DATA_GAP` | Required data was not available | Review to understand confidence impact |
| `COMPLETE` | Agent finished its work | Confirms successful completion |

### Common Log Patterns

**Successful agent run:**
```
[timestamp] [agent-name] [ACTION] Starting analysis
[timestamp] [agent-name] [ACTION] Reading deal config
[timestamp] [agent-name] [ACTION] Step 1 complete
...
[timestamp] [agent-name] [FINDING] Key finding description
[timestamp] [agent-name] [COMPLETE] Analysis finished - confidence: HIGH
```

**Agent with data gaps:**
```
[timestamp] [agent-name] [ACTION] Starting analysis
[timestamp] [agent-name] [DATA_GAP] T-12 operating statement not provided
[timestamp] [agent-name] [ACTION] Using benchmark estimates for OpEx
[timestamp] [agent-name] [COMPLETE] Analysis finished - confidence: LOW
```

**Failed agent:**
```
[timestamp] [agent-name] [ACTION] Starting analysis
[timestamp] [agent-name] [ERROR] Input data not found: rent roll
[timestamp] [agent-name] [ERROR] Unrecoverable: Cannot proceed without rent roll data
```

### Searching Logs

To find all errors across a deal:
- Search for `[ERROR]` in all log files under `data/logs/{deal-id}/`

To find all dealbreaker findings:
- Search for `DEALBREAKER` in all log files

To trace a specific agent's activity:
- Filter log entries by `[agent-name]` in the relevant phase log

---

## Agent Timeout Issues

Each agent has a configured timeout in `config/thresholds.json`. If an agent appears to hang:

| Agent | Default Timeout | Config Path |
|-------|----------------|-------------|
| Most agents | 30 minutes | `{phase}.agentTimeouts.default_minutes` |
| market-study | 45 minutes | `dueDiligence.agentTimeouts.market-study_minutes` |
| environmental-review | 45 minutes | `dueDiligence.agentTimeouts.environmental-review_minutes` |
| lender-outreach | 60 minutes | `financing.agentTimeouts.lender-outreach_minutes` |
| estoppel-tracker | 90 minutes | `legal.agentTimeouts.estoppel-tracker_minutes` |
| loan-doc-reviewer | 45 minutes | `legal.agentTimeouts.loan-doc-reviewer_minutes` |
| funds-flow-manager | 45 minutes | `closing.agentTimeouts.funds-flow-manager_minutes` |

If an agent exceeds its timeout, the orchestrator will record the agent as FAILED and proceed according to phase rules (either skip or halt depending on whether the agent is critical).

---

## Dashboard-Specific Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank page at localhost:5173 | Vite dev server not running | Run `npm run dashboard` |
| "Cannot find module" on dashboard start | Dependencies not installed | Run `npm run setup` first |
| Port 5173 already in use | Another process using the port | Kill the existing process or change the port in `dashboard/vite.config.ts` |
| Port 8080 already in use | Another process using the watcher port | Kill the existing process or change the port in `dashboard/server/watcher.ts` |
| Phase progress stuck at 0% | Watcher cannot find checkpoint files | Verify `data/status/{deal-id}.json` exists and the watcher is configured to watch the correct deal-id |
| Log viewer empty | No log files written yet | Logs are created when agents start running. Launch the pipeline first. |
| Codex run button fails immediately | Codex CLI is missing or not logged in | In the Workflow Launcher, choose Codex / ChatGPT and click **Login to ChatGPT**. Or run `npm run codex:status`, then `codex login` and choose ChatGPT. |
| Package tab is empty after a Codex run | Browser is viewing a different deal or stale run | Reopen the deal workspace and verify `data/status/{deal-id}/run-{run-id}-documents.json` exists. |

For more dashboard details, see [Dashboard Setup](DASHBOARD-SETUP.md).

---

## Validation Suite

Before running a real deal, validate the system setup with the offline demo:

```powershell
npm run demo
npm run validate
```

`npm run validate` expects generated checkpoint files, so run `npm run demo` or a dashboard workflow first. The validation checks:

- All agent prompt files exist and are readable
- All config files parse correctly
- The deal.json schema is valid
- All required directories exist
- Threshold values are internally consistent
- Agent registry references resolve to actual files

This catches configuration errors before they cause pipeline failures.

After a live smoke run, validate the Codex output and dashboard package contract too:

```powershell
npm run codex:smoke
npm run validate:codex
```

---

## Getting Help

If you cannot resolve an issue:

1. **Collect diagnostics**: Master checkpoint, phase logs, the failing agent's checkpoint
2. **Check the deal config**: Run `npm run demo` and `npm run validate` to rule out config issues
3. **Review thresholds**: Ensure thresholds match the deal's investment strategy
4. **Check cross-references**: See [Architecture](ARCHITECTURE.md) for system structure and data flow

---

## Cross-References

- System architecture: [Architecture](ARCHITECTURE.md)
- Deal configuration: [Deal Configuration](DEAL-CONFIGURATION.md)
- Threshold tuning: [Threshold Customization](THRESHOLD-CUSTOMIZATION.md)
- Dashboard setup: [Dashboard Setup](DASHBOARD-SETUP.md)
- Agent details: [Agent Development](AGENT-DEVELOPMENT.md)
