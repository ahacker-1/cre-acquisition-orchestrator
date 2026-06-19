# Prerequisites

Everything needed before running the CRE Acquisition Orchestrator from a fresh Windows checkout.

---

## Required Software

| Requirement | Minimum Version | Purpose |
|-------------|-----------------|---------|
| Node.js | 18.0+ | Root scripts, simulation engine, dashboard server |
| npm | 9+ | Dependency install and launch scripts |
| Python | 3.9+ | Local parser virtual environment for XLSX/PDF extraction and PDF page rendering for OCR |
| Chrome, Edge, or another modern browser | Current stable | Dashboard at `http://localhost:5173` |
| Google Chrome, Microsoft Edge, or Playwright Chromium | Current stable | Browser E2E in `npm run verify:v3` |

Run the project setup from the repo root:

```powershell
npm install
npm run setup
```

The setup script verifies Node/npm, installs root and dashboard dependencies, creates `.venv`, installs `scripts/requirements.txt` (`pandas`, `openpyxl`, `pdfplumber`, `PyMuPDF`), and tries to prepare the optional Codex live-agent runtime. The offline demo and dashboard still work if Codex install or login is skipped.

To inspect the environment without installing or writing files:

```powershell
npm run setup -- --check
```

For a strict live-agent setup check:

```powershell
npm run setup -- --require-codex
```

For offline-only setup:

```powershell
npm run setup -- --skip-codex-install --skip-login
```

For dashboard-only setup that skips parser dependencies:

```powershell
npm run setup -- --skip-python-install
```

Skipping Python dependencies keeps the dashboard usable, but XLSX/PDF parser tests and source-backed document extraction will report parser dependencies as unavailable until `.venv` is prepared.

---

## Optional Live AI Runtime

The deterministic demo does not need any API key or AI subscription. Live AI agent runs use OpenAI Codex CLI.

| Requirement | Purpose |
|-------------|---------|
| Codex CLI | Runs local agent tasks through OpenAI's open-source Codex harness |
| ChatGPT account with Codex access | Lets you use Codex with your existing ChatGPT subscription login |

Install Codex manually if setup cannot install it:

```powershell
npm install -g @openai/codex
```

Sign in from the dashboard or CLI. In the dashboard, choose **Codex / ChatGPT** in the Workflow Launcher and click **Login to ChatGPT**. From the CLI:

```powershell
codex login
```

Choose **Sign in with ChatGPT**. This uses your ChatGPT account instead of an OpenAI API key. Codex stores credentials outside this project; the repository only sees login status.

Verify:

```powershell
npm run codex:status
```

Expected output includes:

```text
Logged in using ChatGPT
```

If you prefer API-key usage, Codex supports it, but this project's recommended first-run path is ChatGPT login.

---

## First-Run Checklist

```powershell
# 1. Node.js
node --version
# Expected: v18.x.x or higher

# 2. npm
npm --version
# Expected: 9.x.x or higher

# 3. Install project and dashboard dependencies
npm install
npm run setup

# 4. Run the no-key offline demo
npm run demo

# 5. Run the full verified source-to-IC workbench gate
npm run verify:v3

# 6. Optional: run one live Codex-backed agent
npm run codex:smoke

# 7. Start the dashboard
npm run dashboard
```

Open `http://localhost:5173` after the dashboard starts.

---

## Disk Space

| Component | Size | Notes |
|-----------|------|-------|
| System files | About 50 MB | Prompts, configs, schemas, scripts |
| Dashboard dependencies | About 150 MB | Installed under `dashboard/node_modules/` |
| Per deterministic run | About 200 MB | Logs, checkpoints, reports, phase outputs |
| Codex live outputs | Varies | Written under `data/codex-runs/` and ignored by git |

Allocate at least 500 MB for the system plus one active deal.

---

## Network Access

Internet access is required for:

- Installing npm dependencies
- Installing or updating Codex CLI
- Signing in to Codex with ChatGPT
- Optional live Codex runs that use web search via `--search`

The offline deterministic simulation runs after dependencies are installed and does not call an LLM.

---

## Recommended Setup

| Recommendation | Why |
|----------------|-----|
| VS Code | Good JSON editing and local markdown preview |
| Terminal width of 160+ columns | Agent logs are easier to scan |
| Second browser or monitor | Useful for watching dashboard and terminal output together |

---

## Next Steps

- Follow [First Deal Guide](FIRST-DEAL-GUIDE.md) for a full walkthrough.
- Use [Launch Procedures](LAUNCH-PROCEDURES.md) for all command modes.
- Use [Troubleshooting](TROUBLESHOOTING.md) if setup or runtime checks fail.
