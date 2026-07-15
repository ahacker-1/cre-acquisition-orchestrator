# Architectural Graphite Console — implementation inventory

Reference: `concepts/03-architectural-graphite-console.png` (1487 × 1058)

## Direction

Quiet institutional luxury: a full-bleed graphite console with editorial serif hierarchy,
hairline structure, a restrained copper action, and semantic color reserved for evidence state.
The reference is a production specification for the existing application, not permission to
invent deal data or remove operational controls.

## Geometry

- Desktop shell: 185px lifecycle rail, fluid primary stage, 330px context rail.
- Header: approximately 162px tall, with 54–56px primary-content inset.
- Primary stage: wide editorial rows separated by hairlines; no nested card grid.
- Context rail: 20px inset and a command composer pinned to the bottom.
- Responsive: three rails at 1280px+, horizontal lifecycle and stacked context below 1280px,
  single-column composition below 768px.

## Tokens

- Canvas: `#0f1820`; deeper rail: `#0c151c`; elevated wash: `#131f27`.
- Hairline: `rgba(174, 190, 199, 0.16)`; strong divider: `rgba(180, 194, 202, 0.22)`.
- Text: `#f4f2ee`; secondary `#b9bec2`; muted `#8f99a2`; low emphasis `#74808a`.
- Copper: `#c88768`; action surface `#9a5e40`; hover `#ab6a49`.
- Semantic only: green `#78b77d`, coral `#ec6e5b`, amber `#dfb565`, blue `#6f9de2`.

## Typography

- Display: Playfair Display 600 for the deal title and stage verdict.
- Interface/body: Inter 300/400/500/600.
- Deal title: 48–52px; verdict: 64–72px; section title: 20–22px.
- Eyebrows: 10–11px, 0.14em tracking; metadata: 12–13px, 0.12em tracking.

## Component contract

- Left rail: real product name, selected deal, seven-stage lifecycle, quiet utility actions.
- Header: deal identity, Advanced, and at most one phase-specific primary action.
- Stage: status band, decision brief, next action, evidence-backed findings, then operational
  controls below the decision surface.
- Right rail: Live Team state, focused team, roster summon, and persistent command composer.
- Use Tabler line icons at 1.4–1.6 stroke. Do not use handcrafted SVG or text glyph icons.

## Evidence and behavior guardrails

- Derive verdicts, findings, flags, gaps, progress, and team state from the loaded checkpoint.
- Preserve provenance, runtime configuration, checklists, documents, agents, test IDs, keyboard
  behavior, dialogs, and accessibility semantics.
- The `AO` mark in the generated reference is not a logo asset; use a code-native text monogram
  only alongside the real product name.
- Keep all dense operational controls available below the brief or in Advanced, rather than
  allowing them to compete with the decision hierarchy.
