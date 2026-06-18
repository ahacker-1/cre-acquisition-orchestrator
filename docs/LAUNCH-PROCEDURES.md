# Launch Procedures

Current launch modes for the CRE Acquisition Orchestrator. For the copy-paste version, see [LAUNCH.md](../LAUNCH.md).

---

## Procedure 1: First Download Setup

Use this on a clean machine or fresh clone.

```powershell
npm install
npm run setup
```

Expected behavior:

1. Node.js 18+ and npm are verified.
2. Dashboard dependencies are installed.
3. Python 3.9+ is found unless `--skip-python-install` is passed.
4. `.venv` is created and `scripts/requirements.txt` installs parser dependencies (`pandas`, `openpyxl`, `pdfplumber`).
5. Codex CLI is installed if possible.
6. If Codex is available and not logged in, `codex login` starts.
7. You choose **Sign in with ChatGPT** for subscription-based Codex usage.

If you want setup to fail unless the live Codex runtime is fully ready, run:

```powershell
npm run setup -- --require-codex
```

Check the login state:

```powershell
npm run codex:status
```

Expected login output includes `Logged in using ChatGPT`.

The dashboard also exposes the same path: start `npm run dashboard`, open the Workflow Launcher, choose **Codex / ChatGPT**, and click **Login to ChatGPT**. The app checks status only and does not expose credential material.

---

## Procedure 2: Offline Full Pipeline

Run the complete deterministic pipeline. This is the safest first functionality check because it does not call an LLM.

```powershell
npm run demo
```

Expected behavior:

1. Documents are ingested from the sample deal files.
2. The local orchestration engine runs all 5 phases.
3. Agent checkpoints, story events, phase outputs, logs, and reports are written under `data/`.
4. Contract validation runs at the end.
5. The final report is written to `data/reports/parkview-2026-001/final-report.md`.

Validate the latest checkpoint:

```powershell
npm run validate
```

---

## Procedure 3: Dashboard

Start the local operator cockpit.

```powershell
npm run dashboard
```

Open `http://localhost:5173`.

The command starts:

- Vite UI on port `5173`
- WebSocket watcher on port `8080`
- Local REST API on port `8081`

Use the dashboard for deal creation, source-document upload, workflow launch, phase monitoring, and completion-package review.

---

## Procedure 4: Live Codex Agent Smoke Test

Run one real agent through OpenAI Codex CLI using your ChatGPT login.

```powershell
npm run codex:smoke
```

Expected behavior:

1. The runner verifies Codex CLI and login status.
2. It selects one underwriting agent.
3. It calls `codex exec` with a read-only sandbox.
4. The agent reads local prompts and deal files.
5. Raw output lands in `data/codex-runs/codex-smoke/`.
6. Dashboard package artifacts land in `data/status/{dealId}/run-codex-smoke-*.{ndjson,json}`.

Read the summary:

```powershell
Get-Content data/codex-runs/codex-smoke/summary.md
```

---

## Procedure 5: Live Multi-Agent Codex Workflow

Run a useful multi-agent screen through Codex.

```powershell
npm run codex:run
```

This launches the `quick-deal-screen` workflow with concurrency `2`.

For all agents in the full acquisition workflow:

```powershell
npm run codex:run:full
```

For targeted runs:

```powershell
node scripts/codex-agent-runner.js --workflow legal-psa-review --concurrency 2
node scripts/codex-agent-runner.js --workflow underwriting-refresh --agent financial-model-builder
node scripts/codex-agent-runner.js --workflow quick-deal-screen --phase due-diligence --max-agents 2
```

Add web search when a specialist needs current outside facts:

```powershell
node scripts/codex-agent-runner.js --workflow quick-deal-screen --search
```

Outputs are written to:

```text
data/codex-runs/{runId}/
```

When the run is launched from the dashboard, the same Codex memos and summary are also registered in:

```text
data/status/{dealId}/run-{runId}-events.ndjson
data/status/{dealId}/run-{runId}-documents.json
data/status/{dealId}/run-{runId}-manifest.json
```

---

## Procedure 6: Resume or Re-Run Deterministic Pipeline

Resume an interrupted local simulation:

```powershell
node scripts/orchestrate.js --deal config/deal.json --scenario core-plus --seed 42 --resume
```

Resume from a specific phase:

```powershell
node scripts/orchestrate.js --deal config/deal.json --scenario core-plus --seed 42 --resume --from-phase legal
```

Run a focused deterministic workflow:

```powershell
node scripts/orchestrate.js --deal config/deal.json --workflow quick-deal-screen --scenario core-plus --seed 42
node scripts/orchestrate.js --deal config/deal.json --workflow underwriting-refresh --scenario value-add --seed 42
node scripts/orchestrate.js --deal config/deal.json --workflow financing-package --scenario core-plus --seed 42
node scripts/orchestrate.js --deal config/deal.json --workflow legal-psa-review --scenario core-plus --seed 42
```

---

## Procedure 7: Validation and Regression Tests

Contract validation:

```powershell
npm run validate
```

Validate a non-default deal explicitly:

```powershell
node scripts/validate-contracts.js --deal-id <deal-id>
```

After `npm run codex:smoke`, validate the Codex output contract too:

```powershell
npm run validate:codex
```

Full system test:

```powershell
npm test
```

Dashboard browser tests:

```powershell
npm run test:e2e
```

Full v3 workbench verification:

```powershell
npm run verify:v3
```

This is the heavy release/demo gate. It runs release drift checks, root tests, parser and workspace evidence tests, dashboard typecheck/build, npm audits, offline evaluation, production self-host smoke, and browser E2E.

---

## Quick Reference

| Goal | Command |
|------|---------|
| First setup | `npm install` then `npm run setup` |
| Check Codex ChatGPT login | `npm run codex:status` |
| Offline full demo | `npm run demo` |
| Dashboard | `npm run dashboard` |
| One live Codex agent | `npm run codex:smoke` |
| Multi-agent Codex quick screen | `npm run codex:run` |
| Full live Codex catalog | `npm run codex:run:full` |
| Validate latest outputs | `npm run validate` |
| Verify source-to-IC workbench | `npm run verify:v3` |

---

## See Also

- [First Deal Guide](FIRST-DEAL-GUIDE.md)
- [Dashboard Setup](DASHBOARD-SETUP.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Architecture](ARCHITECTURE.md)
