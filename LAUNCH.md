# Launch Quick Reference

Copy-paste commands for the most common launch scenarios. For detailed procedures, see [docs/LAUNCH-PROCEDURES.md](docs/LAUNCH-PROCEDURES.md).

---

## Full Pipeline (New Deal - Step by Step Live)

```powershell
# Terminal 1: Start dashboard watcher + UI from the repo root
npm run dashboard

# Then click "Start Live" in the dashboard (auto-resets old artifacts)
# UI default mode runs:
# node scripts/orchestrate.js --deal config/deal.json --scenario core-plus --agent-delay-ms 2000
```

## Full Pipeline (Fast Complete)

```powershell
# Terminal 1: Start dashboard watcher + UI from the repo root
npm run dashboard

# Terminal 2: Fast non-visual completion run
npm run demo
```

## First Download Setup

```powershell
npm install
npm run setup
```

This installs dashboard dependencies, verifies Node/npm, and tries to prepare the optional Codex live-agent runtime. If Codex install or login is skipped, the offline demo and dashboard still work. For a strict live-agent setup check, run `npm run setup -- --require-codex`.

When `codex login` opens, pick **Sign in with ChatGPT** to use an existing ChatGPT subscription. You can also start that same local login flow from the dashboard by choosing **Codex / ChatGPT** in the Workflow Launcher and clicking **Login to ChatGPT**.

```powershell
npm run codex:status
```

Expected auth output: `Logged in using ChatGPT`.

## Live Codex Agent Harness

Codex live runs write raw prompts, logs, manifests, summaries, and agent memos to `data/codex-runs/{runId}/`. Dashboard-launched Codex runs also publish story events and package documents to `data/status/{dealId}/run-{runId}-*.{ndjson,json}` so the Package view can show the real Codex workpapers.

```powershell
# One-agent smoke test through codex exec
npm run codex:smoke

# Multi-agent quick deal screen
npm run codex:run

# Complete Codex-backed agent catalog
npm run codex:run:full
```

---

## Resume Interrupted Pipeline

```powershell
node scripts/orchestrate.js --deal config/deal.json --scenario value-add --seed 11 --resume
```

For targeted resume from a specific phase:

```powershell
node scripts/orchestrate.js --deal config/deal.json --scenario value-add --seed 11 --resume --from-phase legal
```

---

## Failure Injection Demo

```powershell
node scripts/demo-fail-injection.js --deal config/deal.json --scenario value-add --seed 11 --agent estoppel-tracker
```

---

## Deterministic Replay Check

```powershell
node scripts/demo-replay.js --deal config/deal.json --scenario core-plus --seed 42
```

---

## Full System Test (Scenarios + Failure/Resume + Contracts)

```powershell
node scripts/system-test.js
```

---

## Dashboard Only

```powershell
npm run dashboard
# Open http://localhost:5173
```

---

## Workflow Launcher

```powershell
npm run dashboard
# Open http://localhost:5173
# Click Workflows, choose a deal, choose an outcome, review inputs, then Run Now
```

Available workflow IDs for CLI runs:

```powershell
node scripts/orchestrate.js --deal config/deal.json --workflow full-acquisition-review --scenario core-plus --seed 42
node scripts/orchestrate.js --deal config/deal.json --workflow quick-deal-screen --scenario core-plus --seed 42
node scripts/orchestrate.js --deal config/deal.json --workflow underwriting-refresh --scenario core-plus --seed 42
node scripts/orchestrate.js --deal config/deal.json --workflow financing-package --scenario core-plus --seed 42
node scripts/orchestrate.js --deal config/deal.json --workflow legal-psa-review --scenario core-plus --seed 42
```

---

## Local Document Intake

```powershell
npm run dashboard
# Open http://localhost:5173
# Create or open a deal, go to Documents, upload files, extract CSV/TXT/MD, approve fields
```

Uploaded files and extraction previews stay under `data/deals/{deal-id}/` and are ignored by git.

---

## Find Your Deal ID

```powershell
Get-Content data/status/<deal-id>.json
# or
Get-ChildItem data/status/
```

---

## Output Locations

| What | Where |
|------|-------|
| Final report | `data/reports/{deal-id}/final-report.md` |
| Phase reports | `data/reports/{deal-id}/{phase}-report.md` |
| Story events (NDJSON) | `data/status/{deal-id}/run-{run-id}-events.ndjson` |
| Document registry | `data/status/{deal-id}/run-{run-id}-documents.json` |
| Run manifest | `data/status/{deal-id}/run-{run-id}-manifest.json` |
| Live Codex raw outputs | `data/codex-runs/{run-id}/` |
| Source uploads | `data/deals/{deal-id}/documents/` |
| Extraction previews | `data/deals/{deal-id}/extractions/` |
| Approved source fields | `data/deals/{deal-id}/approved-fields.json` |
| Logs | `data/logs/{deal-id}/master.log` |
| Checkpoint | `data/status/{deal-id}.json` |
| Session state | `data/status/<deal-id>.json` (project root) |

---

For detailed procedures (validation runs, single-phase execution, troubleshooting), see [docs/LAUNCH-PROCEDURES.md](docs/LAUNCH-PROCEDURES.md).

For your first deal, follow the step-by-step guide at [docs/FIRST-DEAL-GUIDE.md](docs/FIRST-DEAL-GUIDE.md).
