# Technical Demo Script

**Duration:** 30 minutes
**Audience:** Technical leads, IT teams, development partners, integration specialists
**Goal:** Deep understanding of system architecture, customization options, and technical capabilities

---

## Before You Begin

- [ ] Complete the [Pre-Demo Checklist](./pre-demo-checklist.md)
- [ ] Have code editor ready with project open
- [ ] Terminal window ready for commands
- [ ] Dashboard running at http://localhost:5173

---

## SECTION 1: Architecture Overview (8 minutes)

### 1.1 System Introduction

> "Let me walk you through the technical architecture of the CRE Acquisition Orchestrator."

**Show:** Open the project in VS Code or your editor

> "The system is built on a hierarchical agent architecture. Think of it as a team of specialists, each with a specific role, coordinated by orchestrators at different levels."

### 1.2 Directory Structure

**Action:** Show the file tree

```
cre-acquisition/
├── config/              # Deal and system configuration
│   ├── deal.json        # Current deal parameters
│   ├── workflows.json   # Built-in outcome workflows
│   ├── thresholds.json  # Investment criteria
│   └── agent-registry.json
├── orchestrators/       # Phase-level coordinators
│   ├── master-orchestrator.md
│   ├── due-diligence-orchestrator.md
│   └── ... (5 orchestrators)
├── agents/              # Specialist agents
│   ├── due-diligence/   # 7 DD specialists
│   ├── underwriting/    # 3 UW specialists
│   └── ...
├── skills/              # Reusable capabilities
├── data/                # Runtime data
│   ├── deals/           # Uploaded docs, criteria, extraction state
│   ├── runs/            # Source-backed launch snapshots
│   ├── status/          # Checkpoints, story events, package manifests
│   ├── codex-runs/      # Live Codex prompts, logs, summaries, memos
│   ├── logs/            # Activity logs
│   └── reports/         # Generated reports
├── scripts/             # Simulation runner, Codex runner, setup helpers
└── dashboard/           # Operator Deal Hub, workflow launcher, package view
```

> "There are two runtime paths now. Offline simulation writes deterministic local artifacts. Live Codex uses the open-source Codex CLI with ChatGPT login, then writes raw Codex output plus dashboard package artifacts back into the same local data tree."

### 1.3 Agent Hierarchy

> "The hierarchy has four levels:"

**Draw or show diagram:**

```
Level 1: Master Orchestrator
         └── Coordinates entire pipeline
         └── Tracks overall progress
         └── Produces final verdict

Level 2: Phase Orchestrators (5)
         └── Due Diligence Orchestrator
         └── Underwriting Orchestrator
         └── Financing Orchestrator
         └── Legal Orchestrator
         └── Closing Orchestrator

Level 3: Specialist Agents (21 total)
         └── Rent Roll Analyst
         └── OpEx Analyst
         └── Market Analyst
         └── ... (domain experts)

Level 4: Child Agents (dynamic)
         └── Spawned as needed for parallelism
         └── Example: One agent per unit type
         └── Example: One agent per lender
```

### 1.4 Communication Flow

> "Agents communicate through checkpoints and logs. There's no direct agent-to-agent communication - everything goes through the orchestrator layer."

**Key points:**
- Each agent reads its instructions from a markdown prompt file
- Each agent writes its findings to a JSON checkpoint
- Orchestrators poll checkpoints to track progress
- Downstream phases read upstream checkpoints for input data

---

## SECTION 2: Agent Anatomy (6 minutes)

### 2.1 Agent Prompt Structure

**Action:** Open `agents/due-diligence/rent-roll-analyst.md`

> "Every agent is defined by a markdown prompt file. Let me show you the structure."

**Highlight these sections:**
1. **Identity Block** - Name, role, phase, reports-to relationship
2. **Mission** - What the agent is responsible for
3. **Tools Available** - What actions it can take
4. **Input Expectations** - What data it receives
5. **Task Execution** - Step-by-step instructions
6. **Output Format** - Required structure of findings
7. **Error Handling** - What to do when things go wrong

> "Notice this is plain markdown. No special syntax, no compilation. The AI model reads this directly as instructions."

### 2.2 Checkpoint Structure

**Action:** Open `templates/agent-checkpoint.json`

> "Every agent maintains a checkpoint that tracks its state."

```json
{
  "agentName": "rent-roll-analyst",
  "dealId": "DEAL-2026-001",
  "phase": "due_diligence",
  "status": "complete",
  "progress": 1.0,
  "startedAt": "2026-01-15T10:00:00Z",
  "completedAt": "2026-01-15T10:45:00Z",
  "findings": [...],
  "dataForDownstream": {...},
  "metrics": {...},
  "errors": []
}
```

**Explain:**
- Status: pending → running → complete (or failed)
- Progress: 0.0 to 1.0, updated incrementally
- Findings: Structured observations with severity
- DataForDownstream: What the next phase needs

### 2.3 Finding Structure

> "Findings have a consistent structure across all agents."

```json
{
  "id": "finding-001",
  "severity": "warning",
  "category": "income",
  "title": "Loss-to-Lease Detected",
  "detail": "In-place rents are 8% below market across all unit types",
  "impact": "Potential $280,000 annual revenue increase opportunity",
  "recommendation": "Budget for rent increases during first 12 months",
  "source": "Rent roll vs. market comp analysis",
  "confidence": 0.9
}
```

---

## SECTION 3: Checkpoint/Resume System (5 minutes)

### 3.1 Three-Tier State Management

> "The system uses a three-tier checkpoint system for complete recoverability."

**Tier 1: data/status/<deal-id>.json**
```markdown
# Session State: Parkview Apartments (DEAL-2026-001)

## Status: IN PROGRESS
## Phase: Due Diligence (85% complete)
## Started: 2026-01-15 10:00 UTC
## Last Update: 2026-01-15 14:30 UTC

### Phase Progress
| Phase | Status | Progress |
|-------|--------|----------|
| Due Diligence | Running | 85% |
| Underwriting | Pending | 0% |
| ... | ... | ... |
```

> "This is human-readable. Open it anytime to see where things stand."

**Tier 2: Deal Checkpoint** (`data/status/{deal-id}.json`)
> "This is the machine-readable master state. Contains all phase data, metrics, and the overall progress calculation."

**Tier 3: Agent Checkpoints** (`data/status/{deal-id}/agents/*.json`)
> "Individual state for each specialist agent. This is how we resume mid-agent."

### 3.2 Resume Demonstration

> "Let me show you what happens when we resume."

**Action:** Stop the pipeline mid-execution (or simulate with a checkpoint file)

> "Watch what happens when we restart."

**Explain the flow:**
1. Master orchestrator reads existing checkpoint
2. Sees phases 1-2 complete, phase 3 in progress
3. Skips completed phases (uses cached data)
4. Resumes phase 3 from where it stopped
5. Log shows: `[ACTION] Skipping Due Diligence - already complete`

> "Nothing is ever lost. Every step is checkpointed."

---

## SECTION 4: Customization Options (6 minutes)

### 4.1 Investment Thresholds

**Action:** Open `config/thresholds.json`

> "Investment criteria are fully configurable. Let me show you the threshold system."

```json
{
  "dscrMinimum": 1.25,
  "capRateSpreadMinimum": 100,
  "ltMaximum": 0.75,
  "debtYieldMinimum": 0.09,
  "strategyThresholds": {
    "core": {
      "minDSCR": 1.40,
      "minRiskScore": 85,
      "maxHighRisks": 0
    },
    "value-add": {
      "minDSCR": 1.20,
      "minRiskScore": 60,
      "maxHighRisks": 2
    }
  }
}
```

> "Different strategies have different risk tolerances. A core deal needs higher DSCR than a value-add deal."

### 4.2 Dealbreakers

> "You can define automatic fail conditions."

```json
{
  "dealbreakers": [
    "environmental_phase2_required",
    "title_uninsurable",
    "occupancy_below_60_percent",
    "negative_cash_flow_year1"
  ]
}
```

> "If any agent flags one of these, the verdict is automatically FAIL regardless of other metrics."

### 4.3 Adding a New Agent

> "Want to add a specialist for your firm's unique requirements? Here's how."

**Steps:**
1. Create the prompt file: `agents/due-diligence/my-specialist.md`
2. Register it: Add entry to `config/agent-registry.json`
3. Reference it: Update the phase orchestrator to spawn this agent
4. Define outputs: Specify what data it produces

> "The system is designed to extend. Add agents without changing core infrastructure."

---

## SECTION 5: Dashboard Deep Dive (3 minutes)

### 5.1 Real-Time Updates

**Action:** Show the dashboard with the pipeline running

> "The dashboard updates in real-time via WebSocket connection."

**Point out:**
- Connection indicator (green dot)
- Progress percentages updating
- Log entries streaming
- Findings appearing as they're reported

### 5.2 Runtime and Package Navigation

**Action:** Click through the Operator Deal Hub, Workflow Launcher, Documents, and Package views.

> "The current dashboard is organized around the acquisition workflow. You can inspect source coverage, launch simulation or Codex-backed workflows, then review generated workpapers and story artifacts in the Package view."

**Show:**
- Runtime selector for Simulation and Codex / ChatGPT
- Codex agent count, concurrency, and optional search controls
- Package artifacts generated from `data/status/{dealId}/run-{runId}-documents.json`

### 5.3 Completion Package Generation

**Action:** Show or describe the Package view.

> "When complete, the system generates a completion package with workpapers, findings, decision log, document manifest, source-backed input coverage, and a final recommendation."

---

## SECTION 6: Integration Points (2 minutes)

### 6.1 Input Integration

> "How do you get deal data in?"

**Options:**
- Manual: Edit `config/deal.json` directly
- API: POST deal data to a wrapper endpoint (custom build)
- Data Room: Script to pull from data room and populate config
- CRM: Integration with deal tracking systems

### 6.2 Output Integration

> "Where do results go?"

**Current outputs:**
- JSON checkpoints (machine-readable)
- Markdown reports (human-readable)
- Dashboard (real-time monitoring)

**Possible integrations:**
- Export to Excel for financial modeling
- PDF generation for IC packages
- Webhook notifications on completion
- Database persistence for portfolio tracking

---

## Q&A Topics

### Common Technical Questions

**Q: "How does it handle API rate limits?"**
> "Each agent that makes external calls implements exponential backoff. If rate limited, it checkpoints, waits, and resumes. The logs show rate limit events clearly."

**Q: "Can we run this on-prem?"**
> "The offline demo and dashboard storage run locally. You need Node.js for the dashboard. If you choose live agents, they run through Codex CLI using your ChatGPT login, which sends the selected prompts and deal context through that Codex session."

**Q: "What about sensitive data in prompts?"**
> "Deal data is injected at runtime - it's not stored in the prompt templates. For offline simulation, data stays in your `data/` directory. For live Codex runs, only use deal context that is approved for your ChatGPT-authenticated Codex environment."

**Q: "How do we monitor in production?"**
> "The dashboard provides real-time monitoring. For production, you'd add logging to your observability stack (Datadog, Splunk, etc.) by tailing the log files."

**Q: "What's the compute cost?"**
> "The offline demo has no AI usage cost. Live runs use your Codex CLI authentication, with the practical cost and limits governed by your ChatGPT or OpenAI account. The runner supports scoped workflows, max-agent limits, and concurrency controls so you can start small."

---

## Closing

> "You've now seen the full technical architecture: hierarchical agents, checkpoint/resume system, customizable thresholds, and the monitoring dashboard. The system is designed to be extensible - add agents, modify criteria, integrate with your existing tools."

> "Any questions about specific technical aspects, or would you like to see any component in more detail?"

---

## Appendix: Command Reference

| Action | Command |
|--------|---------|
| First setup | `npm install` then `npm run setup` |
| Start dashboard | `npm run dashboard` |
| Offline demo | `npm run demo` |
| Codex status | `npm run codex:status` |
| Live Codex smoke | `npm run codex:smoke` |
| Live Codex run | `npm run codex:run` |
| View deal config | `Get-Content config/deal.json` |
| View thresholds | `Get-Content config/thresholds.json` |
| Check checkpoint | `Get-Content data/status/*.json` |
| Tail master log | `Get-ChildItem data/logs -Recurse -Filter master.log | Select-Object -First 1 | Get-Content -Wait` |
| List agents | `Get-Content config/agent-registry.json` |
| Reset state | `Remove-Item data/status/*,data/logs/* -Recurse -Force -ErrorAction SilentlyContinue` |

## Appendix: Key Files Reference

| File | Purpose |
|------|---------|
| `orchestrators/master-orchestrator.md` | Top-level coordinator |
| `config/deal.json` | Deal input configuration |
| `config/thresholds.json` | Investment criteria |
| `config/agent-registry.json` | Agent prompt file paths |
| `templates/agent-checkpoint.json` | Checkpoint structure |
| `templates/report-template.md` | Final report format |
| `data/status/<deal-id>.json` | Human-readable state |
