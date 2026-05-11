# Known Issues & Troubleshooting Guide

This document covers common issues you may encounter when running the CRE Acquisition Orchestrator and their solutions.

---

## Dashboard Issues

### Issue: Dashboard Shows Blank Screen

**Symptoms:**
- Browser loads but shows white/blank page
- No error message visible
- Connection indicator not visible

**Causes:**
1. JavaScript bundle failed to load
2. Browser cache conflict
3. Build error during development

**Solutions:**

1. **Hard refresh the browser:**
   - Windows/Linux: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

2. **Clear browser cache:**
   - Open DevTools (F12)
   - Right-click refresh button → "Empty Cache and Hard Reload"

3. **Restart the dev server:**
   ```powershell
   # Stop current server (Ctrl+C)
   # Restart
   npm run dashboard
   ```

4. **Check for build errors:**
   ```powershell
   # Look at terminal output for errors
   # If errors exist, try:
   npm install
   npm run dashboard
   ```

5. **Check browser console:**
   - Open DevTools (F12) → Console tab
   - Look for red error messages
   - Common: Missing dependencies, import errors

---

### Issue: "Disconnected" Status Won't Clear

**Symptoms:**
- Red dot showing "Disconnected"
- Dashboard doesn't update
- Reconnection attempts failing

**Causes:**
1. WebSocket server not running
2. Network/firewall blocking WebSocket
3. Port conflict

**Solutions:**

1. **Verify the server is running:**
   ```powershell
   # Terminal should show Vite dev server running
   # If not, restart:
   npm run dashboard
   ```

2. **Check the port:**
   ```powershell
   # See what's using port 5173
   npx kill-port 5173
   # Restart server
   npm run dashboard
   ```

3. **Check firewall/antivirus:**
   - Temporarily disable firewall
   - Add exception for localhost:5173
   - Check corporate VPN settings

4. **Try different browser:**
   - Chrome is recommended
   - Firefox/Edge may have WebSocket restrictions

---

### Issue: Dashboard Not Updating in Real-Time

**Symptoms:**
- Pipeline progress not advancing
- Logs not appearing
- Stale data displayed

**Causes:**
1. WebSocket connection dropped silently
2. Checkpoint files not being written
3. File system permission issues

**Solutions:**

1. **Force refresh:**
   - Refresh the browser page
   - Check if data updates after refresh

2. **Verify checkpoint files are updating:**
   ```powershell
   # Watch the status file for changes
   Get-ChildItem data/status
   # Check file modification times
   ```

3. **Check log files:**
   ```powershell
   # View recent logs
   Get-ChildItem data/logs -Recurse -Filter master.log | Select-Object -First 1 | Get-Content -Tail 100
   ```

4. **Verify file permissions:**
   ```powershell
   # Ensure data directory is writable
   Get-ChildItem data
   ```

---

## Pipeline Issues

### Issue: Pipeline Stalls / No Progress

**Symptoms:**
- Dashboard shows phase stuck at same percentage
- No new log entries
- Agent status shows "running" indefinitely

**Causes:**
1. Live Codex agent still running or waiting on model output
2. Optional web search or account limits slowing a live run
3. Agent prompt error
4. Background task failed silently

**Solutions:**

1. **Check the logs:**
   ```powershell
   Get-ChildItem data/logs -Recurse -Filter master.log | Select-Object -First 1 | Get-Content -Tail 200
   # Look for ERROR or WARNING entries
   # Check last activity timestamp
   ```

2. **Check individual agent checkpoints:**
   ```powershell
   Get-ChildItem data/status/*/agents
   # Look for recently modified files
   Get-Content data/status/*/agents/*.json -TotalCount 50
   ```

3. **Verify the master task is running:**
   - If using live agents, run `npm run codex:status`
   - Use `npm run codex:smoke` before relaunching

4. **Resume from checkpoint:**
   - The system automatically resumes from checkpoints
   - Relaunch the master orchestrator - it will skip completed work

5. **Manual intervention for stuck agent:**
   - Identify the stuck agent from logs
   - Update its checkpoint status to "failed"
   - Relaunch - the orchestrator will re-spawn it

---

### Issue: Phase Fails with "Missing Upstream Data"

**Symptoms:**
- Log shows: `Cannot start {phase}: upstream data from {required_phase} not found`
- Pipeline aborts early

**Causes:**
1. Previous phase didn't complete properly
2. Checkpoint file corrupted or incomplete
3. Using `startFromPhase` without prior data

**Solutions:**

1. **Check upstream phase status:**
   ```powershell
   Select-String -Path data/status/{deal-id}.json -Pattern "dueDiligence" -Context 0,5
   # Verify status is "COMPLETED"
   ```

2. **Verify required data exists:**
   ```powershell
   # Check the dataForDownstream section of the upstream phase
   Select-String -Path data/status/{deal-id}.json -Pattern "dataForDownstream" -Context 0,20
   ```

3. **Re-run the upstream phase:**
   - Clear the checkpoint status for that phase
   - Relaunch the pipeline

4. **If using `startFromPhase`:**
   - Ensure you've previously completed all earlier phases
   - Or remove the `startFromPhase` parameter to run from beginning

---

### Issue: Rate Limit Errors

**Symptoms:**
- Log shows rate limit messages
- Web searches failing
- Live Codex requests delayed or rejected

**Causes:**
1. Too many concurrent web requests
2. Search engine rate limiting
3. Codex or ChatGPT account limits during live runs

**Solutions:**

1. **Wait and resume:**
   - Rate limits typically reset in 1-5 minutes
   - The checkpoint system preserves progress
   - Relaunch to continue

2. **Check for concurrent runs:**
   - Ensure only one pipeline is running per deal
   - Multiple deals can run in parallel, but each needs its own deal ID

3. **Reduce parallelism:**
   - Reduce Codex concurrency or run a smaller workflow
   - For persistent issues, check your Codex account status and open a GitHub issue with non-sensitive logs

---

### Issue: "Deal Configuration Invalid" Error

**Symptoms:**
- Pipeline fails at startup
- Log shows JSON parse error
- "Missing required field" messages

**Causes:**
1. Malformed JSON in deal.json
2. Missing required fields
3. Invalid data types (string where number expected)

**Solutions:**

1. **Validate JSON syntax:**
   ```powershell
   # Use a JSON validator
   Get-Content config/deal.json -Raw | ConvertFrom-Json | Out-Null
   # Or use online: jsonlint.com
   ```

2. **Check required fields exist:**
   - `dealId` - string, unique identifier
   - `dealName` - string
   - `property.address`, `city`, `state`, `zip`
   - `property.propertyType` - must be "multifamily"
   - `property.yearBuilt` - number
   - `property.totalUnits` - number
   - `financials.askingPrice` - number
   - `financials.currentNOI` - number
   - `financials.inPlaceOccupancy` - decimal 0-1
   - `investmentStrategy` - "core", "core-plus", "value-add", or "opportunistic"

3. **Check data types:**
   - Numbers should not be in quotes: `"askingPrice": 32000000` not `"askingPrice": "32000000"`
   - Decimals for percentages: `0.93` not `93`

4. **Use a sample deal as template:**
   ```powershell
   Copy-Item config/deal-example.json config/deal.json
   # Then edit with your values
   ```

---

## File System Issues

### Issue: "Permission Denied" Errors

**Symptoms:**
- Cannot write to data directory
- Checkpoint updates failing
- Log files not created

**Solutions:**

1. **Check directory permissions:**
   ```powershell
   Get-ChildItem data
   # Ensure write permission for current user
   ```

2. **Fix permissions:**
   ```powershell
   # Windows: Right-click the data folder -> Properties -> Security -> Edit permissions
   ```

3. **Ensure directories exist:**
   ```powershell
   New-Item -ItemType Directory -Force data/status,data/logs,data/reports
   ```

---

### Issue: "File Not Found" for Agent Prompts

**Symptoms:**
- Log shows: `Cannot read agent prompt: {path}`
- Agent fails to launch

**Solutions:**

1. **Verify file exists:**
   ```powershell
   Get-ChildItem orchestrators
   Get-ChildItem agents
   ```

2. **Check agent registry:**
   ```powershell
   Get-Content config/agent-registry.json
   # Verify paths are correct
   ```

3. **If files are missing:**
   - Check if project was cloned completely
   - Re-pull from repository

---

## Recovery Procedures

### Complete Reset

If you need to start completely fresh:

```powershell
# 1. Stop the dashboard
# (Ctrl+C in terminal running npm run dashboard)

# 2. Clear all state
Remove-Item data/status/*,data/logs/*,data/reports/* -Recurse -Force -ErrorAction SilentlyContinue

# 3. Restart dashboard
npm run dashboard

# 4. Relaunch pipeline
```

### Resume from Specific Phase

```powershell
# Check current state
Select-String -Path data/status/{deal-id}.json -Pattern '"status"'

# Mark phase as pending to re-run
# Edit data/status/{deal-id}.json
# Set the phase status to "pending"
# Relaunch the master orchestrator
```

### Export Logs for Support

```powershell
# Create a support bundle
New-Item -ItemType Directory -Force support-bundle
Copy-Item data/status/*.json support-bundle/ -ErrorAction SilentlyContinue
Copy-Item data/logs/*/*.log support-bundle/ -ErrorAction SilentlyContinue
Copy-Item config/deal.json support-bundle/
# Zip and send to support
```

---

## Getting Help

### Information to Include in Support Requests

1. **Deal ID** - from your deal.json
2. **Error message** - exact text, including timestamps
3. **Recent logs** - last 50-100 lines from master.log
4. **Steps to reproduce** - what were you doing when it happened
5. **Environment** - OS, Node version, browser

### Support Channels

- **Documentation**: `docs/TROUBLESHOOTING.md`
- **FAQ**: `demo/docs/faq.md`
- **GitHub Issues**: https://github.com/ahacker-1/cre-acquisition-orchestrator/issues

---

## Performance Tips

1. **Close unnecessary applications** during pipeline runs
2. **Use wired network** instead of WiFi for stability
3. **Avoid running multiple deals** on the same machine simultaneously
4. **Keep browser DevTools closed** during demos (reduces memory usage)
5. **Regular restarts** - close and reopen the dashboard between long sessions
