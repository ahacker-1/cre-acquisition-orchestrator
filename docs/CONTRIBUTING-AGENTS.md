# Contributing a New Specialist Agent

This is the end-to-end walkthrough for adding a **new specialist agent** to the
CRE Acquisition Orchestrator. It is the practical, file-by-file companion to
[Agent Development](AGENT-DEVELOPMENT.md) (which documents the 19-section agent
anatomy in depth) and [Agent Catalog](AGENT-CATALOG.md) (the current roster).

By the end you will have:

1. A prompt file under `agents/<phase>/` that follows the 19-section anatomy.
2. A registry entry in `config/agent-registry.json`.
3. A per-agent output schema under `schemas/agents/<phase>/` validated by AJV in **strict mode**.
4. A fixture (if your agent ships an example output).
5. Green `npm run validate:docs`, `npm run validate:fixtures`, and `npm test`.

Throughout, we use a concrete worked example: a new **`insurance-risk-modeler`**
agent in the **due-diligence** phase that scores property insurance/replacement
cost risk. Substitute your own agent name and phase as you go.

> Phases in this repo: `due-diligence`, `underwriting`, `financing`, `legal`,
> `closing` (specialist phases), plus `ingestion`. The phase folder name uses
> hyphens (`due-diligence`); the registry/checkpoint **phase key** uses
> camelCase for the five core phases (`dueDiligence`, `underwriting`,
> `financing`, `legal`, `closing`) — see `schemas/common/enums.schema.json`.

---

## Step 1 — Create the prompt file under `agents/<phase>/`

Copy the closest existing agent as a template. For due diligence the most
complete reference is `agents/due-diligence/rent-roll-analyst.md`.

```
Copy: agents/due-diligence/rent-roll-analyst.md
  To: agents/due-diligence/insurance-risk-modeler.md
```

Then fill in **all 19 required sections** — every agent markdown file must carry
the full set or it is considered incomplete. The sections, in order:

| #  | Section | Notes for the worked example |
|----|---------|------------------------------|
| 1  | Identity Table | `Name: insurance-risk-modeler`. The `Name` value **must** match the registry key you add in Step 2. `Phase: 1 -- Due Diligence`. |
| 2  | Mission | One paragraph: "Scores property insurance adequacy and replacement-cost risk against carrier benchmarks…" |
| 3  | Tools Available | List only what it uses (e.g. `Read`, `Write`, `WebSearch`). |
| 4  | Input Data | `config/deal.json` (property, location), insurance binder/loss-run docs. |
| 5  | Strategy | Numbered `### Step 1 … ### Step N` with calculations and thresholds. |
| 6  | Output Format | Complete JSON schema as a code block — this must agree with the schema you write in Step 3. |
| 7  | Checkpoint Protocol | Use a unique ID prefix, e.g. `IRM-CP-01`, `IRM-CP-02`. |
| 8  | Logging Protocol | Standard format `[{ISO-timestamp}] [insurance-risk-modeler] [{level}] {message}`. |
| 9  | Resume Protocol | Follow the standard 6-step resume pattern. |
| 10 | Runtime Parameters | Standard injected params (deal-id, checkpoint-path, log-path, resume flag). |
| 11 | Tool Usage Patterns | Concrete Read/Write/WebSearch examples with real paths. |
| 12 | Error Recovery | Error type / action / max retries table. |
| 13 | Data Gap Handling | Standard 5-step protocol. |
| 14 | Output Location | Checkpoint file, phase log, report contribution paths. |
| 15 | Dealbreaker Detection | Dealbreakers from `config/thresholds.json` this agent owns. |
| 16 | Confidence Scoring | Standard HIGH/MEDIUM/LOW rubric. |
| 17 | Downstream Data Contract | Exact key paths consumed downstream — changing these is breaking. |
| 18 | Self-Review | Reference `skills/self-review-protocol.md` (the 6-point checklist). |
| 19 | Self-Validation Checks | Field / valid range / flag-if table for numeric outputs. |

See [Agent Development → Agent Anatomy](AGENT-DEVELOPMENT.md#agent-anatomy) for
the full per-section detail and the standard snippets you can paste.

---

## Step 2 — Register the agent in `config/agent-registry.json`

Agents live under `agents.<phase>.<agent-name>`. Add your entry to the matching
phase block (here, `agents["due-diligence"]`). The **registry key must equal the
`Name` field** in your prompt's Identity table.

Exact entry shape (these six fields, matching every existing entry):

```jsonc
"insurance-risk-modeler": {
  "file": "agents/due-diligence/insurance-risk-modeler.md",
  "inputs": ["config/deal.json", "insurance binder", "loss-run history"],
  "outputs": ["insurance adequacy analysis", "replacement-cost risk score"],
  "phase": "due-diligence",
  "critical": false,
  "dependencies": ["physical-inspection"]
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `file` | string | Path to the prompt markdown (`agents/<phase>/<name>.md`). |
| `inputs` | string[] | Data sources the agent requires. |
| `outputs` | string[] | What the agent produces. |
| `phase` | string | Hyphenated phase name: `due-diligence`, `underwriting`, `financing`, `legal`, `closing`. |
| `critical` | boolean | `true` → phase cannot complete without it; `false` → phase completes with reduced confidence. |
| `dependencies` | string[] | Agent names that must finish first. `[]` means it runs in parallel. |

> The registry also carries a `totalAgents` summary block at the bottom
> (`specialists`, `ingestion`, `total`). If you change the agent count, update
> those numbers too — they are human-maintained, not auto-derived.

If your agent introduces scored metrics that need pass/fail evaluation, also add
threshold entries under the relevant phase section of `config/thresholds.json`
(see [Threshold Customization](THRESHOLD-CUSTOMIZATION.md)), and wire the agent
into its phase orchestrator at `orchestrators/<phase>-orchestrator.md` (launch
order, parallel vs sequential, and how the orchestrator reads the new output).

---

## Step 3 — Add a per-agent output schema under `schemas/agents/<phase>/`

Per-agent schemas live in `schemas/agents/<phase>/<agent-name>.schema.json` and
give the agent's output a closed, machine-checkable contract. Create:

```
schemas/agents/due-diligence/insurance-risk-modeler.schema.json
```

Model it on an existing one — `schemas/agents/due-diligence/rent-roll-analyst.schema.json`
is the canonical minimal template:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://cre-acquisition-orchestrator.local/schemas/agents/due-diligence/insurance-risk-modeler.schema.json",
  "title": "Insurance Risk Modeler Output",
  "type": "object",
  "required": ["status", "finding"],
  "properties": {
    "status": { "$ref": "../../common/enums.schema.json#/$defs/status" },
    "finding": { "type": "string", "minLength": 1 }
  },
  "additionalProperties": false
}
```

Rules that the **AJV strict** loader enforces (see
`scripts/lib/schema-validator.js`, which compiles every `*.schema.json` under
`schemas/` with `{ strict: true, allErrors: true, allowUnionTypes: true }` plus
`ajv-formats`):

- **Filename** must end in `.schema.json` — that is how the loader discovers it.
- **Unique `$id`.** The loader registers each schema by its `$id` into one shared
  AJV instance. A duplicate or malformed `$id` will throw at load time and break
  every validation script. Follow the existing host/path convention
  (`https://cre-acquisition-orchestrator.local/schemas/agents/<phase>/<name>.schema.json`).
- **Reuse canonical enums.** Pull shared statuses/verdicts/severities from
  `schemas/common/enums.schema.json` via relative `$ref` (e.g.
  `../../common/enums.schema.json#/$defs/status`) rather than re-declaring string
  enums. Hand-rolled enums risk tripping the legacy-enum gate (see Step 5).
- **No unknown keywords.** Strict mode rejects typos in JSON Schema keywords
  (`require` instead of `required`, `additionalProperty` instead of
  `additionalProperties`, etc.). If AJV throws "strict mode: unknown keyword",
  that is your schema, not the validator.
- Prefer **`"additionalProperties": false`** on object types so the contract
  stays closed, mirroring the phase-output schemas under `schemas/phases/`.

The `schemas/agents/` directory is described in the README schema map under
**"Per-agent outputs"**. Adding a schema increases the `Schemas` count tracked
by the doc-count checker — see the note in Step 5.

---

## Step 4 — Add a fixture (if applicable)

Two distinct fixture trees exist; pick the right one:

- **`fixtures/`** — input documents used by parser/ingestion tests
  (e.g. `fixtures/parsers/*.xlsx`). Add here only if your agent ships a sample
  *input* document. This tree is counted by the README "By the Numbers" table.
- **`data/examples/`** — example *outputs* validated against schemas by
  `scripts/validate-fixtures.js`. This is where an agent output example belongs.

`validate-fixtures.js` only validates fixtures it can map to a schema. Its
`schemaForFixture()` currently maps these patterns under `data/examples/`:

| Fixture path pattern | Schema | Root name |
|----------------------|--------|-----------|
| `**/master-checkpoint.json` | `schemas/checkpoint/master-checkpoint.schema.json` | `masterCheckpoint` |
| `**/documents-manifest.json` | `schemas/documents/manifest.schema.json` | `documentsManifest` |
| `**/codex-run-sample/manifest.json` | `schemas/codex/run-manifest.schema.json` | `codexRunManifest` |
| `**/phase-outputs/<phase>-output.json` | `schemas/phases/<phase>-data.schema.json` | camelCase phase key |

A fixture under `data/examples/` that matches **no** pattern is treated as a
**failure** ("no declared schema mapping"), not silently skipped. So:

- If you add an example *phase output*, drop it at
  `data/examples/<deal-id>/phase-outputs/<phase>-output.json` and it is picked up
  automatically.
- If you want a standalone per-agent output fixture validated against your new
  `schemas/agents/<phase>/<name>.schema.json`, you must also extend
  `schemaForFixture()` to map its path to that schema — otherwise the validator
  will flag it. (Editing `validate-fixtures.js` is out of scope for this guide;
  note it in your PR if you need it.)

If your agent has no example output to ship, **skip this step** — it is optional.

---

## Step 5 — Validate

Run the three gates from the repo root. None of them build the dashboard or run
the simulation, so they are fast and safe:

```bash
npm run validate:docs      # scripts/verify-doc-counts.js  -> README "By the Numbers" drift
npm run validate:fixtures  # scripts/validate-fixtures.js   -> example outputs vs schemas
npm test                   # full fast suite (enums, fixtures, doc-counts, locks, security, system, codex)
```

There is also a one-shot **release-readiness** roll-up that composes the
read-only gates and a version/tag check:

```bash
node scripts/release-check.js
```

### Doc-count drift checker — important

`scripts/verify-doc-counts.js` (run by both `npm run validate:docs` and
`npm test`) cross-checks the README **"By the Numbers"** table against the actual
checked-in catalog. It counts, among other things:

- **AI Roles** = `agents/**/*.md` + `orchestrators/**/*.md`
- **Schemas** = `schemas/**/*.schema.json`
- **Fixtures** = every file under `fixtures/`

So when you add an agent **and** a schema (Steps 1 + 3), you change both the
**AI Roles** and **Schemas** counts; adding an input fixture (Step 4) changes the
**Fixtures** count. **You must update the README "By the Numbers" row to match,
or `validate:docs` will FAIL** with a message like:

```
README count drift detected:
  - Schemas: README claims 26, actual 27
```

Update the matching number in `README.md` (the row under
`| AI Roles | Skills | Schemas | Workflows | Fixtures | Tests passing |`) and the
prose line beneath it, then re-run `npm run validate:docs` until it is green.

### Final verification checklist

- [ ] Prompt file present with all 19 sections; `Name` matches the registry key.
- [ ] Registry entry has all six fields and points at the prompt file.
- [ ] Schema has a unique `$id`, reuses common enums, and loads under AJV strict.
- [ ] Any example output lives where `validate-fixtures.js` can map it.
- [ ] README "By the Numbers" updated for any count change; `npm run validate:docs` green.
- [ ] `npm run validate:fixtures` green.
- [ ] `npm test` green.

---

## Cross-references

- [Agent Development](AGENT-DEVELOPMENT.md) — full 19-section anatomy and modify-an-agent guidance.
- [Agent Catalog](AGENT-CATALOG.md) — current roster of agents.
- [Architecture](ARCHITECTURE.md) — how phases and orchestrators fit together.
- [Threshold Customization](THRESHOLD-CUSTOMIZATION.md) — adding pass/fail thresholds.
- `config/agent-registry.json` — the registry you edit in Step 2.
- `schemas/common/enums.schema.json` — canonical statuses/verdicts to `$ref`.
- `scripts/lib/schema-validator.js` — the AJV strict loader your schema must satisfy.
