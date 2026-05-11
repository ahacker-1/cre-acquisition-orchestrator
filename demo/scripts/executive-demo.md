# Executive Demo Script

**Duration:** 15 minutes
**Audience:** C-level executives, investment committee members, acquisition directors
**Goal:** Demonstrate the value of AI-powered CRE acquisition analysis

---

## Before You Begin

- [ ] Complete the [Pre-Demo Checklist](./pre-demo-checklist.md)
- [ ] Have Parkview Apartments deal loaded in `config/deal.json`
- [ ] Dashboard running at http://localhost:5173
- [ ] Browser zoomed to 125% for visibility

---

## INTRO (2 minutes)

### Opening Statement

> "Today I'm going to show you an AI-powered system that transforms how we analyze commercial real estate acquisitions."

### The Problem

> "A typical multifamily acquisition analysis takes 2-3 weeks of manual work across multiple teams: due diligence, underwriting, financing, legal review. Each handoff introduces delays and potential for human error."

### The Solution

> "This system automates the entire process. What used to take weeks now takes 24-48 hours, with more consistent analysis and full audit trails."

### Show the Deal

**Action:** Open `config/deal.json` in your editor or show on screen

> "Here's today's deal: Parkview Apartments. 200-unit multifamily property in Austin, Texas. Asking price: $32 million. This is a value-add opportunity - the units haven't been renovated since 2010."

**Key Points to Highlight:**
- Property: 200 units, 8 buildings, Class B
- Price: $32M ($160K/unit)
- Strategy: Value-add with $10K/unit renovation budget
- Target: 15% IRR, 1.8x equity multiple

---

## LAUNCH (1 minute)

### Start the Pipeline

> "Let me show you how easy it is to kick off the analysis."

**Action:** If not already running, demonstrate the launch command:

```powershell
# From the repo root
npm run dashboard
```

> "The system reads the deal configuration and begins autonomous analysis. Let's switch to the dashboard to see it in action."

**Action:** Open http://localhost:5173 in browser

> "The system is now analyzing this deal autonomously. It will work through five phases: Due Diligence, Underwriting, Financing, Legal, and Closing preparation."

---

## DASHBOARD TOUR (3 minutes)

### Operator Deal Hub

**Action:** Open the sample deal workspace.

> "The Operator Deal Hub is the working surface for an acquisition. The team can review criteria, source coverage, phase playbooks, launch workflows, and package outputs without leaving the browser."

**Point out:**
- Overview with current run status and source coverage
- Phase workspaces for Underwriting, Due Diligence, Financing, Legal, and Closing
- Documents and Package tabs

### Workflow Launcher

**Action:** Open the workflow launcher.

> "The workflow launcher lets an operator choose the outcome, inspect inputs, and select the runtime. They can use offline simulation for a fast local demo or live Codex agents through a ChatGPT-authenticated Codex CLI session."

**Point out:**
- Outcome workflows such as quick screen, underwriting refresh, financing package, legal review, and full acquisition review
- Runtime selector for Simulation or Codex / ChatGPT
- Agent count and concurrency controls for live Codex runs

### Documents and Package

**Action:** Open Documents, then Package.

> "Source files can be uploaded, classified, extracted, reviewed, and applied to the deal. When a run finishes, the Package view collects workpapers, findings, document manifests, source-backed inputs, and the final recommendation."

**If a completed run is available, highlight:**
- Workpapers and Codex memos
- Red flags and data gaps
- Decision log and source coverage

---

## RESULTS (5 minutes)

### Due Diligence Findings

> "Let's look at what the Due Diligence phase found."

**Key Metrics to Discuss:**
- Unit mix validation: "The system verified 200 units across 4 floor plan types"
- Occupancy: "Current occupancy is 93%, with market at 95%"
- Loss-to-lease: "In-place rents are 8-10% below market, confirming value-add potential"
- Physical condition: "Building systems are functional but dated"

### Underwriting Output

> "The Underwriting phase builds a complete financial model."

**Key Metrics:**
- Year 1 NOI: ~$1.92M (current) → $2.24M (stabilized)
- Going-in Cap Rate: 6.0%
- Exit Cap Rate: 5.75% (5-year assumption)
- DSCR: 1.35x (exceeds 1.25x minimum)
- Projected IRR: 15.2% (meets 15% target)
- Equity Multiple: 1.85x (meets 1.8x target)

> "The system also runs 27 sensitivity scenarios: stress tests for rent growth, expense inflation, cap rate changes, and interest rate movements."

### Final Verdict

> "After all phases complete, the system produces a go/no-go recommendation."

**Show or describe expected outcome:**

> "For Parkview Apartments, we expect a CONDITIONAL PASS. The deal meets financial thresholds, but there are conditions: confirming renovation costs, addressing deferred maintenance items, and completing estoppel collection."

**Highlight the Value:**
- Consistent application of investment criteria
- No deals slip through the cracks
- Full documentation for IC presentation

---

## VALUE PROPOSITION (2 minutes)

### Time Savings

> "Let's talk about the impact on your business."

| Manual Process | AI-Powered |
|----------------|------------|
| 2-3 weeks | 24-48 hours |
| 5+ analysts | 1 deal manager |
| Multiple handoffs | Single automated workflow |
| Variable quality | Consistent analysis |

### Never Misses a Step

> "The system follows the same comprehensive checklist every time. It won't forget to check the Phase 1 environmental report. It won't skip the rent roll validation. Every deal gets the same rigorous analysis."

### Full Audit Trail

> "Every decision, every calculation, every finding is logged and traceable. When you present to your investment committee, you have complete documentation of how you arrived at your recommendation."

### Scalable Deal Flow

> "This means you can evaluate more deals without growing headcount. Your team focuses on relationship building and negotiation while the AI handles the analytical heavy lifting."

---

## Q&A (2 minutes)

### Anticipated Questions

**Q: "How accurate is it?"**
> "The system applies the same analytical frameworks your team uses. It's not making judgment calls on its own - it's applying your investment criteria consistently. The accuracy matches or exceeds manual analysis because it doesn't get tired or skip steps."

**Q: "What about unique situations?"**
> "The system flags unusual items for human review rather than making assumptions. If something doesn't fit the typical pattern, it escalates. Your team still makes the final call."

**Q: "How does it integrate with our existing process?"**
> "It produces standard output formats: IC memos, underwriting summaries, due diligence checklists. These slot directly into your existing investment committee process."

**Q: "What about data security?"**
> "The default demo and dashboard storage run locally, with runtime files written under the local data folder. If we switch to the optional live Codex runtime, selected prompts and deal context are sent through the user's ChatGPT-authenticated Codex session, so we only use that path for data approved for that environment."

**Q: "Can we customize the criteria?"**
> "Absolutely. Investment thresholds, risk tolerances, deal structures - all configurable through threshold files. Different strategies can have different parameters."

---

## Closing

> "What you've seen today is a transformation of the acquisition analysis process. Faster, more consistent, fully documented. This is how modern CRE firms are gaining competitive advantage in deal sourcing and execution."

> "I'm happy to dive deeper into any aspect of the system, or we can discuss how this would integrate with your specific workflow."

---

## Demo Recovery Notes

If something goes wrong during the demo:

1. **Dashboard won't load**: "Let me show you the output files directly" → Open `data/reports/` folder
2. **Pipeline stalls**: "This is actually a great feature - the system checkpoints progress so we can resume exactly where we left off"
3. **Unexpected error**: "The error handling system captures full details for debugging. Let me show you how we'd diagnose this in production"

Remember: Confidence sells. Every technical hiccup is an opportunity to demonstrate the system's resilience.
