// eval/lib/trust-report.mjs
//
// PURE: turns a scorecard object into the human-readable TRUST-REPORT.md.
// No I/O. The report leads with the honesty framing (live = reasoning,
// simulation = fixture) and surfaces weaknesses, never hides them.

const TARGETS = {
  extractionPrecision: 0.9,
  extractionRecall: 0.85,
  extractionNumericWithinTolerance: 0.9,
  financialDeterminable: 0.85,
  redFlagRequiredRecall: 0.7,
  dealbreakerRecall: 0.9,
  icExactMatch: 0.6,
  icDirectionalMatch: 0.8
}

function pct(x) {
  if (x === null || x === undefined) return 'N/A'
  if (typeof x !== 'number' || !Number.isFinite(x)) return 'N/A'
  return `${(x * 100).toFixed(0)}%`
}

function mean(layer, name) {
  if (!layer || !layer.metrics || !layer.metrics[name]) return null
  return layer.metrics[name].mean
}

function n(layer, name) {
  if (!layer || !layer.metrics || !layer.metrics[name]) return 0
  return layer.metrics[name].n
}

function targetCell(name, value) {
  const t = TARGETS[name]
  if (t === undefined || value === null || value === undefined) return ''
  return value + 1e-9 >= t ? ' ✅' : ' ⚠️'
}

export function buildTrustReport(scorecard) {
  const s = scorecard || {}
  const L = s.layers || {}
  const live = L.live
  const sim = L.simulation
  const ext = L.extraction
  const lines = []

  lines.push('# CRE Acquisition Orchestrator — Trust Report')
  lines.push('')
  lines.push(`_Generated ${s.generatedAt || '?'} · run \`${s.runId || '?'}\` · eval v${s.evalVersion || '?'}_`)
  lines.push('')
  lines.push('> **How to read this report.** Three layers are measured separately and they are NOT')
  lines.push('> equivalent:')
  lines.push('>')
  lines.push('> 1. **Live agent reasoning (the headline).** Real LLM agents (Codex) reason over each')
  lines.push('>    deal and produce financials, red flags, and an investment-committee verdict. This is')
  lines.push('>    the number that actually reflects the product\'s judgment.')
  lines.push('> 2. **Deterministic simulation (a fixture — NOT reasoning).** The offline demo computes')
  lines.push('>    financials by fixed arithmetic on the deal inputs and derives its verdict from')
  lines.push('>    scenario configuration. It is shown as a baseline only; a high score here is largely')
  lines.push('>    tautological (same formulas that produced the ground truth) and is **not** evidence')
  lines.push('>    that the system reasons.')
  lines.push('> 3. **Extraction (deterministic parsers).** How well the document parsers recover known')
  lines.push('>    field values from deliberately messy synthetic spreadsheets/PDFs. No LLM involved.')
  lines.push('')
  if (live) {
    lines.push(`**Live model:** ${s.model || 'Codex CLI default model'} · **Codex:** ${s.codexVersion || 'unknown'}`)
    lines.push('')
  } else {
    lines.push('**Live model:** _live layer not included in this run._')
    lines.push('')
  }

  // ---- headline table ----
  lines.push('## Headline numbers')
  lines.push('')
  lines.push('| Metric | Live (reasoning) | Simulation (fixture) | Target |')
  lines.push('|---|---|---|---|')
  const row = (label, name, target) => {
    const lv = mean(live, name)
    const sv = mean(sim, name)
    lines.push(
      `| ${label} | ${pct(lv)}${targetCell(name, lv)} (n=${n(live, name)}) | ${pct(sv)} (n=${n(sim, name)}) | ${target !== undefined ? pct(target) : '—'} |`
    )
  }
  row('Financial accuracy — determinable', 'financialDeterminable', TARGETS.financialDeterminable)
  row('Financial accuracy — model-dependent', 'financialModelDependent')
  row('Red-flag recall (required)', 'redFlagRequiredRecall', TARGETS.redFlagRequiredRecall)
  row('Red-flag recall (all planted)', 'redFlagRecall')
  row('Dealbreaker recall', 'dealbreakerRecall', TARGETS.dealbreakerRecall)
  row('IC verdict — exact match', 'icExactMatch', TARGETS.icExactMatch)
  row('IC verdict — directional match', 'icDirectionalMatch', TARGETS.icDirectionalMatch)
  lines.push('')

  if (ext) {
    lines.push('### Extraction layer (deterministic parser)')
    lines.push('')
    lines.push('| Metric | Value | Target |')
    lines.push('|---|---|---|')
    const erow = (label, name, target) =>
      lines.push(`| ${label} | ${pct(mean(ext, name))}${targetCell(name, mean(ext, name))} (n=${n(ext, name)}) | ${target !== undefined ? pct(target) : '—'} |`)
    erow('Field precision', 'extractionPrecision', TARGETS.extractionPrecision)
    erow('Field recall', 'extractionRecall', TARGETS.extractionRecall)
    erow('Field F1', 'extractionF1')
    erow('Numeric within tolerance', 'extractionNumericWithinTolerance', TARGETS.extractionNumericWithinTolerance)
    lines.push('')
  }

  // ---- per-deal live table ----
  if (live && Array.isArray(live.deals)) {
    lines.push('## Per-deal — live agent reasoning')
    lines.push('')
    lines.push('| Deal | Archetype | IC expected | IC actual | Dir? | Det. fin | Model fin | RF req-recall | Dealbreaker | Partial fail |')
    lines.push('|---|---|---|---|---|---|---|---|---|---|')
    for (const d of live.deals) {
      const v = d.verdict || {}
      const f = d.financials || {}
      const rf = d.redFlags || {}
      const db = d.dealbreakers || {}
      lines.push(
        `| ${d.dealId} | ${d.archetype || ''} | ${v.expected || ''} | ${v.actual || ''} | ${v.directionalMatch ? '✓' : '✗'} | ${pct(f.determinable && f.determinable.ratio)} | ${pct(f.modelDependent && f.modelDependent.ratio)} | ${pct(rf.requiredRecall)} | ${db.total ? pct(db.recall) : '—'} | ${d.partialFailure ? d.partialFailure.failedAgents.join(',') : '—'} |`
      )
    }
    lines.push('')
  }

  // ---- weaknesses ----
  lines.push('## Where it breaks (honest weaknesses)')
  lines.push('')
  const weaknesses = collectWeaknesses(live, 'live')
  if (weaknesses.length === 0) {
    lines.push('_No live-layer misses recorded against targets in this run._')
  } else {
    for (const w of weaknesses) lines.push(`- ${w}`)
  }
  lines.push('')

  // ---- per-deal sim (fixture) ----
  if (sim && Array.isArray(sim.deals)) {
    lines.push('## Per-deal — deterministic simulation (fixture baseline)')
    lines.push('')
    lines.push('_Reminder: these numbers come from fixed arithmetic + scenario config, not reasoning._')
    lines.push('')
    lines.push('| Deal | IC expected | IC actual | Det. fin | RF recall |')
    lines.push('|---|---|---|---|---|')
    for (const d of sim.deals) {
      const v = d.verdict || {}
      const f = d.financials || {}
      const rf = d.redFlags || {}
      lines.push(`| ${d.dealId} | ${v.expected || ''} | ${v.actual || ''} | ${pct(f.determinable && f.determinable.ratio)} | ${pct(rf.recall)} |`)
    }
    lines.push('')
  }

  if (Array.isArray(s.notes) && s.notes.length) {
    lines.push('## Run notes')
    lines.push('')
    for (const note of s.notes) lines.push(`- ${note}`)
    lines.push('')
  }

  lines.push('## Methodology & reproduction')
  lines.push('')
  lines.push('- Benchmark: synthetic deals under `eval/benchmark/deals/` (deal + messy documents + machine-readable ground truth). Generators: `eval/generators/` (deterministic, documented).')
  lines.push('- Scoring: pure functions in `eval/lib/scoring.mjs`, unit-tested by `scripts/eval-scoring.test.mjs`.')
  lines.push('- Tolerances and matching rules are fixed in `EVAL-PLAN.md` (Phase 0) and were not loosened to raise scores.')
  lines.push('- Reproduce: `npm run eval` (all layers) — see `eval/README.md`.')
  lines.push('')
  return lines.join('\n')
}

function collectWeaknesses(layer, label) {
  const out = []
  if (!layer) return out
  for (const [name, target] of Object.entries(TARGETS)) {
    const m = layer.metrics && layer.metrics[name]
    if (!m || m.mean === null || m.mean === undefined) continue
    if (m.mean + 1e-9 < target) {
      out.push(`${label}: **${name}** = ${pct(m.mean)} is below the ${pct(target)} target (n=${m.n}).`)
    }
  }
  // Surface per-deal verdict misses + missed dealbreakers explicitly.
  if (Array.isArray(layer.deals)) {
    for (const d of layer.deals) {
      if (d.verdict && !d.verdict.exactMatch && d.verdict.expected !== 'UNKNOWN') {
        out.push(`${label}: deal **${d.dealId}** IC verdict expected ${d.verdict.expected}, got ${d.verdict.actual}.`)
      }
      if (d.dealbreakers && d.dealbreakers.total > 0 && d.dealbreakers.detected < d.dealbreakers.total) {
        const missed = (d.dealbreakers.perDealbreaker || []).filter((x) => !x.detected).map((x) => x.id)
        out.push(`${label}: deal **${d.dealId}** missed dealbreaker(s): ${missed.join(', ')}.`)
      }
      if (d.partialFailure) {
        out.push(`${label}: deal **${d.dealId}** had agent failures: ${d.partialFailure.failedAgents.join(', ')} (${d.partialFailure.note}).`)
      }
    }
  }
  return out
}
