# First Deal Guide

A step-by-step walkthrough from zero to final acquisition report. Follow each step in order.

---

## Step 1: Verify Prerequisites

Before anything else, confirm your environment is ready.

```bash
claude --version          # Claude Code CLI installed
node --version            # Node.js 18+
npm --version             # npm available
```

If any check fails, see [PREREQUISITES.md](PREREQUISITES.md) for installation instructions.

---

## Step 2: Configure Your Deal

The fastest v2.0.0 path is the dashboard:

1. Start the dashboard in Step 4.
2. Click **New Deal** or **Create Upload Workspace**.
3. Save a draft deal.
4. Open the deal workspace and use the **Documents** tab to upload rent rolls, T12s, offering memoranda, LOIs, PDFs, or XLSX files.
5. Extract CSV/TXT/MD files and approve fields before launching a workflow.

If you prefer the original config-file path, the system can still run from `config/deal.json`.

### 2a. Copy the Example File

```powershell
# From cre-acquisition/ root directory
Copy-Item config/deal-example.json config/deal.json
```

### 2b. Open and Edit deal.json

Open `config/deal.json` in your editor (VS Code recommended):

```bash
code config/deal.json
```

### 2c. Fill In Required Fields

At minimum, you must populate these fields. Replace the example values with your deal data:

```json
{
  "dealId": "DEAL-2025-001",
  "dealName": "Your Property Name",

  "property": {
    "address": "123 Main Street",
    "city": "Your City",
    "state": "TX",
    "zip": "75201",
    "propertyType": "multifamily",
    "yearBuilt": 1995,
    "totalUnits": 150,
    "unitMix": {
      "types": [
        {
          "type": "1BR/1BA",
          "count": 80,
          "avgSqFt": 750,
          "marketRent": 1400,
          "inPlaceRent": 1300
        },
        {
          "type": "2BR/2BA",
          "count": 70,
          "avgSqFt": 1050,
          "marketRent": 1800,
          "inPlaceRent": 1700
        }
      ]
    }
  },

  "financials": {
    "askingPrice": 25000000,
    "currentNOI": 1750000,
    "inPlaceOccupancy": 0.94
  },

  "financing": {
    "targetLTV": 0.70,
    "estimatedRate": 0.055,
    "loanTerm": 10,
    "amortization": 30,
    "loanType": "Agency"
  },

  "investmentStrategy": "core-plus",
  "targetHoldPeriod": 5,
  "targetIRR": 0.15,
  "targetEquityMultiple": 1.8,
  "targetCashOnCash": 0.08,

  "seller": {
    "entity": "Seller Entity LLC"
  },

  "timeline": {
    "psaExecutionDate": "2025-06-01",
    "ddStartDate": "2025-06-01",
    "ddExpirationDate": "2025-07-15",
    "closingDate": "2025-09-01"
  }
}
```

For a complete field reference, see [DEAL-CONFIGURATION.md](DEAL-CONFIGURATION.md).

### 2d. Validate Your Configuration

Review your deal.json for common mistakes:
- `dealId` follows the `DEAL-YYYY-NNN` format
- `state` is a two-letter uppercase abbreviation
- `zip` is a string (quoted), not a number
- All monetary values are plain numbers without dollar signs or commas
- Occupancy and rates are decimals (0.93, not 93)
- Dates are `YYYY-MM-DD` format

---

## Step 3: Customize Thresholds (Optional)

The file `config/thresholds.json` defines investment criteria that determine PASS / FAIL / CONDITIONAL verdicts.

Default thresholds are calibrated for a typical core-plus multifamily acquisition. If you have different investment criteria, edit the thresholds before launching.

```bash
code config/thresholds.json
```

For guidance on what each threshold controls, see [THRESHOLD-CUSTOMIZATION.md](THRESHOLD-CUSTOMIZATION.md).

If you are running your first deal, **skip this step** and use the defaults.

---

## Step 4: Start the Dashboard

The monitoring dashboard shows real-time pipeline progress, agent status, and findings.

```bash
# From cre-acquisition/ root
cd dashboard
npm install       # First time only - installs dependencies
npm run dev       # Starts the development server
```

You should see output like:
```
  VITE v5.x.x  ready in XXX ms

  > Local:   http://localhost:5173/
```

Open your browser to **http://localhost:5173**. The dashboard will display "No active deal" until you launch the pipeline.

Leave this terminal running and open a **new terminal** for the next step.

---

## Step 5: Launch the Pipeline

This is where you start the actual analysis. Open Claude Code in a new terminal.

### 5a. Start Claude Code

```bash
claude
```

### 5b. Read the Master Orchestrator

In the Claude Code session, paste this prompt:

```
Read orchestrators/master-orchestrator.md and config/deal.json.

Launch the full CRE acquisition pipeline for the deal described in config/deal.json.
Follow the master orchestrator instructions exactly. Execute all 5 phases:
Due Diligence, Underwriting, Financing, Legal, and Closing.
```

### 5c. What Happens Next

Claude Code will:
1. Read the master orchestrator prompt and deal configuration
2. Read thresholds and the agent registry
3. Check for any existing checkpoint (resume state)
4. Initialize a fresh deal checkpoint at `data/status/{deal-id}.json`
5. Create `data/status/<deal-id>.json` with deal summary
6. Launch **Phase 1: Due Diligence** (7 specialist agents)
7. Continue sequentially through all 5 phases
8. Produce a final acquisition report with a Go/No-Go verdict

The pipeline runs autonomously. No user input is required after launch.

---

## Step 6: Monitor Progress

While the pipeline runs, you can track progress in three ways:

### Dashboard (Primary)

Open **http://localhost:5173** in your browser. The dashboard displays:
- Overall pipeline progress bar
- Phase-by-phase status (Pending / Running / Complete / Failed)
- Active agent count and names
- Key findings as they are discovered
- Red flags and data gaps

### data/status/<deal-id>.json (Quick Check)

The master orchestrator updates `data/status/<deal-id>.json` at the project root after every significant event:

```powershell
# Quick status check from another terminal
Get-Content data/status/<deal-id>.json
```

### Log Files (Detailed)

For detailed agent activity:

```powershell
# Master orchestrator log
Get-Content data/logs/{deal-id}/master.log

# Phase-specific logs
Get-Content data/logs/{deal-id}/due-diligence.log
Get-Content data/logs/{deal-id}/underwriting.log
```

Replace `{deal-id}` with your actual deal ID (e.g., `DEAL-2025-001`).

---

## Step 7: Review Results

When the pipeline completes, all outputs are in the `data/reports/{deal-id}/` directory.

### Key Output Files

| File | Contents |
|------|----------|
| `data/reports/{deal-id}/final-report.md` | Complete acquisition report with verdict |
| `data/reports/{deal-id}/dd-report.md` | Due diligence findings |
| `data/reports/{deal-id}/underwriting-report.md` | Financial model, scenarios, IC memo |
| `data/reports/{deal-id}/financing-report.md` | Lender quotes, term comparison |
| `data/reports/{deal-id}/legal-report.md` | Title, PSA, estoppel, insurance status |
| `data/reports/{deal-id}/closing-report.md` | Closing readiness assessment |

### Read the Final Report

```powershell
Get-Content data/reports/{deal-id}/final-report.md
```

The report opens with:
- **Verdict:** PASS, FAIL, or CONDITIONAL
- **Confidence Score:** 0-100 indicating data completeness
- **Executive Summary:** 2-3 paragraph synthesis

### Decision Card

The final report includes a decision card with key metrics:

| Metric | What It Tells You |
|--------|-------------------|
| NOI | Net Operating Income (revenue minus operating expenses) |
| Cap Rate | Return based on purchase price vs. NOI |
| DSCR | Can the property cover its debt payments? (>1.25 = good) |
| Cash-on-Cash | Annual cash return on your equity investment |
| IRR | Total projected return including appreciation |
| Price/Unit | How the price compares to market |
| Risk Score | Overall risk assessment (0-100, higher is safer) |

---

## Step 8: Interpret Verdicts

### PASS
All primary investment criteria are met. No dealbreakers found. The system recommends proceeding with the acquisition, subject to any noted conditions.

### CONDITIONAL
Some criteria are marginal or data gaps exist. The report lists specific conditions that must be resolved. Common conditions:
- Outstanding environmental findings need Phase II assessment
- Estoppel collection below 80% threshold
- One or more underwriting metrics are borderline

Review the conditions list carefully. Each condition notes which phase flagged it and what resolution is needed.

### FAIL
A dealbreaker was found or multiple primary criteria failed. The report explains exactly what triggered the failure. Common triggers:
- DSCR below minimum threshold
- Active title dispute or environmental contamination
- Structural issues requiring demolition
- Property in bankruptcy estate

A FAIL verdict does not always mean "walk away." Review the specific findings -- some failures may be addressable through price negotiation or deal restructuring.

---

## Step 9: Troubleshoot

If something goes wrong during the pipeline:

### Pipeline Stalls
```bash
# Check data/status/<deal-id>.json for current status
Get-Content data/status/<deal-id>.json

# Check master log for errors
Get-Content data/logs/{deal-id}/master.log
```

### Agent Failures
The system retries failed agents once automatically. If an agent still fails:
1. Check the phase-specific log for error details
2. The pipeline continues with available data, reducing the confidence score
3. Data gaps are listed in the final report

### Resume After Interruption
If your session is interrupted (terminal closed, power loss, etc.), the checkpoint system preserves all progress:

```bash
# Start a new Claude Code session
claude

# Paste this prompt:
Read orchestrators/master-orchestrator.md and config/deal.json.
Resume the CRE acquisition pipeline for deal {deal-id}.
Check data/status/{deal-id}.json for current state and skip completed phases.
```

The master orchestrator reads the checkpoint, identifies completed phases, and picks up where it left off.

### Common Issues

| Issue | Solution |
|-------|----------|
| "No deal config found" | Verify `config/deal.json` exists and is valid JSON |
| Dashboard shows no data | Ensure the dashboard is running (`cd dashboard && npm run dev`) and the deal ID matches |
| Agent timeout | Some agents (market-study, environmental) need up to 45 minutes. Check the log for timeout warnings |
| Rate limit errors | API quota exceeded. Wait for quota reset, then resume (see above) |
| Invalid deal.json | Check that all required fields are populated and types are correct. See [DEAL-CONFIGURATION.md](DEAL-CONFIGURATION.md) |

---

## What You Have Now

After completing your first deal analysis, you have:

1. **A complete acquisition report** with quantified risk and return metrics
2. **Phase-by-phase analysis** covering property condition, financials, market, legal, and closing readiness
3. **A Go/No-Go verdict** calibrated to your investment strategy
4. **Checkpoint data** that can be re-analyzed if deal terms change
5. **Experience** with the system to run future deals faster

---

## Next Steps

- Customize thresholds for your investment strategy: [THRESHOLD-CUSTOMIZATION.md](THRESHOLD-CUSTOMIZATION.md)
- Learn the full system architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Review all launch options: [LAUNCH-PROCEDURES.md](LAUNCH-PROCEDURES.md)
