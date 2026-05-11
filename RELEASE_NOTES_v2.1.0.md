# v2.1.0 - Codex / ChatGPT Workflow Runtime

This release makes the project easier to run from a fresh open-source checkout with either the no-key local simulation path or real markdown agents through OpenAI Codex CLI using an existing ChatGPT subscription login.

## Highlights

- Added a ChatGPT-authenticated Codex runtime path using the open-source Codex CLI harness and `codex exec`.
- Added dashboard runtime selection so supported workflows can launch through either offline simulation or live Codex / ChatGPT execution.
- Added an in-app **Login to ChatGPT** button that starts the local Codex CLI login flow and reports auth readiness without exposing credentials.
- Added first-download setup helpers:
  - `npm run setup`
  - `npm run setup -- --require-codex`
  - `npm run codex:status`
  - `npm run codex:smoke`
  - `npm run codex:run`
  - `npm run codex:run:full`
- Added `scripts/codex-agent-runner.js` to run selected workflow agents, phases, or explicit agents through Codex.
- Added `scripts/lib/codex-cli.js` for Windows-safe Codex CLI detection, login checks, and streaming execution.
- Added `scripts/setup.js` and `scripts/setup.cmd` for first-run onboarding.
- Added `scripts/codex-run.cmd` for Windows-friendly direct Codex runner invocation.

## Dashboard Integration

- Workflow Launcher and phase workspaces now include a runtime selector.
- Codex launch controls include max agents, concurrency, sandbox, model, and optional web search settings.
- Dashboard-launched Codex runs write raw prompts, logs, manifests, summaries, and memos under `data/codex-runs/{runId}/`.
- The same live run also publishes Package-view artifacts under:
  - `data/status/{dealId}/run-{runId}-events.ndjson`
  - `data/status/{dealId}/run-{runId}-documents.json`
  - `data/status/{dealId}/run-{runId}-manifest.json`
- The header and run status API report the active runtime provider, including `Run: Completed / Codex` after live runs finish.

## Open-Source Readiness

- README, launch docs, first-deal guide, dashboard setup, prerequisites, troubleshooting, demo guides, FAQ, and security policy now distinguish local simulation from optional live Codex data flow.
- Runtime outputs are gitignored, including `data/codex-runs/`, `data/runs/`, and `data/normalized/`.
- Setup no longer blocks offline-only users if Codex install or login is skipped.
- `npm run setup -- --require-codex` is available for users who want setup to fail unless Codex CLI and ChatGPT login are ready.
- Run IDs are restricted to safe slugs before writing generated Codex or dashboard artifact paths.
- Demo scripts no longer reference removed `demo/deals/*` sample files.

## Validation

- Added `npm run validate:codex`.
- Codex validation checks:
  - `data/codex-runs/{runId}/manifest.json`
  - `data/codex-runs/{runId}/summary.md`
  - successful agent output files
  - dashboard story event files
  - dashboard document registry files
  - Package-view Codex memo and run summary artifacts
- E2E test runner now reuses an existing local watcher instead of printing port-in-use stack traces when the dashboard is already open.

## Verified For Release

- `npm run setup -- --check`
- `npm run setup -- --check --require-codex`
- `npm run demo`
- `npm run validate`
- `npm test`
- `npm --prefix dashboard run build`
- `npm run codex:status`
- `npm run codex:smoke`
- `npm run validate:codex`
- `npm run test:e2e`
- Browser clickthrough launched a real dashboard Codex run and verified `/api/run/status`, `/api/run/{runId}/events`, `/api/run/{runId}/documents`, and Codex contract validation.

## Compatibility Notes

- The default runtime remains the local deterministic simulation and does not require API keys or an AI subscription.
- Live Codex runs use the user's Codex CLI authentication. If using ChatGPT login, choose **Sign in with ChatGPT** during `codex login`.
- The dashboard auth panel returns status only; Codex tokens, cookies, API keys, and credential files are not stored in or exported from this repository.
- Live Codex runs send selected prompts and deal context through the authenticated Codex session. Use offline simulation for local-only demos or data that is not approved for Codex.
- No migration is required for v2.0.0 Operator Deal Hub data.
