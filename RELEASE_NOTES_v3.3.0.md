# Release Notes v3.3.0 - Codex Main Lane + Live Web Search

Released: 2026-06-22

v3.3.0 makes **live Codex / ChatGPT the default workflow lane** and gives the agent team **real web search**. A launched workflow now runs on live agents by default and actually goes online — pulling cited market, lender, and environmental data — instead of reasoning only over local fixtures. The deterministic Simulation runtime stays as the no-credential fallback for demos, screenshots, and CI. The release also adds lean legal-document parsing and lands the intake/extraction/launch UX fixes and e2e/CI stabilization from the 3.2.x line.

## Highlights

- **Codex is the main runtime** - the dashboard launches the selected workflow on live Codex / ChatGPT by default. The Workflow Launcher, Swarm Goal Console, and saved presets default to Codex (listed first, all selected agents, concurrency 2). Simulation remains the safe, no-credential fallback.
- **Agents actually use web search** - when Codex web search is on, agents are directed to look up and cite real rent/sales comps, submarket rents, occupancy, cap rates, demographics, supply pipeline, and current rates - and not to claim search is unavailable when it is enabled. Web search is on by default with a visible toggle, and the Swarm launch and retry-failed-agents paths keep it on.
- **Live, cited research** - verified runs pull real sources such as US Census / Census Reporter, FRED, HUD / Fannie Mae term sheets, county appraisal districts, and apartment-listing data, with the source URL cited next to each fetched figure.
- **Lean legal-document parsing** - PSA, title commitment, and estoppel documents parse into review-gated candidate fields with provenance, fixtures, and tests.
- **Swarm console launches live Codex** - the Swarm Goal Console runs the recommended swarm on the Codex runtime with web search, not just the deterministic simulation.

## Operator Impact

1. Sign in once with `npm run codex:status` or the dashboard **Login to ChatGPT** button (no repo-stored API key; uses your local Codex CLI / ChatGPT session).
2. Drop a deal package and review the source-backed fields.
3. Launch the selected workflow - it runs on Codex by default, with web search on.
4. The specialist team produces source-backed workpapers that cite real, current market data, and honestly flag what public search cannot find (e.g. proprietary sales comps).
5. Recover partial runs by re-running only the failed agents, with web search preserved.
6. Use Simulation when you need a no-credential, deterministic tour, screenshots, or CI.

## Bug Fixes

- T12 operating expenses are stored as a positive magnitude (deal schema `minimum: 0`), so the extraction applies cleanly instead of throwing on every workspace load.
- Source reconciliation no longer false-flags equal values (numeric/format-aware comparison with a 0.1% tolerance), and the "Sources disagree" message now names the actual conflicting read's value instead of re-showing the applied value.
- Blocked phase launch surfaces the specific missing required fields inline with an **Open Edit Deal** shortcut, instead of failing silently.
- Edit Deal wizard step pills are clickable and jump to a step.
- Sample/demo deals are aligned to the schema's `timeline.extensionOptions` object shape so the bundled samples validate.
- The uploaded data inspector renders negative spreadsheet cells without the CSV formula-injection apostrophe (display only; the sanitizer and its security test are unchanged), and the IC starter-package source-coverage line reads `N approved (M required)`.
- Scoped-workflow reports list only the agents that actually ran in the Workpaper Index.
- Dashboard workspace overlay race and modal staging fixes stabilize recovery and stage flows; CI feedback for the v3 checks is faster.

## Verification

- `npm test`
- `npm --prefix dashboard run typecheck`
- `npm --prefix dashboard run test:e2e`
- `npm run codex:status` plus live Codex single-agent and multi-agent (`quick-deal-screen`) runs with web search, confirming real cited sources and passing `node scripts/validate-contracts.js --codex-run-id <run>`.

## Safety Notes

- Live runs send selected prompts and approved deal context through your authenticated Codex CLI / ChatGPT session. Do not run live workflows on confidential deal data unless that data is approved for that environment.
- No credentials are stored in the repository; dashboard status returns booleans only and never exposes token or cookie contents. Per-agent run logs are redacted on disk.
- Web search returns generic LLM web results, not a structured listing/comp/rate data feed; proprietary deal-flow data (e.g. CoStar/Crexi/LoopNet) remains out of scope and is honestly flagged as a data gap.
