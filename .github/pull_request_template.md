## What does this PR do?

<!-- Describe the change in 1-3 sentences -->

## Related issue

<!-- Link to the issue this PR addresses: Fixes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] New or modified agent prompt
- [ ] New or modified skill / domain knowledge file
- [ ] New asset type support
- [ ] Documentation
- [ ] Configuration / threshold change
- [ ] Dashboard UI change
- [ ] DevOps / CI

## Checklist

- [ ] `npm test` passes (all 3 scenarios + failure/resume)
- [ ] `node scripts/validate-contracts.js --deal-id parkview-2026-001` passes
- [ ] Dashboard changes pass `cd dashboard && npm ci && npm run build`
- [ ] Dashboard UX changes pass `cd dashboard && npm run test:e2e`
- [ ] New agent prompts follow the 19-section anatomy (`docs/AGENT-DEVELOPMENT.md`)
- [ ] New JSON schemas are valid and any runtime consumers are updated if needed (for example `scripts/validate-contracts.js`)
- [ ] Documentation updated if needed

## Testing

<!-- How did you verify this works? -->

## Screenshots

<!-- If dashboard changes, include before/after screenshots -->
