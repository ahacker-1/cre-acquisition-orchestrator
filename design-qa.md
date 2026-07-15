# Design QA — Luxury Facelift

## Reference and target

- Selected direction: `audit-artifacts/luxury-facelift-2026-07-15/concepts/03-architectural-graphite-console.png`
- Primary state: Parkview Apartments guided demo, Underwriting focused
- Reference-state match: Conditional verdict, 100% complete, three findings, two red flags, one data gap
- Desktop CSS viewport: 1440 × 1024 (capture pixels reflect the in-app browser's device-pixel scaling)
- Mobile CSS viewport: 390 × 844 (capture pixels reflect the in-app browser's device-pixel scaling)
- Final reference comparison: `audit-artifacts/luxury-facelift-2026-07-15/implementation/reference-vs-underwriting-final.png`

## Full-view evidence

- Front door: `audit-artifacts/luxury-facelift-2026-07-15/implementation/front-door-1440x1024.jpg`
- Intake: `audit-artifacts/luxury-facelift-2026-07-15/implementation/intake-1440x1024.jpg`
- Underwriting: `audit-artifacts/luxury-facelift-2026-07-15/implementation/underwriting-1440x1024.jpg`
- Matched-state Underwriting: `audit-artifacts/luxury-facelift-2026-07-15/implementation/underwriting-conditional-1440x1024.jpg`
- IC package: `audit-artifacts/luxury-facelift-2026-07-15/implementation/ic-package-1440x1024.jpg`
- Mobile Intake: `audit-artifacts/luxury-facelift-2026-07-15/implementation/mobile-intake-390x844.jpg`
- Mobile Underwriting: `audit-artifacts/luxury-facelift-2026-07-15/implementation/mobile-underwriting-390x844.jpg`

## Focused comparison evidence

- Selected reference vs final Underwriting in the same Conditional / 100% / populated-evidence state: `audit-artifacts/luxury-facelift-2026-07-15/implementation/reference-vs-underwriting-final.png`
- Before vs after Underwriting: `audit-artifacts/luxury-facelift-2026-07-15/implementation/before-vs-after-underwriting.png`
- Before vs after front door: `audit-artifacts/luxury-facelift-2026-07-15/implementation/before-vs-after-front-door.png`

## Iteration history

- P0: None observed. Core navigation, stage focus, deal library, guided demo, agent summon, command routing, and source-backed evidence workflows remained functional.
- P1: The initial responsive grid could create horizontal overflow on narrow viewports. Fixed by constraining the implicit workspace grid to `minmax(0, 1fr)`, making the utility dock full width on mobile, and reserving bottom safe space.
- P1: The command composer could fall below the desktop viewport because the context rail inherited content height. Fixed with a height-constrained sticky right rail and internal scrolling.
- P1: Opening the front door during an active run initially hid the run status and Stop action. Fixed with a compact live-run control in the front-door header and a dedicated regression assertion.
- P1: The deal editor and Advanced workflow launcher initially retained legacy rounded controls and white/black CTAs. Fixed by carrying the graphite surfaces, square hairlines, copper primary action, and shared field treatment into both operational surfaces.
- P1: The first IC-package capture combined a complete run badge with stale pending phase data and an “in progress” recommendation. Replaced it with a fresh completed full-acquisition simulation showing five complete phases, 35 filed workpapers, an explicit source-readiness warning, and a committee-review recommendation.
- P2: The first implementation underplayed the selected reference's verdict hierarchy and brief density. Fixed with a larger editorial verdict, a side-by-side status band, tighter evidence rhythm, a copper next-action rule, and a circular action icon.
- P2: The Advanced drawer remains intentionally denser than the primary deal space because it is a secondary power-user surface.

## Intentional deviations

- Real command suggestions remain above the composer because they are functional shortcuts in the existing product.
- The code-native `AO` monogram is paired with the full product name; no unsupported logo asset was invented.
- Verdicts, source readiness, and evidence rows remain derived from live checkpoint state rather than being hard-coded to the concept's sample values.

## Verification

- Browser interaction pass: front door, guided demo, lifecycle stages, Advanced drawer, deal library, agent panel, command routing, and Escape behavior.
- Browser console: no warnings or errors in the final reviewed states.
- WCAG A/AA and color-contrast checks: passed for the loaded workspace states covered by the automated accessibility suite.
- Typecheck and production build: passed.
- Root `npm run verify:v3`: passed, including 42 browser tests and the mobile guided-workspace smoke test.

passed
