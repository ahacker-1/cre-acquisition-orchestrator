# Quick Demo: Run the Agentic Deal Team Workspace in 5 Minutes

Use this path when you want to prove the product locally before reading the architecture docs. The default demo is deterministic, offline, and does not require API keys.

## What You Will See

The v2.5 demo follows the core operator journey:

1. **Drop documents** — start from source material, not a blank automation form. XLSX/CSV rent rolls and T12s become source-backed candidate fields for operator review.
2. **State the mission** — preserve the acquisition goal and intended output.
3. **Watch the team coordinate** — Acquisition Command and Deal Team show specialist activity, phase movement, and handoffs.
4. **Review workpapers** — evidence and agent outputs are filed for diligence review.
5. **Open the IC package** — review the committee-ready recommendation package and source trail.

## Start the Offline Demo

From a fresh clone:

```powershell
git clone https://github.com/ahacker-1/cre-acquisition-orchestrator.git
cd cre-acquisition-orchestrator
npm install
npm run demo
npm run dashboard
```

Open:

```text
http://localhost:5173
```

The dashboard runs locally. The default demo does not call external AI APIs.

If you are deciding between the offline demo and optional live Codex agents, read [`docs/RUNTIME-COMPARISON.md`](RUNTIME-COMPARISON.md). The short version: use the offline demo for first evaluation, screenshots, and release validation; use live Codex only after authentication and data-sharing boundaries are understood.

## Use Guided Demo Mode

Once the dashboard is open, click **Start Guided Demo** on the front door. If a workspace is already open, click **Parkview Demo** in the header to reopen the deterministic sample.

Guided Demo Mode opens the deterministic Parkview sample without uploads or API keys, then walks through:

1. **Acquisition Command** — executive state, readiness, blockers, package status, and latest movement.
2. **Swarm Goal Console** — how a plain-English acquisition goal maps to workflow, specialists, gaps, and handoffs.
3. **Deal Team** — specialist coordination across diligence, underwriting, financing, legal, and closing.
4. **Workpapers & Evidence** — reviewable outputs and audit trail.
5. **IC Package** — recommendation, phase outcomes, source-backed inputs, decision log, and package review.

## Verify the Offline Demo

Before showing the project to someone else, run the one-command verification path:

```powershell
npm run demo:verify
```

This command regenerates deterministic demo artifacts, validates contracts and operator guides, checks the deterministic swarm-goal helper, validates source-backed XLSX rent-roll/T12 parser fixtures, runs the system scenarios, and verifies the dashboard production build. It is offline and credential-free by default.

## Screens to Review

After the dashboard opens, use the sample deal/workspace and review these surfaces in order:

| Screen | What to Look For |
|--------|------------------|
| **Front Door** | Document-first intake and quick deal creation. |
| **Acquisition Command** | The executive state of the deal: stage, readiness, blockers, package status, and latest movement. |
| **Mission** | The goal/outcome intent plus the Swarm Goal Console: recommended specialist team, blockers, handoff path, and next action. |
| **Deal Team** | Specialist agents, status, handoffs, reviews, dependencies, and selected-agent detail. |
| **Workpapers** | Filed diligence outputs and evidence-oriented artifacts. |
| **IC Package** | Recommendation, phase outcomes, risks, data gaps, manifest, and package review state. |

Current public screenshots for these surfaces live under [`docs/assets/`](assets/). The longer storyboard is in [`docs/DEMO-JOURNEY.md`](DEMO-JOURNEY.md).

## What Is Real vs Simulated

### Offline deterministic demo

The default path uses deterministic sample data and local orchestration artifacts. It is the best path for first-time evaluation because it is repeatable and does not require credentials.

Use it to evaluate:

- product journey
- workspace information architecture
- acquisition-team positioning
- generated workpapers/package shape
- source/evidence expectations
- release screenshots and docs

### Optional live Codex / ChatGPT path

Live-agent execution is optional. If Codex CLI is installed and authenticated with ChatGPT, the dashboard can launch workflows that execute the markdown agent instructions through the local Codex runtime.

Use it after the offline path is clear. The live path is useful for validating runtime behavior, but it is not required to understand the product.

## Refresh the Demo State

If the dashboard looks stale or you want fresh deterministic artifacts:

```powershell
npm run demo
```

Then restart the dashboard:

```powershell
npm run dashboard
```

## Refresh Public Screenshots

When preparing release notes, README updates, or launch material:

```powershell
npm run demo
npm run dashboard
# in a second terminal while the dashboard is running:
npm run screenshots
```

This updates the current public gallery under `docs/assets/` for:

- Acquisition Command
- Swarm Goal Console
- Mission
- Deal Team
- Workpapers
- IC Package

Review the image diff before committing. Public screenshots should not show contradictory states like a completed package paired with blocked source inputs.

## Troubleshooting

### Port already in use

The dashboard uses:

- `5173` — Vite frontend
- `8080` — WebSocket watcher
- `8081` — local REST API

On Windows / Git Bash, clear stale listeners with:

```bash
for p in $(netstat -ano | awk '/:(5173|8080|8081) / && /LISTENING/ {print $NF}' | sort -u); do
  taskkill //PID $p //F || true
done
```

Then restart:

```powershell
npm run dashboard
```

### Dashboard opens but looks empty or stale

Run:

```powershell
npm run demo
npm run dashboard
```

Then refresh `http://localhost:5173`.

If the browser still shows stale state, clear local storage for `localhost:5173` or open a private/incognito window.

### Build or dependency issues

Run:

```powershell
npm install
npm --prefix dashboard install
npm --prefix dashboard run build
```

### Validate the local repo

For a stronger local confidence check, start with:

```powershell
npm run demo:verify
```

For browser-level coverage, add:

```powershell
npm --prefix dashboard run test:e2e
```

## Next Reading

- [`docs/DEMO-JOURNEY.md`](DEMO-JOURNEY.md) — public operator storyboard and screenshot refresh path.
- [`docs/RUNTIME-COMPARISON.md`](RUNTIME-COMPARISON.md) — offline demo vs live Codex expectations, artifacts, and safety boundaries.
- [`README.md`](../README.md) — project overview, release journey, architecture summary, and setup.
- [`ROADMAP.md`](../ROADMAP.md) — current priorities and contribution directions.
- [`docs/ISSUE-SEEDS.md`](ISSUE-SEEDS.md) — approval-ready issue drafts for public follow-up work.
