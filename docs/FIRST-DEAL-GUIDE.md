# First Deal Guide

A clean path from fresh clone to your first CRE acquisition run.

---

## Step 1: Install and Verify

From the repo root:

```powershell
npm install
npm run setup
```

This verifies Node/npm, installs dashboard dependencies, and tries to prepare the optional Codex live-agent runtime. If Codex install or login is skipped, the offline demo and dashboard still work.

If you want live AI agents, choose **Sign in with ChatGPT** during the Codex login flow. For a strict live-agent setup check, run:

```powershell
npm run setup -- --require-codex
```

Verify Codex auth:

```powershell
npm run codex:status
```

Expected login output includes `Logged in using ChatGPT`.

---

## Step 2: Start with the Sample Deal

The repo ships with `config/deal.json` populated for Parkview Apartments, a 200-unit Austin multifamily sample. For the fastest first run, keep that file as-is.

To create your own deal later, either:

- Use the dashboard front door: drop files, state the goal, and create an agent-team workspace.
- Use the dashboard New Deal flow for manual field entry.
- Copy `config/deal-example.json` into `config/deal.json` and edit the fields.

```powershell
Copy-Item config/deal-example.json config/deal.json
code config/deal.json
```

At minimum, keep these fields populated:

- `dealId`
- `dealName`
- `property`
- `financials`
- `financing`
- `investmentStrategy`
- `timeline`

For the complete field reference, see [Deal Configuration](DEAL-CONFIGURATION.md).

---

## Step 3: Run the Offline Demo

```powershell
npm run demo
```

This does not call any LLM. It runs the deterministic simulation engine, generates checkpoints, writes phase outputs, validates contracts, and produces reports under `data/reports/{dealId}/`.

Useful output locations:

| Output | Path |
|--------|------|
| Master checkpoint | `data/status/{dealId}.json` |
| Final report | `data/reports/{dealId}/final-report.md` |
| Phase outputs | `data/phase-outputs/{dealId}/` |
| Logs | `data/logs/{dealId}/master.log` |

---

## Step 4: Start the Dashboard

In a second terminal:

```powershell
npm run dashboard
```

Open `http://localhost:5173`.

The dashboard lets you:

- Drop source documents and state the outcome you want: quick screen, IC package, legal blocker review, financing package, or underwriting refresh
- Create or open an agentic deal team workspace
- Use the Mission tab to see readiness, blockers, agent activity, handoffs, and package progress
- Upload local source documents
- Extract CSV/TXT/MD inputs
- Mark operator checklist items complete or waived with a short reason while keeping source-backed evidence separate
- Launch focused workflows from Advanced when you want manual runtime control
- Watch phase progress, agent status, and communication events
- Review the completion package

---

## Step 5: Run Live Codex Agents

Live Codex runs use the same markdown agent instructions through `codex exec`. CLI runs write raw prompts, logs, manifests, summaries, and agent memos to `data/codex-runs/{runId}/`. Dashboard-launched Codex runs also publish story events and package documents under `data/status/{dealId}/run-{runId}-*.{ndjson,json}` so the Package view can show the real Codex workpapers.

After `npm run codex:status` confirms ChatGPT login, run one live agent:

```powershell
npm run codex:smoke
```

Then run a multi-agent quick screen:

```powershell
npm run codex:run
```

For the complete live catalog:

```powershell
npm run codex:run:full
```

The live runner reads the existing markdown prompts in `agents/`, `orchestrators/`, and `skills/`, then writes Codex outputs to:

```text
data/codex-runs/{runId}/
```

The default sandbox is read-only so the agents can analyze the repo without editing it. Use `--search` when your installed Codex CLI exposes web search; older versions will print a warning and continue without search:

```powershell
node scripts/codex-agent-runner.js --workflow quick-deal-screen --concurrency 2 --search
```

---

## Step 6: Read Results

Start in the dashboard Package tab if you want the product experience. It collects the final recommendation, IC review brief, red flags, data gaps, decision log, and workpapers.

If you want to inspect files directly, use these paths:

Offline demo report:

```powershell
Get-Content data/reports/parkview-2026-001/final-report.md
```

Latest live Codex run summary:

```powershell
Get-ChildItem data/codex-runs
Get-Content data/codex-runs/<run-id>/summary.md
```

Replace `<run-id>` with the directory created by the runner, for example `codex-smoke`.

---

## Step 7: Common Fixes

| Issue | Fix |
|-------|-----|
| `Codex CLI is not installed` | Run `npm install -g @openai/codex`, then `npm run setup` |
| `Codex is not logged in` | Run `codex login` and choose ChatGPT |
| Dashboard shows no data | Run `npm run demo` once, then refresh |
| Port 5173 is busy | Stop the other process or edit `dashboard/vite.config.ts` |
| Contract validation fails | Run `npm run demo` first so fresh checkpoint files exist |
| Live Codex agent has missing facts | Re-run with `--search` or add the missing source documents |

---

## What You Have Now

After the first run, you have:

1. A no-key local simulation path for instant evaluation.
2. A dashboard for deal setup, document intake, workflow launch, and package review.
3. A ChatGPT-login Codex harness for running real markdown agents through `codex exec`.
4. Generated checkpoints and reports you can inspect, validate, and adapt for future deals.
