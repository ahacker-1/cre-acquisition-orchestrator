# cre-acquisition-orchestrator

Multi-agent AI orchestration framework for commercial real estate acquisitions

## Quick Links
- Repository: https://github.com/ahacker-1/cre-acquisition-orchestrator.git
- License: Apache-2.0

## Docs
- [Agent Catalog](docs/AGENT-CATALOG.md)
- [Agent Development](docs/AGENT-DEVELOPMENT.md)
- [API Reference](docs/API-REFERENCE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Contributing a New Specialist Agent](docs/CONTRIBUTING-AGENTS.md)
- [Dashboard Architecture](docs/DASHBOARD-ARCHITECTURE.md)
- [Dashboard Setup](docs/DASHBOARD-SETUP.md)
- [Deal Configuration Reference](docs/DEAL-CONFIGURATION.md)
- [Demo Journey](docs/DEMO-JOURNEY.md)
- [Deployment (Single-Operator Self-Host)](docs/DEPLOYMENT.md)
- [First Deal Guide](docs/FIRST-DEAL-GUIDE.md)
- [Glossary](docs/GLOSSARY.md)
- [Interpreting Results](docs/INTERPRETING-RESULTS.md)
- [Public Issue Seeds](docs/ISSUE-SEEDS.md)
- [Launch Procedures](docs/LAUNCH-PROCEDURES.md)
- [Prerequisites](docs/PREREQUISITES.md)
- [Quick Demo: First Real Deal Workspace in 10 Minutes](docs/QUICK-DEMO.md)
- [Runtime Comparison: Offline Demo vs Live Codex Agents](docs/RUNTIME-COMPARISON.md)
- [Threshold Customization Guide](docs/THRESHOLD-CUSTOMIZATION.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [WebSocket Events](docs/WEBSOCKET-EVENTS.md)

## Project Structure
- agents
- config
- dashboard
- data
- demo
- docs
- documents
- eval
- fixtures
- orchestrators
- schemas
- scripts
- skills
- tasks
- templates
- validation

## Package Scripts
- `setup`: node scripts/setup.js
- `first-run`: node scripts/setup.js --with-demo
- `demo`: node scripts/demo-run.js --deal config/deal.json --scenario core-plus --seed 42
- `demo:verify`: node scripts/demo-verify.js
- `test:goal-helper`: node scripts/goal-helper.test.js
- `test:enums`: node scripts/check-legacy-enums.js
- `test:security`: cd dashboard && npm exec tsx ../scripts/security-hardening.test.mjs
- `test:parsers`: cd dashboard && npm exec tsx ../scripts/parser-service.test.mjs
- `test:pile`: cd dashboard && npm exec tsx ../scripts/real-world-pile.test.mjs
- `test:workspace`: cd dashboard && npm exec tsx ../scripts/workspace-service.test.mjs
- `test:runtime-lock`: node scripts/runtime-core-lock.test.js
- `test:eval`: node scripts/eval-scoring.test.mjs
- `simulate`: node scripts/orchestrate.js --deal config/deal.json --scenario core-plus --seed 42
- `dashboard`: npm --prefix dashboard install && npm --prefix dashboard run dev
- `dev`: npm run dashboard
- `validate`: node scripts/validate-contracts.js
- `validate:fixtures`: node scripts/validate-fixtures.js
- `validate:docs`: node scripts/verify-doc-counts.js
- `validate:guides`: node scripts/validate-operator-guides.js
- `validate:codex`: node scripts/validate-contracts.js --codex-run-id codex-smoke
- `eval`: node eval/run-eval.mjs
- `eval:offline`: node eval/run-eval.mjs --mode offline
- `eval:extraction`: node eval/run-eval.mjs --mode extraction
- `eval:sim`: node eval/run-eval.mjs --mode sim
- `eval:live`: node eval/run-eval.mjs --mode live
- `eval:reparse`: node eval/run-eval.mjs --mode reparse
- `test`: node scripts/check-legacy-enums.js && node scripts/validate-fixtures.js && node scripts/verify-doc-counts.js && node scripts/runtime-core-lock.test.js && node scripts/goal-helper.test.js && cd dashboard && npm exec tsx ../scripts/security-hardening.test.mjs && npm exec tsx ../scripts/real-world-pile.test.mjs && npm exec tsx ../scripts/dashboard-lib.test.mjs && cd .. && node scripts/system-test.js && node scripts/codex-runtime.test.mjs && node scripts/eval-scoring.test.mjs
- `screenshots`: node dashboard/scripts/capture-release-screenshots.mjs
- `serve`: node scripts/serve-prod.mjs
- `release:check`: node scripts/release-check.js
- `test:e2e`: npm --prefix dashboard run test:e2e
- `codex:status`: node scripts/codex-status.js
- `codex:smoke`: node scripts/codex-agent-runner.js --workflow underwriting-refresh --max-agents 1 --concurrency 1 --run-id codex-smoke
- `codex:run`: node scripts/codex-agent-runner.js --workflow quick-deal-screen --concurrency 2
- `codex:run:full`: node scripts/codex-agent-runner.js --workflow full-acquisition-review --concurrency 3
- `generate-readme`: node scripts/generate-readme.js

## How to generate this README
Run `npm run generate-readme` to regenerate this file.