# Pre-Demo Checklist

Complete this checklist 30 minutes before every demo to ensure a smooth presentation.

---

## Environment Verification

### 1. Terminal/Command Line

- [ ] Open a terminal window
- [ ] Navigate to the project directory:
  ```powershell
  cd C:\path\to\cre-acquisition-orchestrator
  ```
- [ ] Verify Node.js is installed:
  ```powershell
  node --version
  # Should show v18.x.x or higher
  ```

### 2. Setup and Codex Check

- [ ] Install dependencies from the repo root:
  ```powershell
  npm install
  ```
- [ ] Run setup:
  ```powershell
  npm run setup
  ```
- [ ] Optional for live agents, verify Codex status:
  ```powershell
  npm run codex:status
  ```

### 3. Deal Configuration

- [ ] Verify deal config exists and is valid JSON:
  ```powershell
  Get-Content config/deal.json -TotalCount 20
  # Should display JSON without syntax errors
  ```
- [ ] For Parkview demo, ensure this file contains the Parkview deal
- [ ] Alternatively, copy the blank example deal:
  ```powershell
  Copy-Item config/deal-example.json config/deal.json
  ```

---

## Dashboard Startup

### 4. Start the Dashboard

- [ ] From the repo root, run:
  ```powershell
  npm run dashboard
  ```
- [ ] Wait for the "ready" message:
  ```
  VITE v5.x.x ready in XXX ms
  ➜ Local: http://localhost:5173/
  ```
- [ ] Note: Keep this terminal window open during the demo

### 5. Browser Setup

- [ ] Open Chrome (recommended for best compatibility)
- [ ] Navigate to: **http://localhost:5173**
- [ ] Verify the dashboard loads without errors
- [ ] Check the connection indicator (top right):
  - Green dot = Connected
  - Red dot = Disconnected (troubleshoot before demo)

### 6. Browser Optimization

- [ ] Set zoom to **125%** for better visibility on projector/screen share
- [ ] Close unnecessary browser tabs
- [ ] Disable browser notifications
- [ ] Ensure "Do Not Disturb" mode is on (OS level)

---

## Demo Content Verification

### 7. Deal Data Check

In the dashboard, verify:
- [ ] Deal library or sample deal workspace displays correctly
- [ ] No error messages in the main content area
- [ ] Workflow Launcher, Documents, and Package views open without console errors

### 8. Sample Files Available

Verify these files exist and are accessible:
- [ ] `config/deal.json` - Main deal configuration
- [ ] `config/deal-example.json` - Blank deal template
- [ ] `data/examples/parkview-2026-001/reports/final-report.md` - Sample completed output
- [ ] `demo/scripts/executive-demo.md` - Demo script

---

## Backup Preparations

### 9. Offline Materials (if pipeline won't run live)

If you need to show results without running live:
- [ ] Prepare screenshots of dashboard in various states
- [ ] Have sample `data/reports/` output files ready
- [ ] Prepare the decision card template with sample data

### 10. Recovery Scripts

Know these commands for quick recovery:

**Dashboard won't load:**
```powershell
# Kill any processes on port 5173
npx kill-port 5173
# Restart dashboard
npm run dashboard
```

**Need to restart fresh:**
```powershell
# Clear any stale state
Remove-Item data/status/*.json -Force -ErrorAction SilentlyContinue
Remove-Item data/logs/* -Recurse -Force -ErrorAction SilentlyContinue
# Restart dashboard
npm run dashboard
```

**Pipeline seems stuck:**
```powershell
# Check the logs
Get-ChildItem data/logs -Recurse -Filter master.log | Select-Object -First 1 | Get-Content -Tail 50
# The checkpoint system means you can resume
```

---

## Screen Setup

### 11. Display Configuration

- [ ] If presenting on external display/projector, set up before demo
- [ ] Position windows:
  - Main: Dashboard (browser) - full screen or maximized
  - Secondary: Terminal with running dashboard server
  - Tertiary (optional): Editor with deal.json visible
- [ ] Test screen share if remote presentation

### 12. Font/Visibility Check

- [ ] Dashboard text is readable at presentation distance
- [ ] Terminal output is legible if you'll show it
- [ ] JSON/code is readable in editor if showing config

---

## Final Checks (5 minutes before)

### 13. Quick Functional Test

- [ ] Refresh the dashboard page
- [ ] Click through the Operator Deal Hub: Overview, Workflows, Documents, and Package
- [ ] Verify no JavaScript errors in browser console (F12 → Console)

### 14. Presenter Prep

- [ ] Demo script open in separate window/device for reference
- [ ] Water/beverage available
- [ ] Notes for Q&A section reviewed
- [ ] Timer ready (optional, for pacing)

### 15. Contingency Ready

- [ ] Know your backup plan if live demo fails
- [ ] Have phone/contact ready for technical support
- [ ] Static screenshots/slides as last resort

---

## Quick Reference Commands

| Action | Command |
|--------|---------|
| First setup | `npm install` then `npm run setup` |
| Start dashboard | `npm run dashboard` |
| Offline demo | `npm run demo` |
| Codex status | `npm run codex:status` |
| Live Codex smoke | `npm run codex:smoke` |
| Live Codex run | `npm run codex:run` |
| Check Node version | `node --version` |
| Reinstall deps | `npm install` |
| Kill port 5173 | `npx kill-port 5173` |
| View deal config | `Get-Content config/deal.json` |
| Copy blank deal template | `Copy-Item config/deal-example.json config/deal.json` |
| Check latest logs | `Get-ChildItem data/logs -Recurse -Filter master.log | Select-Object -First 1 | Get-Content -Tail 50` |

---

## Troubleshooting During Demo

### Dashboard Shows "Disconnected"

**Quick fix:** Refresh the page. If still disconnected:
1. Check terminal - is the dev server running?
2. Restart: `npm run dashboard`
3. Refresh browser

### Pipeline Not Starting

**Say:** "Let me verify the configuration..."
1. Check `config/deal.json` exists
2. Verify JSON syntax is valid
3. Show the config file to demonstrate what's needed

### Unexpected Error

**Say:** "This is actually a great opportunity to show our error handling..."
1. Note the error message
2. Show it logs the error with full details
3. Explain the checkpoint/resume capability

### Demo Going Long

- Skip the technical deep-dive sections
- Focus on: Overview → Dashboard Tour → Key Metrics → Q&A
- Offer to schedule follow-up for technical details

---

## Post-Demo

- [ ] Save any generated reports for follow-up
- [ ] Note any questions that need research
- [ ] Stop the dashboard server if done: `Ctrl+C` in terminal
- [ ] Document any issues encountered for improvement
