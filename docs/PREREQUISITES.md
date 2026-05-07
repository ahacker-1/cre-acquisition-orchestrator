# Prerequisites

Everything you need installed and configured before running the CRE Acquisition Orchestration System.

---

## Software Requirements

| Requirement | Minimum Version | Purpose |
|-------------|----------------|---------|
| Claude Code CLI | Latest | Runtime for all agents and orchestrators |
| Node.js | 18.0+ | Dashboard server and build tools |
| npm or yarn | npm 9+ / yarn 1.22+ | Dashboard dependency management |
| Chrome or Chromium | Latest stable | Dashboard viewing at localhost:5173 |

### Claude Code CLI

The system runs entirely inside Claude Code. Every agent is a markdown prompt file launched via the `Task` tool.

```powershell
# Verify Claude Code is installed
claude --version
```

If not installed, follow the official Anthropic installation guide for your platform.

### Node.js and npm

Required only for the monitoring dashboard.

```bash
# Verify Node.js version (must be 18+)
node --version

# Verify npm version
npm --version
```

If Node.js is not installed or is below version 18, download from [https://nodejs.org](https://nodejs.org) (LTS recommended).

---

## Account Requirements

### Anthropic API Key

Claude Code must have a valid API key with sufficient quota to run the pipeline.

| Setting | Recommendation | Notes |
|---------|---------------|-------|
| Model for orchestrators | Opus (claude-opus) | Best reasoning for coordination, dependency management, and final verdicts |
| Model for specialists | Sonnet (claude-sonnet) | Good balance of speed and quality for focused analysis tasks |
| API quota | Substantial | A full pipeline run may use 50-100+ agent invocations depending on deal complexity |

```bash
# Verify your API key is configured
claude config list
```

Make sure your key is set and has not expired. If you encounter rate limit errors during a run, the checkpoint system will allow you to resume once quota is restored.

---

## Disk Space

| Component | Size | Notes |
|-----------|------|-------|
| System files (prompts, configs, skills, templates) | ~50 MB | All markdown and JSON, very lightweight |
| Per deal analysis | ~200 MB | Logs, checkpoints, reports, phase outputs |
| Dashboard (with node_modules) | ~150 MB | One-time install |

For a typical workstation, allocate at least **500 MB** for the system plus one active deal. If you plan to analyze multiple deals in parallel or retain historical data, allocate accordingly.

---

## Network Access

Internet access is required for several specialist agents that perform online research:

| Agent | Network Use |
|-------|-------------|
| market-study | WebSearch for market data, rent comps, demographic trends |
| environmental-review | WebSearch/WebFetch for EPA databases, state DEQ records |
| legal-title-review | WebSearch for county recorder lookups, lien searches |
| lender-outreach | WebSearch for current lender rate sheets and program terms |
| physical-inspection | WebSearch for contractor cost databases, code requirements |

If you are behind a corporate firewall or VPN, ensure that outbound HTTPS traffic is permitted. Claude Code's WebSearch and WebFetch tools need standard HTTPS access.

---

## Browser

The real-time monitoring dashboard runs locally:

- **URL:** `http://localhost:5173`
- **Browser:** Chrome or Chromium (recommended for best compatibility with the React/Vite dashboard)
- **Alternative:** Any modern browser (Firefox, Edge) should work, but Chrome is tested

---

## Prerequisite Verification Checklist

Run these commands to verify your environment is ready:

```bash
# 1. Claude Code CLI
claude --version
# Expected: version number displayed

# 2. Node.js
node --version
# Expected: v18.x.x or higher

# 3. npm
npm --version
# Expected: 9.x.x or higher

# 4. Verify deal config exists
# From cre-acquisition/ root:
Get-Item config/deal.json
# Expected: file exists

# 5. Verify dashboard dependencies (first time only)
cd dashboard && npm install && cd ..
# Expected: dependencies installed without errors

# 6. Test dashboard starts
cd dashboard && npm run dev
# Expected: Vite dev server starts at http://localhost:5173
# Press Ctrl+C to stop after confirming
```

---

## Recommended Setup

These are not strictly required, but will improve your experience:

| Recommendation | Why |
|---------------|-----|
| **VS Code** | Best editor for reviewing and editing `deal.json` with JSON validation and syntax highlighting |
| **Terminal width: 200+ columns** | Agent logs include timestamps, agent names, and categories. Wider terminals prevent line wrapping in log output |
| **Second monitor** | Run the dashboard on one screen and Claude Code on the other for real-time monitoring |
| **JSON formatter extension** | VS Code extensions like "Prettier" help keep deal.json readable |

---

## Next Steps

Once all prerequisites are verified:
- Proceed to [FIRST-DEAL-GUIDE.md](FIRST-DEAL-GUIDE.md) for a step-by-step walkthrough of your first deal analysis
- Or jump to [LAUNCH-PROCEDURES.md](LAUNCH-PROCEDURES.md) if you are already familiar with the system
