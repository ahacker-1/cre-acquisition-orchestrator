# Contributing

Thanks for your interest in the CRE Acquisition Orchestrator! Contributions are welcome.

## How to Contribute

1. **Open an issue first** — Before starting work, open an issue describing what you'd like to change. This ensures we're aligned before you invest time.

2. **Fork and branch** — Fork the repo, create a feature branch from `main`.

3. **Make your changes** — Follow the existing code style and patterns.

4. **Test your changes** — Run the simulation and validation:
   ```bash
   npm test
   node scripts/validate-contracts.js --deal-id parkview-2026-001
   cd dashboard && npm run build && npm run test:e2e
   ```

5. **Submit a PR** — Reference the issue in your pull request description.

## Running Locally

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/cre-acquisition-orchestrator.git
cd cre-acquisition-orchestrator

# Run the simulation
npm run demo

# Start the dashboard
npm run dashboard
# Dashboard available at http://localhost:5173
```

The dashboard stores local deal workspaces, uploaded source documents, extraction previews, presets, and run snapshots under `data/`. These runtime files are ignored by git and should not be included in pull requests.

## Code Style

- JavaScript/Node.js for scripts and orchestration engine
- TypeScript + React for the dashboard
- Markdown for agent prompts and documentation
- JSON Schema for data contracts

## Questions?

Open an issue with the `question` label.
