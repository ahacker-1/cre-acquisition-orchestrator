# Quick Start Guide

Get up and running with the CRE Acquisition Orchestrator in four steps.

---

## Prerequisites

Before you begin, ensure you have:

- [ ] Node.js v18+ installed
- [ ] Git (for cloning the repository)
- [ ] A modern web browser (Chrome recommended)
- [ ] Terminal/command line access
- [ ] Optional: Codex CLI signed in with ChatGPT for live AI agents

From the repo root, run:

```powershell
npm install
npm run setup
```

---

## Step 1: Configure Your Deal

The repo ships with `config/deal.json` already populated for the Parkview Apartments sample. Keep it as-is for the fastest first run, or copy `config/deal-example.json` and edit it for your own property.

### Required Fields

```json
{
  "dealId": "DEAL-2026-001",
  "dealName": "Your Property Name",
  "property": {
    "address": "123 Main Street",
    "city": "Austin",
    "state": "TX",
    "zip": "78701",
    "propertyType": "multifamily",
    "yearBuilt": 2005,
    "totalUnits": 100
  },
  "financials": {
    "askingPrice": 15000000,
    "currentNOI": 900000,
    "inPlaceOccupancy": 0.92
  },
  "investmentStrategy": "value-add",
  "targetHoldPeriod": 5,
  "targetIRR": 0.15
}
```

Copy the blank example to start a new deal:

```powershell
Copy-Item config/deal-example.json config/deal.json
```

---

## Step 2: Launch the Dashboard

Start the dashboard:

```powershell
npm run dashboard
```

The dashboard will be available at: **http://localhost:5173**

### What You'll See

- **Operator Deal Hub**: Deal library and lifecycle workspace
- **Workflow Launcher**: Choose a deal, outcome, runtime, and launch settings
- **Documents**: Upload source files, extract CSV/TXT/MD data, and approve fields
- **Package**: Final reports, workpapers, story events, document manifests, and recommendations

---

## Step 3: Run the Analysis

### Option A: Offline Demo

```powershell
npm run demo
```

### Option B: Live Codex Agents

If `npm run setup` did not finish Codex login, use either path:

- Dashboard: choose **Codex / ChatGPT** in the Workflow Launcher and click **Login to ChatGPT**
- CLI:

```powershell
codex login
npm run codex:status
```

Choose **Sign in with ChatGPT** during login.

The dashboard button starts the local Codex CLI login flow and reports status only. It does not store or expose credentials in the repo.

```powershell
npm run codex:status
npm run codex:smoke
npm run codex:run
```

CLI Codex runs write raw outputs to `data/codex-runs/{runId}/`. Dashboard-launched Codex runs also publish Package-view artifacts under `data/status/{dealId}/run-{runId}-*.{ndjson,json}`.

### Monitoring Progress

Watch the dashboard as the pipeline executes:

1. **Due Diligence** (25% of progress) - 7 specialist agents analyze the property
2. **Underwriting** (20%) - Financial modeling and scenario analysis
3. **Financing** (20%) - Lender outreach and term comparison
4. **Legal** (25%) - Document review and closing preparation
5. **Closing** (10%) - Final readiness assessment

---

## Step 4: Review Results

### During Analysis

- **Overview**: Current run status, source coverage, and selected workflow
- **Phase Workspaces**: Phase-specific playbooks, required documents, and launch controls
- **Package**: Workpapers, findings, decision log, document manifest, source-backed input coverage, and final recommendation

### After Completion

- **Package View**: Updates when a simulation or dashboard Codex run completes
- **Decision Card**: One-page executive summary
- **Full Report**: Detailed findings in `data/reports/{deal-id}/`

### Understanding the Verdict

| Verdict | Meaning |
|---------|---------|
| **PASS** | Deal meets the configured investment criteria. Review source support before proceeding. |
| **CONDITIONAL** | Deal is viable with specific conditions. Review and address conditions. |
| **FAIL** | Deal has dealbreakers or fails critical thresholds. Review before spending more diligence time. |

---

## Troubleshooting

### Dashboard won't connect

1. Verify the development server is running (`npm run dashboard`)
2. Check that port 5173 is not blocked
3. Try refreshing the browser

### Pipeline doesn't start

1. Verify `config/deal.json` is properly formatted
2. Check for required fields (dealId, dealName, property basics)
3. Review terminal output for error messages

### Analysis seems stuck

1. Check the Logs tab for recent activity
2. The system checkpoints progress - it can resume if interrupted
3. Some phases (like market research) may take time for web lookups

See [Known Issues](../known-issues.md) for detailed troubleshooting.

---

## Next Steps

- **Customize thresholds**: Edit `config/thresholds.json` for your investment criteria
- **Review documentation**: Full details in `docs/` directory
- **Run multiple deals**: Each deal runs independently
- **Schedule a demo**: See the system handle a live analysis

---

## Quick Reference

| Task | Command |
|------|---------|
| First setup | `npm install` then `npm run setup` |
| Start dashboard | `npm run dashboard` |
| Offline demo | `npm run demo` |
| Codex status | `npm run codex:status` |
| Live Codex smoke | `npm run codex:smoke` |
| Live Codex run | `npm run codex:run` |
| Copy blank deal template | `Copy-Item config/deal-example.json config/deal.json` |
| View logs | Dashboard status and files under `data/logs/` |
| View results | Dashboard Package view |
| Resume interrupted | Pipeline resumes automatically from checkpoint |

**Dashboard URL**: http://localhost:5173

**Help**: See [FAQ](./faq.md) or [Troubleshooting](../../docs/TROUBLESHOOTING.md)
