// eval/lib/thresholds.mjs
//
// PURE regression-threshold definitions + evaluator for the CRE eval harness.
//
// HONESTY-CRITICAL: this is the single source of truth for the pass/fail gates.
// No I/O, no Date.now(), no Math.random() — same scorecard always yields the
// same verdict. The thresholds were fixed against a REAL `npm run eval:offline`
// run (see eval/REPORT.md) and are set at or below the measured value so the
// gate has headroom but still FAILS LOUDLY when a score regresses.
//
// Two kinds of checks (kept honestly separate — see EVAL-PLAN.md Phase 0c):
//
//   gate:true   HARD regression gate. The deterministic offline layers
//               (extraction = real parser quality; simulation = a FIXTURE whose
//               arithmetic/verdict logic is deterministic) must not regress.
//               A breach makes the harness exit non-zero and `npm run test:eval`
//               fail.
//   gate:false  Informational TARGET. Reported next to the actual number but
//               NOT enforced — these are either fixture weak spots (the sim is
//               not reasoning) or aspirational live-agent targets. We never
//               pretend a missed target is a pass, and we never quietly relax a
//               gate to make a number go green.
//
// Direction: op 'min' = actual must be >= value; op 'max' = actual must be <=
// value (used for the false-approve safety rate). A null/N-A actual on a GATE
// metric is a FAILURE (we never award credit for a number we could not measure).

export const THRESHOLDS = [
  // --- Extraction layer: deterministic parser, REAL document-intelligence quality ---
  { id: 'extractionPrecision', layer: 'extraction', metric: 'extractionPrecision', label: 'Extraction field precision', op: 'min', value: 0.9, gate: true },
  { id: 'extractionRecall', layer: 'extraction', metric: 'extractionRecall', label: 'Extraction field recall', op: 'min', value: 0.85, gate: true },
  { id: 'extractionF1', layer: 'extraction', metric: 'extractionF1', label: 'Extraction field F1', op: 'min', value: 0.875, gate: true },
  { id: 'extractionNumericWithinTolerance', layer: 'extraction', metric: 'extractionNumericWithinTolerance', label: 'Extraction numeric-within-tolerance', op: 'min', value: 0.9, gate: true },

  // --- Simulation layer: FIXTURE (deterministic) — gated as a regression guard, NOT a reasoning claim ---
  { id: 'simFinancialDeterminable', layer: 'simulation', metric: 'financialDeterminable', label: 'Sim determinable financials (fixture, tautological)', op: 'min', value: 0.99, gate: true },
  { id: 'simDealbreakerRecall', layer: 'simulation', metric: 'dealbreakerRecall', label: 'Sim dealbreaker recall (safety)', op: 'min', value: 0.9, gate: true },
  { id: 'simIcDirectionalMatch', layer: 'simulation', metric: 'icDirectionalMatch', label: 'Sim IC directional (go/no-go) match', op: 'min', value: 0.875, gate: true },
  { id: 'simIcExactMatch', layer: 'simulation', metric: 'icExactMatch', label: 'Sim IC exact-match rate (fixture)', op: 'min', value: 0.6, gate: true },
  // THE safety headline: a deal whose ground-truth verdict is FAIL (no-go) must
  // NEVER receive a "go" verdict. 0 tolerance.
  { id: 'falseApproveRate', layer: 'derived', metric: 'falseApproveRate', label: 'False-approve rate (go verdict on a FAIL deal)', op: 'max', value: 0, gate: true },

  // --- Informational targets (reported, NOT enforced) ---
  // Sim is a fixture with no narrative-reasoning logic, so its red-flag /
  // model-dependent numbers are documented weak spots, not gates.
  { id: 'simRedFlagRequiredRecall', layer: 'simulation', metric: 'redFlagRequiredRecall', label: 'Sim required red-flag recall (fixture weak spot)', op: 'min', value: 0.7, gate: false },
  { id: 'simRedFlagRecall', layer: 'simulation', metric: 'redFlagRecall', label: 'Sim all-planted red-flag recall (fixture weak spot)', op: 'min', value: 0.7, gate: false },
  { id: 'simFinancialModelDependent', layer: 'simulation', metric: 'financialModelDependent', label: 'Sim model-dependent financials', op: 'min', value: 0.5, gate: false },
  // Live-agent targets (the headline reasoning path; only evaluated when a live
  // layer is present in the scorecard).
  { id: 'liveFinancialDeterminable', layer: 'live', metric: 'financialDeterminable', label: 'Live determinable financials', op: 'min', value: 0.85, gate: false },
  { id: 'liveRedFlagRequiredRecall', layer: 'live', metric: 'redFlagRequiredRecall', label: 'Live required red-flag recall', op: 'min', value: 0.7, gate: false },
  { id: 'liveDealbreakerRecall', layer: 'live', metric: 'dealbreakerRecall', label: 'Live dealbreaker recall', op: 'min', value: 0.9, gate: false },
  { id: 'liveIcExactMatch', layer: 'live', metric: 'icExactMatch', label: 'Live IC exact-match rate', op: 'min', value: 0.6, gate: false },
  { id: 'liveIcDirectionalMatch', layer: 'live', metric: 'icDirectionalMatch', label: 'Live IC directional match', op: 'min', value: 0.8, gate: false }
]

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

// Pull the macro-average mean for one metric out of a layer aggregate.
// Returns { mean, n } or null when the layer/metric is absent.
function layerMetric(scorecard, layerName, metricName) {
  const layers = (scorecard && scorecard.layers) || {}
  const layer = layers[layerName]
  if (!layer || !layer.metrics || !layer.metrics[metricName]) return null
  return layer.metrics[metricName]
}

// ---------------------------------------------------------------------------
// computeFalseApprove(scorecard, { layer }) -> { rate, count, total, deals }
// ---------------------------------------------------------------------------
// A "false approve" is the safety-critical error: the ground-truth IC verdict
// is FAIL (direction no-go) but the system gave a "go" verdict (PASS or
// CONDITIONAL). Computed from the per-deal verdict scorecards of the requested
// layer (default: simulation — the deterministic path). UNKNOWN actual on a
// no-go deal is NOT a false approve (it did not approve), but it is surfaced in
// `unknownOnNoGo` so it can't hide.
export function computeFalseApprove(scorecard, opts = {}) {
  const layerName = opts.layer || 'simulation'
  const layer = (scorecard && scorecard.layers && scorecard.layers[layerName]) || null
  const deals = (layer && Array.isArray(layer.deals) ? layer.deals : []).filter(
    (d) => d && d.verdict && d.verdict.expectedDirection === 'no-go'
  )
  const offenders = []
  let unknownOnNoGo = 0
  for (const d of deals) {
    if (d.verdict.actualDirection === 'unknown') unknownOnNoGo += 1
    else if (d.verdict.actualDirection === 'go') offenders.push(d.dealId)
  }
  const total = deals.length
  return {
    rate: total === 0 ? null : offenders.length / total,
    count: offenders.length,
    total,
    unknownOnNoGo,
    deals: offenders
  }
}

function passes(op, actual, value) {
  if (!isFiniteNumber(actual)) return false // never credit an unmeasured GATE
  return op === 'max' ? actual <= value + 1e-9 : actual + 1e-9 >= value
}

// ---------------------------------------------------------------------------
// evaluateThresholds(scorecard) -> { results, ok, gatedFailures, measuredGates }
// ---------------------------------------------------------------------------
// results: one row per threshold whose layer is present in the scorecard
//   { id, label, layer, metric, op, value, gate, actual, n, present, pass }
// ok: true iff EVERY gate:true threshold whose layer was measured passes.
//   (A gate whose layer is absent from this run is "notMeasured" and does not
//    fail the run — e.g. an extraction-only run does not fail sim gates.)
export function evaluateThresholds(scorecard) {
  const s = scorecard || {}
  const fa = computeFalseApprove(s)
  const results = []
  let gatedFailures = 0
  let measuredGates = 0

  for (const t of THRESHOLDS) {
    let actual = null
    let n = 0
    let present = false

    if (t.layer === 'derived' && t.metric === 'falseApproveRate') {
      // Measured only when the simulation layer contributed at least one no-go deal.
      present = fa.total > 0
      actual = fa.rate
      n = fa.total
    } else {
      const lm = layerMetric(s, t.layer, t.metric)
      if (lm) {
        present = true
        actual = lm.mean
        n = lm.n
      }
    }

    // A metric whose layer ran but produced no contributing deals (mean null,
    // n 0) is "not measured" for gate purposes — don't fail on an N/A.
    const measurable = present && isFiniteNumber(actual)
    const pass = present ? passes(t.op, actual, t.value) : null

    if (t.gate && measurable) {
      measuredGates += 1
      if (!pass) gatedFailures += 1
    }

    results.push({
      id: t.id,
      label: t.label,
      layer: t.layer,
      metric: t.metric,
      op: t.op,
      value: t.value,
      gate: t.gate,
      actual: actual === undefined ? null : actual,
      n,
      present,
      pass
    })
  }

  return {
    results,
    falseApprove: fa,
    ok: gatedFailures === 0,
    gatedFailures,
    measuredGates
  }
}
