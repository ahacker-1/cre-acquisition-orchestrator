# Public Proof Path

This is the shortest local path for proving that CRE Acquisition Orchestrator is more than a generic AI dashboard. It traces one deal fact from source document, to uploaded data inspection, to extraction review, to approved evidence, to specialist workpaper context, to the IC package.

The proof path is local-first. It uses deterministic Parkview artifacts and does not require external AI APIs, cloud services, private deal files, or a video.

## Run It

From a fresh clone:

```powershell
git clone https://github.com/ahacker-1/cre-acquisition-orchestrator.git
cd cre-acquisition-orchestrator
npm install
npm run setup -- --skip-codex-install --skip-login
npm run proof
```

`npm run proof` does three things:

1. Regenerates the deterministic Parkview sample artifacts.
2. Starts the local dashboard and waits for both the UI and local API to respond.
3. Opens `http://localhost:5173/` and prints the path to this reviewer script.

For CI or a local non-interactive smoke check:

```powershell
npm run proof -- --smoke --no-open
```

## What To Prove

Pick one reviewed value or warning and follow it through the system. The strongest first pass is:

- **Source package:** Parkview's uploaded rent roll, T12, and offering memo sample.
- **Trust question:** "Where did this value come from, and can I inspect the source before it affects the IC package?"
- **Expected answer:** the dashboard exposes source rows, field quality, extracted candidates, review status, downstream workpapers, and the IC package decision trail.

## Reviewer Script

### 1. Start from source documents

Open the dashboard at `http://localhost:5173/`.

Use **Start Guided Demo** or **Parkview Demo**. The point is that the operator begins with source files and a deal workspace, not a blank prompt.

What to look for:

- Document-first intake on the front door.
- The deterministic Parkview sample as the no-upload fallback.
- No API key or live model requirement for the public proof path.

Screenshot reference: `docs/assets/dashboard-front-door.png`.

### 2. Inspect the uploaded data before trusting extraction

Click **Intake** in the lifecycle spine. If the detailed review area is closed, open **Source documents & detailed review**. Choose a source document such as `rent-roll-sample.csv` or the rent roll fixture and click **Preview Extraction**, **Review Fields**, or **View Applied Evidence**. The **Uploaded Data Inspector** appears above the candidate fields in the extraction preview.

What to look for:

- Parsed tables from uploaded files.
- Field types, fill rates, examples, and source rows.
- Click-through row detail for a selected field and row.
- Evidence that a visitor can inspect source-shaped data before approving extracted values.

Screenshot reference: `docs/assets/uploaded-data-inspector.png`.

### 3. Review extracted candidates

Move to **Intake** and review source-backed candidate fields.

What to look for:

- Candidate values with confidence, warnings, source file, source location, raw snippets, and file hashes where available.
- OCR-derived values remaining review-gated.
- Ambiguous fields staying pending until a human approves, rejects, or waives them.

Screenshot reference: `docs/assets/source-extraction-review.png`.

### 4. Approve evidence before workflows consume it

Approve or apply a trusted candidate field, or inspect the approved evidence already present in the sample.

What to look for:

- Underwriting inputs do not silently change from raw extraction.
- Approved values become the evidence layer downstream workflows can cite.
- Rejections and waivers remain explicit review decisions, not hidden cleanup.

### 5. Watch the deal team use the reviewed context

Open the persistent deal space and summon or inspect a specialist workpaper.

What to look for:

- Lifecycle spine from Intake through IC.
- Live Feed and Your Team rail showing visible coordination.
- Agent panel or workpaper output with finding, impact, caveats, and available references.

Screenshot references:

- `docs/assets/acquisition-command.png`
- `docs/assets/deal-team-handoffs.png`

### 6. Trace the reviewed item into the IC package

Open **IC Package**.

What to look for:

- Recommendation, phase outcomes, red flags, data gaps, document manifest, workpaper links, review trail, and Markdown/JSON export.
- Evidence Chain or proof-path sections where current artifacts expose source document, approved field, workpaper, and package references.
- Honest gaps: if a reference is not exposed for a given item yet, the package should show that as a review limitation rather than inventing certainty.

Screenshot reference: `docs/assets/ic-package.png`.

## Why This Matters

The public trust loop is:

```text
source document -> uploaded data inspector -> extraction review -> approved evidence -> specialist workpaper -> IC package
```

That loop is the adoption wedge. A first-time CRE operator does not need to understand every orchestrator, schema, or runtime option before trusting the project. They need to see one value move from source evidence into a reviewable decision package without an opaque AI leap.

## Full Validation

For a release-grade local proof, run:

```powershell
npm run verify:v3
```

That broader gate runs release drift checks, root regression tests, parser/workspace evidence tests, dashboard typecheck/build, npm audits, offline eval, production self-host smoke, and browser E2E.
