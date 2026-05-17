# Demo Journey

Use this as the public demo path for v2.4.0. It is optimized for a first-time visitor who wants to understand the product before reading the architecture docs.

## Promise

**Drop the deal. State the mission. Watch the agentic deal team coordinate. Review the workpapers and IC package.**

The safe default demo runs locally with deterministic data and does not require API keys. The optional live-agent path uses the user's local Codex CLI / ChatGPT login and should be introduced only after the offline journey is clear.

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

- This is the v2.4 product center: it makes the agentic workspace legible before the user studies the underlying orchestration engine.
- It is the best first screenshot to update after v2.4.0.

Current screenshot asset:

- `docs/assets/acquisition-command.png`

### 3. Mission — Intent Before Execution

What to show:

- The stated acquisition goal/outcome intent.
- Recommended workflow selection and the operator's desired review package.
- How mission metadata persists with the deal instead of living only in a launch modal.

Why it matters:

- It communicates that the agents are working toward an investment objective, not simply running generic analyses.

Current screenshot asset:

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

## 60-Second Launch Video Outline

1. **0-10s:** Show the front door and say: “This is an open-source AI-native workspace for multifamily acquisitions.”
2. **10-20s:** Drop sample docs or open the Parkview sample deal.
3. **20-30s:** Show Acquisition Command and Mission: “The operator states the outcome and the workspace tracks readiness.”
4. **30-42s:** Show Deal Team: “Specialist agents coordinate through visible handoffs, dependencies, and reviews.”
5. **42-52s:** Show Workpapers: “Outputs are reviewable, source-aware workpapers.”
6. **52-60s:** Show IC Package and close with: “Run it locally with no API keys; connect Codex/ChatGPT only if you want live agents.”

## Screenshot Refresh Checklist

Before the next public release:

- [ ] Run `npm run demo` to regenerate sample artifacts.
- [ ] Run `npm run dashboard` and open the completed sample workspace.
- [x] Capture current v2.4 surfaces for Acquisition Command, Mission, Deal Team, Workpapers, and IC Package.
- [x] Add a current v2.4 screenshot gallery in `docs/assets/`.
- [x] Update README image alt text so each screenshot explains the operator value.
- [ ] Run `git diff --check`.
- [ ] Run `npm --prefix dashboard run build`.
