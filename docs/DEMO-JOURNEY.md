# Demo Journey

Use this as the public demo path for current `main`. It is optimized for a first-time visitor who wants to understand the product before reading the architecture docs.

## Current Reality

The demo reflects the post-v2.5.1 codebase: document-first intake, source-backed extraction previews, deterministic offline orchestration, generated workpapers, and an optional local Codex/ChatGPT live-agent path. v2.5.1 is the most recent packaged release line in the repo, while current `main` may include unreleased hardening and documentation updates.

## Promise

**Drop the deal. State the mission. Watch the agentic deal team coordinate. Review the workpapers and IC package.**

The safe default demo runs locally with deterministic data and does not require API keys. The optional live-agent path uses the user's local Codex CLI / ChatGPT login and should be introduced only after the offline journey is clear.

For the exact runtime split, artifacts, and data-sharing boundaries, see [`docs/RUNTIME-COMPARISON.md`](RUNTIME-COMPARISON.md).

## Ten-Minute Local Demo

```powershell
git clone https://github.com/ahacker-1/cre-acquisition-orchestrator.git
cd cre-acquisition-orchestrator
npm install
npm run setup
npm run demo
npm run dashboard
```

Open `http://localhost:5173`.

## Screenshot Refresh Command

For release hygiene, refresh the deterministic sample and then run the Playwright capture flow against the local dashboard:

```powershell
npm run demo
npm run dashboard
# in a second terminal while the dashboard is running:
npm run screenshots
```

`npm run screenshots` updates the current public gallery under `docs/assets/` for the front door, quick-create modal, Acquisition Command, Swarm Goal Console, Mission, Deal Team, Workpapers, and IC Package.

## Guided Demo Mode

For a no-video first impression, run the dashboard and click **Start Guided Demo** on the front door. If a workspace is already open, click **Parkview Demo** in the header to reopen the deterministic sample. The app presents an in-product tour through Acquisition Command, Swarm Goal Console, Deal Team, Workpapers & Evidence, and IC Package.

Use this when you want a first-time visitor to understand the product without uploads, API keys, or a recorded walkthrough.

## Operator Storyboard

### 1. Front Door — Document-First Intake

What to show:

- The homepage lead message: source documents are the starting point, not a blank form.
- The drop zone for rent rolls, T12s, offering memoranda, LOIs, legal files, PDFs, and XLSX files.
- The quick-create path that turns uploaded files into a deal workspace.

Why it matters:

- A CRE operator recognizes the workflow immediately: every acquisition starts with source files.
- The dashboard positions the project as a workspace, not just a script runner.

Current screenshot assets:

- `docs/assets/dashboard-front-door.png`
- `docs/assets/quick-deal-create.png`

### 2. Acquisition Command — Executive State of the Deal

What to show:

- Package readiness, team pulse, active stage, latest material movement, and decision-package status.
- The fact that the Command surface explains what changed and what needs operator attention.

Why it matters:

- This is the current product center: it makes the agentic workspace legible before the user studies the underlying orchestration engine.
- It is the best first screenshot to refresh before the next public release.

Current screenshot asset:

- `docs/assets/acquisition-command.png`

### 3. Mission — Intent Before Execution

What to show:

- The stated acquisition goal/outcome intent.
- The Swarm Goal Console after `Plan Swarm` converts a plain-English goal into a recommended workflow.
- The specialist roster, data gaps, handoff path, and `Launch This Swarm` action.
- How mission metadata persists with the deal instead of living only in a launch modal.

Why it matters:

- It communicates that the agents are working toward an investment objective, not simply running generic analyses.
- It proves the core product loop: state an outcome, inspect the selected specialist team, then launch the swarm.

Current screenshot assets:

- `docs/assets/swarm-goal-console.png`
- `docs/assets/mission-control.png`

### 4. Deal Team — Visible Agent Coordination

What to show:

- Specialist rows in human-readable language.
- Active/filed/queued status.
- Agent messages, handoffs, dependencies, reviews, and phase handoffs.

Why it matters:

- This proves the system is not just a progress bar. It exposes the coordination layer between CRE specialists.

Current screenshot asset:

- `docs/assets/deal-team-handoffs.png`

### 5. Workpapers — Evidence and Agent Outputs

What to show:

- Filed specialist workpapers.
- Source-backed materials and evidence state.
- Links between workpapers, originating agents, and package assembly.

Why it matters:

- Serious CRE users need auditability. Workpapers turn the demo from a flashy dashboard into a reviewable diligence workspace.

Current screenshot asset:

- `docs/assets/workpapers-evidence.png`

### 6. IC Package — Reviewable Decision Output

What to show:

- Final recommendation.
- Phase outcomes.
- Priority red flags and data gaps.
- Document manifest, decision log, and workpaper links.

Why it matters:

- This is the payoff: a human operator can review the package instead of trusting an opaque AI answer.

Current screenshot asset:

- `docs/assets/ic-package.png`

## Guided Demo Checklist

Before the next public release:

- [ ] Run `npm run demo` to regenerate sample artifacts.
- [ ] Run `npm run dashboard` and click **Start Guided Demo**.
- [ ] Confirm the guided tour advances through Acquisition Command, Swarm Goal Console, Deal Team, Workpapers & Evidence, and IC Package.
- [ ] Run `npm run screenshots` while the dashboard is available at `http://localhost:5173`.
- [x] Capture current public surfaces for the front door, quick-create modal, Acquisition Command, Swarm Goal Console, Mission, Deal Team, Workpapers, and IC Package.
- [x] Add a current screenshot gallery in `docs/assets/`.
- [x] Update README image alt text so each screenshot explains the operator value.
- [ ] Run `git diff --check`.
- [ ] Run `npm --prefix dashboard run build`.
