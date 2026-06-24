// eval/lib/eval-report.mjs
//
// PURE: renders the committed credibility report (eval/REPORT.md) from a
// scorecard that already carries an embedded `thresholds` block (added by
// evaluateThresholds in run-eval.mjs). No I/O. The report leads with the
// pass/fail gate verdict, then per-mode scores, then the threshold table, then
// how to reproduce — exactly what a skeptical reviewer wants to see.

function pct(x) {
  if (x === null || x === undefined || typeof x !== 'number' || !Number.isFinite(x)) return 'N/A'
  return `${(x * 100).toFixed(1)}%`
}

function mean(layer, name) {
  if (!layer || !layer.metrics || !layer.metrics[name]) return null
  return layer.metrics[name].mean
}
function n(layer, name) {
  if (!layer || !layer.metrics || !layer.metrics[name]) return 0
  return layer.metrics[name].n
}

export function buildEvalReport(scorecard) {
  const s = scorecard || {}
  const L = s.layers || {}
  const ext = L.extraction
  const sim = L.simulation
  const live = L.live
  const th = s.thresholds || { ok: true, results: [], gatedFailures: 0, measuredGates: 0 }
  const lines = []

  lines.push('# CRE Acquisition Orchestrator — Eval Report (scored, gated, reproducible)')
  lines.push('')
  lines.push(`_Generated ${s.generatedAt || '?'} · run \`${s.runId || '?'}\` · eval v${s.evalVersion || '?'}_`)
  lines.push('')
  lines.push(
    '> **Regenerate this file (one command, deterministic, offline, no API keys):**\n' +
      '> `node eval/run-eval.mjs --mode offline --no-update-results --report eval/REPORT.md --report-json eval/results/offline-scorecard.json`\n' +
      '> — re-runs the extraction + simulation layers against the committed ground truth, ' +
      're-checks every regression threshold, and rewrites this report + its machine-readable scorecard.'
  )
  lines.push('')

  // ---- gate verdict ----
  const gateLine = th.ok
    ? `✅ **GATE: PASS** — all ${th.measuredGates} measured regression gate(s) held.`
    : `❌ **GATE: FAIL** — ${th.gatedFailures} of ${th.measuredGates} measured regression gate(s) breached. The harness exits non-zero.`
  lines.push('## Gate verdict')
  lines.push('')
  lines.push(gateLine)
  lines.push('')
  if (th.falseApprove) {
    const fa = th.falseApprove
    lines.push(
      `Safety — **false-approve rate** (a "go" verdict on a deal whose ground truth is FAIL/no-go): ` +
        `**${pct(fa.rate)}** (${fa.count}/${fa.total} no-go deals)` +
        (fa.unknownOnNoGo ? `; ${fa.unknownOnNoGo} no-go deal(s) returned an UNKNOWN verdict.` : '.') +
        (fa.deals && fa.deals.length ? ` Offenders: ${fa.deals.join(', ')}.` : '')
    )
    lines.push('')
  }

  // ---- per-mode scores ----
  lines.push('## Per-mode scores (this run)')
  lines.push('')
  lines.push(
    '> Honesty note: **extraction** is real deterministic-parser quality. **simulation** is a ' +
      'FIXTURE (fixed arithmetic + scenario-config verdicts) — a high score there is largely ' +
      'tautological and is **not** evidence of reasoning. The **live** LLM-reasoning layer is the ' +
      'headline number and is measured separately (see `eval/results/TRUST-REPORT.md`); it is not ' +
      'part of this offline gate because it needs API/Codex access.'
  )
  lines.push('')

  if (ext) {
    lines.push('### Extraction layer — deterministic parser (real quality)')
    lines.push('')
    lines.push(`Deals scored: **${ext.counts.deals}**`)
    lines.push('')
    lines.push('| Metric | Score | n |')
    lines.push('|---|---|---|')
    lines.push(`| Field precision | ${pct(mean(ext, 'extractionPrecision'))} | ${n(ext, 'extractionPrecision')} |`)
    lines.push(`| Field recall | ${pct(mean(ext, 'extractionRecall'))} | ${n(ext, 'extractionRecall')} |`)
    lines.push(`| Field F1 | ${pct(mean(ext, 'extractionF1'))} | ${n(ext, 'extractionF1')} |`)
    lines.push(`| Numeric within tolerance | ${pct(mean(ext, 'extractionNumericWithinTolerance'))} | ${n(ext, 'extractionNumericWithinTolerance')} |`)
    lines.push('')
  }

  if (sim) {
    lines.push('### Simulation layer — FIXTURE baseline (NOT reasoning)')
    lines.push('')
    lines.push(`Deals scored: **${sim.counts.deals}**`)
    lines.push('')
    lines.push('| Metric | Score | n |')
    lines.push('|---|---|---|')
    lines.push(`| Determinable financials (tautological) | ${pct(mean(sim, 'financialDeterminable'))} | ${n(sim, 'financialDeterminable')} |`)
    lines.push(`| Model-dependent financials | ${pct(mean(sim, 'financialModelDependent'))} | ${n(sim, 'financialModelDependent')} |`)
    lines.push(`| IC verdict — exact match | ${pct(mean(sim, 'icExactMatch'))} | ${n(sim, 'icExactMatch')} |`)
    lines.push(`| IC verdict — directional (go/no-go) match | ${pct(mean(sim, 'icDirectionalMatch'))} | ${n(sim, 'icDirectionalMatch')} |`)
    lines.push(`| Dealbreaker recall | ${pct(mean(sim, 'dealbreakerRecall'))} | ${n(sim, 'dealbreakerRecall')} |`)
    lines.push(`| Required red-flag recall (fixture weak spot) | ${pct(mean(sim, 'redFlagRequiredRecall'))} | ${n(sim, 'redFlagRequiredRecall')} |`)
    lines.push(`| All-planted red-flag recall (fixture weak spot) | ${pct(mean(sim, 'redFlagRecall'))} | ${n(sim, 'redFlagRecall')} |`)
    lines.push('')
    if (Array.isArray(sim.deals)) {
      lines.push('Per-deal IC verdict (fixture):')
      lines.push('')
      lines.push('| Deal | Archetype | IC expected | IC actual | Match | Det. fin |')
      lines.push('|---|---|---|---|---|---|')
      for (const d of sim.deals) {
        const v = d.verdict || {}
        const f = d.financials || {}
        lines.push(
          `| ${d.dealId} | ${d.archetype || ''} | ${v.expected || ''} | ${v.actual || ''} | ${v.exactMatch ? '✓' : '✗'} | ${pct(f.determinable && f.determinable.ratio)} |`
        )
      }
      lines.push('')
    }
  }

  if (live) {
    lines.push('### Live layer (present in this run)')
    lines.push('')
    lines.push(`Deals scored: **${live.counts.deals}** — see \`eval/results/TRUST-REPORT.md\` for the full live breakdown.`)
    lines.push('')
  }

  // ---- thresholds table ----
  lines.push('## Regression thresholds')
  lines.push('')
  lines.push('Thresholds are fixed in `eval/lib/thresholds.mjs` and documented in `EVAL-PLAN.md` (Phase 0c). ')
  lines.push('A **gate** (🔒) fails the harness (non-zero exit, `npm run test:eval` red) if breached. A **target** is reported but not enforced.')
  lines.push('')
  lines.push('| Kind | Metric | Rule | Actual | n | Result |')
  lines.push('|---|---|---|---|---|---|')
  for (const r of th.results || []) {
    if (!r.present) continue
    const kind = r.gate ? '🔒 gate' : 'target'
    const rule = `${r.op === 'max' ? '≤' : '≥'} ${pct(r.value)}`
    const result = r.pass === null ? 'N/A' : r.pass ? '✅ pass' : (r.gate ? '❌ FAIL' : '⚠️ below target')
    lines.push(`| ${kind} | ${r.label} | ${rule} | ${pct(r.actual)} | ${r.n} | ${result} |`)
  }
  lines.push('')
  // Gates not measured in this run (e.g. live layer absent in offline mode).
  const notMeasured = (th.results || []).filter((r) => r.gate && !r.present)
  if (notMeasured.length) {
    lines.push(`_Gates not measured this run (layer absent): ${notMeasured.map((r) => r.id).join(', ')}._`)
    lines.push('')
  }

  // ---- reproduce ----
  lines.push('## How to reproduce')
  lines.push('')
  lines.push('```bash')
  lines.push('# 1. Install parser deps (pandas/openpyxl/pdfplumber) once:')
  lines.push('npm run setup -- --skip-install --skip-codex-install --skip-login')
  lines.push('')
  lines.push('# 2. Run the deterministic eval (extraction + simulation). Either:')
  lines.push('npm run eval:offline     # scores + gate (exits non-zero on any breach)')
  lines.push('#   ...or, to (re)write this report + its machine-readable scorecard without')
  lines.push('#   clobbering the committed live results:')
  lines.push('node eval/run-eval.mjs --mode offline --no-update-results \\')
  lines.push('  --report eval/REPORT.md --report-json eval/results/offline-scorecard.json')
  lines.push('')
  lines.push('# 3. Enforce the gates in the unit-test suite:')
  lines.push('npm run test:eval        # fails loudly if any committed gate regressed')
  lines.push('')
  lines.push('# (CI also runs `node eval/run-eval.mjs --mode offline --no-update-results`,')
  lines.push('#  which exits non-zero on any gate breach.)')
  lines.push('```')
  lines.push('')
  lines.push('- Benchmark: 8 synthetic deals under `eval/benchmark/deals/` (deal + messy documents + machine-readable ground truth). Generators: `eval/generators/` (deterministic).')
  lines.push('- Scoring: pure functions in `eval/lib/scoring.mjs`; thresholds in `eval/lib/thresholds.mjs`; both unit-tested by `scripts/eval-scoring.test.mjs`.')
  lines.push('- Tolerances and matching rules were fixed in `EVAL-PLAN.md` BEFORE running and were not loosened to raise scores.')
  lines.push('')
  return lines.join('\n')
}
