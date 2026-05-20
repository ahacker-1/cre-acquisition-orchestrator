# Release Notes — v2.6.0

## Credibility and Infrastructure Hardening

v2.6.0 is the release that makes the public project easier to trust after the source-backed intake milestone. It turns the bundled Parkview sample into a more practitioner-grade diligence package, tightens schema/runtime boundaries, improves dashboard stability, and refreshes public docs/screenshots around the first-time visitor journey.

## What Changed

### Practitioner-grade Parkview proof package

- Reworked the Parkview sample around Austin/Travis County underwriting context.
- Replaced thin placeholder outputs with populated specialist workpapers across diligence, underwriting, financing, legal, and closing.
- Added richer 10-year pro forma support, scenario matrices, risk-scored IC memo inputs, closing workpapers, and funds-flow artifacts.
- Added checks that keep the sample from regressing into incomplete workpapers.

### Strict contracts and canonical CRE vocabulary

- Tightened AJV schema validation and shared enum references.
- Added per-agent output schemas for critical specialist outputs.
- Aligned underwriting vocabulary around EGI, NOI, concessions, bad debt, RUBS recovery, reassessment assumptions, DSCR thresholds, and scenario probability policy.
- Added fixture and docs drift checks so generated public counts stay honest.

### Local dashboard hardening

- Hardened local file/path handling, upload boundaries, watcher behavior, and race-prone polling paths.
- Added route-level error boundaries and centralized dashboard API/WebSocket configuration.
- Improved dashboard launch lifecycle behavior and checkpoint workspace reveal stability.
- Added local security coverage for path, upload, loopback, throttling, and CSV formula-sanitization boundaries.

### Public proof and documentation

- Restored a comprehensive README showcase with the first-time visitor path, release journey, screenshots, and current-main status.
- Added API and WebSocket documentation for contributors.
- Added an agent catalog so the 31-role architecture is easier to inspect.
- Refreshed public screenshot assets for the front door, quick-create flow, command surfaces, workpapers, and IC package.
- Added release-please automation and removed noisy governance automation that was distracting from the public product story.

## Validation

The v2.6.0 line includes targeted coverage for:

- Contract/schema validation.
- Fixture validation and docs drift checks.
- Runtime lock behavior.
- Goal-helper determinism.
- Parser and workspace service tests.
- Dashboard production build and Playwright coverage for the first-real-deal / checkpoint workspace paths.
- Local dashboard security hardening checks.

Recommended local verification before building on this release:

```bash
npm run demo:verify
npm test
npm --prefix dashboard run build
npm --prefix dashboard run test:e2e
```

## Known Limits

- PDF/OCR extraction is still not the default source-backed parser path.
- The local deterministic demo remains the safest public proof path; live Codex / ChatGPT execution is optional and should be used only after data-sharing boundaries are understood.
- This remains a reference architecture and educational framework, not autonomous investment, legal, lending, or closing advice.

## Upgrade Notes

- Pull the latest `main` or checkout `v2.6.0`.
- Reinstall dependencies if your local lockfiles changed:

```bash
npm install
npm --prefix dashboard install
```

- Run `npm run demo:verify` to regenerate and validate the offline demo path.
