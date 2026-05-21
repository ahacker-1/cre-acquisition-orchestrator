// eval/lib/scoring.mjs
//
// PURE scoring functions for the CRE evaluation harness.
//
// HONESTY-CRITICAL: every function in this file is deterministic and pure —
//   - no file I/O, no network, no Date.now(), no Math.random()
//   - same inputs always produce the same outputs
//   - importable by both `node` and `tsx` (plain ES modules, no Node-only deps)
// A scoring bug here produces dishonest accuracy numbers, so the logic is kept
// small, explicit, and fully covered by scripts/eval-scoring.test.mjs.
//
// Spec source of truth: EVAL-PLAN.md Phase 0 (sections 0a / 0b / 0c).
//
// ---------------------------------------------------------------------------
// systemAnswer INPUT CONTRACT
// ---------------------------------------------------------------------------
// The extractors/parsers/agents built later normalize their output into this
// single shape, one object per deal per layer. scoreDeal() consumes it:
//
//   {
//     dealId: string,
//     layer: "extraction" | "sim" | "live",
//
//     // EXTRACTION layer: candidate fields pulled from the documents.
//     fields: [ { path: string, value: number|string|boolean|null } ],
//
//     // SIM / LIVE layers: economically-derived deal metrics.
//     // Any metric may be null when the system did not produce it.
//     metrics: { noi, egi, capRate, dscr, irr, equityMultiple },
//
//     // Detected red-flag / data-gap / verdict text. For sim this is the
//     // joined message+category strings; for live this is the markdown text of
//     // the ## Red Flags / ## Data Gaps / ## Agent Verdict sections.
//     flagTexts: [ "string", ... ],
//
//     // Normalized verdict (already passed through normalizeVerdict upstream,
//     // but scoreVerdict re-normalizes defensively).
//     verdict: "PASS" | "CONDITIONAL" | "FAIL" | "UNKNOWN",
//
//     // Honest accounting of agents that failed to run, if any. A failed agent
//     // is NEVER counted as a detected flag.
//     partialFailure: { failedAgents: string[], note: string } | null
//   }
//
// ground-truth shape: see EVAL-PLAN.md section 0(a).
// ---------------------------------------------------------------------------

// A small helper: is this a finite number we can compare arithmetically?
function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// ---------------------------------------------------------------------------
// withinTolerance(actual, expected, tolerance) -> boolean
// ---------------------------------------------------------------------------
// tolerance is one of:
//   { type: "exact" }                       strict equality
//   { type: "relative", pct: Number }       |actual-expected| <= pct*|expected|
//   { type: "absolute", abs: Number }       |actual-expected| <= abs
//
// "exact" for numbers = strict numeric equality; for strings = case-insensitive
// trimmed equality; for booleans/other = strict ===.
//
// A missing answer is NEVER within tolerance: null / undefined / NaN actual
// returns false for every tolerance type.
export function withinTolerance(actual, expected, tolerance) {
  // Missing / non-finite-number answers can never be "within tolerance".
  if (actual === null || actual === undefined) return false;
  if (typeof actual === 'number' && Number.isNaN(actual)) return false;

  const type = tolerance && tolerance.type ? tolerance.type : 'exact';

  if (type === 'exact') {
    // Strings: case-insensitive, trimmed.
    if (typeof expected === 'string' || typeof actual === 'string') {
      if (typeof actual !== 'string' || typeof expected !== 'string') {
        // Type mismatch (e.g. number vs string) is not an exact match.
        return false;
      }
      return actual.trim().toLowerCase() === expected.trim().toLowerCase();
    }
    // Numbers: strict numeric equality.
    if (typeof expected === 'number') {
      return isFiniteNumber(actual) && actual === expected;
    }
    // Booleans / anything else: strict equality.
    return actual === expected;
  }

  // relative / absolute tolerance requires both sides to be finite numbers.
  if (!isFiniteNumber(actual) || !isFiniteNumber(expected)) return false;

  if (type === 'relative') {
    const pct = tolerance.pct;
    if (!isFiniteNumber(pct)) return false;
    // If expected is 0, a relative band collapses to exact-zero match.
    return Math.abs(actual - expected) <= pct * Math.abs(expected);
  }

  if (type === 'absolute') {
    const abs = tolerance.abs;
    if (!isFiniteNumber(abs)) return false;
    return Math.abs(actual - expected) <= abs;
  }

  // Unknown tolerance type: refuse to award credit.
  return false;
}

// Safe ratio: returns { ratio, note } and NEVER NaN. Divide-by-zero -> null.
function safeRatio(numerator, denominator, zeroNote) {
  if (denominator === 0) {
    return { ratio: null, note: zeroNote || 'denominator was zero (N/A)' };
  }
  return { ratio: numerator / denominator, note: null };
}

// ---------------------------------------------------------------------------
// scoreExtraction(groundTruthFields, systemFields)
// ---------------------------------------------------------------------------
// groundTruthFields: [ { path, value, tolerance, source? } ]
// systemFields:      [ { path, value } ]
//
// A ground-truth field is "recalled" if systemFields contains the same
// dot-path AND its value is within tolerance of the ground-truth value.
//
// PRECISION-DENOMINATOR CHOICE (documented to prevent gaming):
//   Precision is scored ONLY over system fields that correspond to a
//   ground-truth path. We have no answer key for paths outside the ground
//   truth, so we cannot honestly judge them right or wrong; counting them
//   would either unfairly punish or unfairly reward extra extraction. The
//   precision denominator is therefore "number of system fields whose path
//   exists in the ground truth" and the numerator is "those that are also
//   within tolerance". recall denominator = ground-truth field count.
export function scoreExtraction(groundTruthFields, systemFields) {
  const gt = Array.isArray(groundTruthFields) ? groundTruthFields : [];
  const sys = Array.isArray(systemFields) ? systemFields : [];

  // Index the LAST system value per path (later wins if duplicated).
  const sysByPath = new Map();
  for (const f of sys) {
    if (f && typeof f.path === 'string') sysByPath.set(f.path, f.value);
  }
  const gtPaths = new Set(gt.map((f) => f && f.path).filter((p) => typeof p === 'string'));

  const perField = [];
  let matched = 0;
  let numericMatched = 0;
  let numericTotal = 0;

  for (const field of gt) {
    if (!field || typeof field.path !== 'string') continue;
    const present = sysByPath.has(field.path);
    const actual = present ? sysByPath.get(field.path) : undefined;
    const tol = field.tolerance || { type: 'exact' };
    const isMatched = present && withinTolerance(actual, field.value, tol);
    if (isMatched) matched += 1;

    const expectedIsNumeric = isFiniteNumber(field.value);
    if (expectedIsNumeric) {
      numericTotal += 1;
      if (isMatched) numericMatched += 1;
    }

    perField.push({
      path: field.path,
      expected: field.value,
      actual: present ? actual : null,
      matched: isMatched,
      present
    });
  }

  // Precision denominator: system fields whose path is in the ground truth.
  let precisionDenominator = 0;
  let precisionNumerator = 0;
  for (const [path, value] of sysByPath.entries()) {
    if (!gtPaths.has(path)) continue; // unscoreable extra field — excluded.
    precisionDenominator += 1;
    const gtField = gt.find((f) => f && f.path === path);
    const tol = (gtField && gtField.tolerance) || { type: 'exact' };
    if (gtField && withinTolerance(value, gtField.value, tol)) precisionNumerator += 1;
  }

  const groundTruthCount = perField.length;
  const extractedCount = sys.length;

  const precisionR = safeRatio(precisionNumerator, precisionDenominator, 'no system fields mapped to a ground-truth path');
  const recallR = safeRatio(matched, groundTruthCount, 'no ground-truth fields to recall');
  const numericR = safeRatio(numericMatched, numericTotal, 'no numeric ground-truth fields');

  const precision = precisionR.ratio;
  const recall = recallR.ratio;

  // F1 = harmonic mean. Null if either component is null, or both are 0.
  let f1 = null;
  if (precision !== null && recall !== null) {
    f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  }

  return {
    precision,
    recall,
    f1,
    numericWithinTolerance: numericR.ratio,
    matched,
    extractedCount,
    groundTruthCount,
    perField
  };
}

// ---------------------------------------------------------------------------
// scoreFinancials(groundTruthMetrics, systemMetrics)
// ---------------------------------------------------------------------------
// groundTruthMetrics: [ { key, value, tolerance, class:"determinable"|"model-dependent" } ]
// systemMetrics:      { noi, egi, capRate, dscr, irr, equityMultiple }  (any null)
//
// Splits scoring by `class`. determinable = objectively derivable (tight
// tolerances, real accuracy). model-dependent = assumption-driven (wide,
// clearly-labeled tolerances).
export function scoreFinancials(groundTruthMetrics, systemMetrics) {
  const gt = Array.isArray(groundTruthMetrics) ? groundTruthMetrics : [];
  const sys = systemMetrics && typeof systemMetrics === 'object' ? systemMetrics : {};

  const perMetric = [];
  const buckets = {
    determinable: { withinTolerance: 0, total: 0, perMetric: [] },
    'model-dependent': { withinTolerance: 0, total: 0, perMetric: [] }
  };

  for (const metric of gt) {
    if (!metric || typeof metric.key !== 'string') continue;
    const klass = metric.class === 'model-dependent' ? 'model-dependent' : 'determinable';
    const actual = Object.prototype.hasOwnProperty.call(sys, metric.key) ? sys[metric.key] : null;
    const tol = metric.tolerance || { type: 'exact' };
    const isMatched = withinTolerance(actual, metric.value, tol);

    const row = {
      key: metric.key,
      expected: metric.value,
      actual: actual === undefined ? null : actual,
      class: klass,
      matched: isMatched,
      tolerance: tol
    };
    perMetric.push(row);

    const bucket = buckets[klass];
    bucket.total += 1;
    if (isMatched) bucket.withinTolerance += 1;
    bucket.perMetric.push(row);
  }

  function finalizeBucket(name) {
    const b = buckets[name];
    const r = safeRatio(b.withinTolerance, b.total, `no ${name} metrics in ground truth`);
    return {
      withinTolerance: b.withinTolerance,
      total: b.total,
      ratio: r.ratio,
      perMetric: b.perMetric
    };
  }

  return {
    determinable: finalizeBucket('determinable'),
    modelDependent: finalizeBucket('model-dependent'),
    perMetric
  };
}

// Internal: does any system flag-text contain >=1 of the planted keywords?
// All comparisons are lowercased. Returns the matching text (or null).
function findKeywordMatch(systemFlagTexts, keywords) {
  const texts = Array.isArray(systemFlagTexts) ? systemFlagTexts : [];
  const kws = (Array.isArray(keywords) ? keywords : [])
    .filter((k) => typeof k === 'string' && k.length > 0)
    .map((k) => k.toLowerCase());
  if (kws.length === 0) return null;
  for (const raw of texts) {
    if (typeof raw !== 'string') continue;
    const lower = raw.toLowerCase();
    for (const kw of kws) {
      if (lower.includes(kw)) return raw;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// scoreFlags(groundTruthFlags, systemFlagTexts)
// ---------------------------------------------------------------------------
// groundTruthFlags: [ { id, keywords, required, ... } ]
// systemFlagTexts:  [ "string", ... ]
//
// A planted flag is "detected" if ANY string in systemFlagTexts (lowercased)
// contains >=1 of the flag's keywords (lowercased).
//
// recall: overall = detected / total planted.
// requiredRecall: detected required / total required.
// precision (informational): fraction of systemFlagTexts that matched >=1
//   planted flag.
//
// Clean deal (no planted flags): recall = null (N/A), but precision still
// measures false positives — any flag raised on a clean deal is a false
// positive, reported as falsePositiveCount.
export function scoreFlags(groundTruthFlags, systemFlagTexts) {
  const gt = Array.isArray(groundTruthFlags) ? groundTruthFlags : [];
  const texts = Array.isArray(systemFlagTexts) ? systemFlagTexts : [];

  const perFlag = [];
  let detected = 0;
  let requiredDetected = 0;
  let requiredTotal = 0;

  for (const flag of gt) {
    if (!flag) continue;
    const isRequired = flag.required === true;
    if (isRequired) requiredTotal += 1;
    const matchedText = findKeywordMatch(texts, flag.keywords);
    const isDetected = matchedText !== null;
    if (isDetected) {
      detected += 1;
      if (isRequired) requiredDetected += 1;
    }
    perFlag.push({
      id: flag.id !== undefined ? flag.id : null,
      required: isRequired,
      detected: isDetected,
      matchedText: matchedText
    });
  }

  const total = perFlag.length;

  // Precision (informational): how many raised flag-texts hit >=1 planted flag.
  let matchedTexts = 0;
  for (const raw of texts) {
    if (typeof raw !== 'string') continue;
    const lower = raw.toLowerCase();
    let hit = false;
    for (const flag of gt) {
      if (!flag) continue;
      const kws = (Array.isArray(flag.keywords) ? flag.keywords : [])
        .filter((k) => typeof k === 'string' && k.length > 0)
        .map((k) => k.toLowerCase());
      if (kws.some((kw) => lower.includes(kw))) {
        hit = true;
        break;
      }
    }
    if (hit) matchedTexts += 1;
  }

  const recallR = safeRatio(detected, total, 'clean deal: no planted flags (recall N/A)');
  const requiredRecallR = safeRatio(requiredDetected, requiredTotal, 'no required planted flags');
  const precisionR = safeRatio(matchedTexts, texts.length, 'no flags raised by the system');

  // On a clean deal (total === 0), every raised flag is a false positive.
  const falsePositiveCount = total === 0 ? texts.length : texts.length - matchedTexts;

  return {
    recall: recallR.ratio,
    requiredRecall: requiredRecallR.ratio,
    precision: precisionR.ratio,
    total,
    detected,
    requiredTotal,
    requiredDetected,
    falsePositiveCount,
    perFlag
  };
}

// ---------------------------------------------------------------------------
// scoreDealbreakers(groundTruthDealbreakers, systemFlagTexts)
// ---------------------------------------------------------------------------
// Same keyword matching as scoreFlags. Dealbreakers are planted hard-stops.
export function scoreDealbreakers(groundTruthDealbreakers, systemFlagTexts) {
  const gt = Array.isArray(groundTruthDealbreakers) ? groundTruthDealbreakers : [];
  const texts = Array.isArray(systemFlagTexts) ? systemFlagTexts : [];

  const perDealbreaker = [];
  let detected = 0;

  for (const db of gt) {
    if (!db) continue;
    const matchedText = findKeywordMatch(texts, db.keywords);
    const isDetected = matchedText !== null;
    if (isDetected) detected += 1;
    perDealbreaker.push({
      id: db.id !== undefined ? db.id : null,
      required: db.required === true,
      detected: isDetected,
      matchedText: matchedText
    });
  }

  const total = perDealbreaker.length;
  const recallR = safeRatio(detected, total, 'no planted dealbreakers (recall N/A)');

  return {
    recall: recallR.ratio,
    total,
    detected,
    perDealbreaker
  };
}

// ---------------------------------------------------------------------------
// normalizeVerdict(raw) -> "PASS" | "CONDITIONAL" | "FAIL" | "UNKNOWN"
// ---------------------------------------------------------------------------
// Aliases (case-insensitive):
//   PROCEED_WITH_MITIGATIONS -> CONDITIONAL
//   NEEDS_REVIEW             -> CONDITIONAL
// Unknown / missing -> UNKNOWN.
export function normalizeVerdict(raw) {
  if (typeof raw !== 'string') return 'UNKNOWN';
  const v = raw.trim().toUpperCase();
  switch (v) {
    case 'PASS':
      return 'PASS';
    case 'FAIL':
      return 'FAIL';
    case 'CONDITIONAL':
    case 'PROCEED_WITH_MITIGATIONS':
    case 'NEEDS_REVIEW':
      return 'CONDITIONAL';
    default:
      return 'UNKNOWN';
  }
}

// ---------------------------------------------------------------------------
// verdictDirection(verdict) -> "go" | "no-go" | "unknown"
// ---------------------------------------------------------------------------
// FAIL -> no-go; PASS/CONDITIONAL -> go; UNKNOWN -> unknown.
export function verdictDirection(verdict) {
  const v = normalizeVerdict(verdict);
  if (v === 'UNKNOWN') return 'unknown';
  if (v === 'FAIL') return 'no-go';
  return 'go';
}

// ---------------------------------------------------------------------------
// scoreVerdict(groundTruthVerdict, systemVerdict)
// ---------------------------------------------------------------------------
export function scoreVerdict(groundTruthVerdict, systemVerdict) {
  const expected = normalizeVerdict(groundTruthVerdict);
  const actual = normalizeVerdict(systemVerdict);
  const expectedDirection = verdictDirection(expected);
  const actualDirection = verdictDirection(actual);

  // An UNKNOWN on either side cannot be a true match (we never reward a
  // verdict we couldn't read).
  const bothKnown = expected !== 'UNKNOWN' && actual !== 'UNKNOWN';
  const exactMatch = bothKnown && expected === actual;
  const directionalMatch =
    bothKnown && expectedDirection !== 'unknown' && expectedDirection === actualDirection;

  return {
    exactMatch,
    directionalMatch,
    expected,
    actual,
    expectedDirection,
    actualDirection
  };
}

// ---------------------------------------------------------------------------
// scoreDeal(groundTruth, systemAnswer) -> per-deal scorecard
// ---------------------------------------------------------------------------
// Combines the layer-appropriate sub-scores for one deal / one layer.
// - extraction layer scores fields.
// - sim / live layers score financials, flags, dealbreakers, and the verdict.
// Sections that don't apply to the layer are omitted (set to null) rather than
// faked.
export function scoreDeal(groundTruth, systemAnswer) {
  const gt = groundTruth || {};
  const sys = systemAnswer || {};
  const layer = sys.layer || 'extraction';
  const dealId = sys.dealId || gt.dealId || null;

  const scorecard = {
    dealId,
    layer,
    archetype: gt.archetype || null,
    extraction: null,
    financials: null,
    redFlags: null,
    dealbreakers: null,
    verdict: null,
    partialFailure: sys.partialFailure || null
  };

  if (layer === 'extraction') {
    const gtFields = (gt.extraction && gt.extraction.fields) || [];
    scorecard.extraction = scoreExtraction(gtFields, sys.fields || []);
  } else {
    // sim / live: financials + flags + dealbreakers + verdict.
    const gtMetrics = (gt.financials && gt.financials.metrics) || [];
    scorecard.financials = scoreFinancials(gtMetrics, sys.metrics || {});
    scorecard.redFlags = scoreFlags(gt.redFlags || [], sys.flagTexts || []);
    scorecard.dealbreakers = scoreDealbreakers(gt.dealbreakers || [], sys.flagTexts || []);
    const gtVerdict = gt.icVerdict && gt.icVerdict.value;
    scorecard.verdict = scoreVerdict(gtVerdict, sys.verdict);
  }

  return scorecard;
}

// ---------------------------------------------------------------------------
// aggregate(dealScorecards) -> benchmark aggregate
// ---------------------------------------------------------------------------
// Macro-average each metric across deals, IGNORING null/N-A values (a deal
// that doesn't contribute a metric isn't counted in that metric's mean).
// Returns { metrics: { <metric>: { mean, n } }, counts: {...} }.
// NEVER emits NaN: a metric with zero contributing deals returns
// { mean: null, n: 0, note }.
export function aggregate(dealScorecards) {
  const cards = Array.isArray(dealScorecards) ? dealScorecards : [];

  // Collector: pushes a value only if it is a finite number.
  const series = {};
  function collect(metricName, value) {
    if (!series[metricName]) series[metricName] = [];
    if (isFiniteNumber(value)) series[metricName].push(value);
  }

  const counts = {
    deals: cards.length,
    byLayer: {},
    partialFailures: 0
  };

  for (const card of cards) {
    if (!card) continue;
    const layer = card.layer || 'unknown';
    counts.byLayer[layer] = (counts.byLayer[layer] || 0) + 1;
    if (card.partialFailure) counts.partialFailures += 1;

    if (card.extraction) {
      collect('extractionPrecision', card.extraction.precision);
      collect('extractionRecall', card.extraction.recall);
      collect('extractionF1', card.extraction.f1);
      collect('extractionNumericWithinTolerance', card.extraction.numericWithinTolerance);
    }
    if (card.financials) {
      collect('financialDeterminable', card.financials.determinable.ratio);
      collect('financialModelDependent', card.financials.modelDependent.ratio);
    }
    if (card.redFlags) {
      collect('redFlagRecall', card.redFlags.recall);
      collect('redFlagRequiredRecall', card.redFlags.requiredRecall);
      collect('redFlagPrecision', card.redFlags.precision);
    }
    if (card.dealbreakers) {
      collect('dealbreakerRecall', card.dealbreakers.recall);
    }
    if (card.verdict) {
      collect('icExactMatch', card.verdict.exactMatch ? 1 : 0);
      collect('icDirectionalMatch', card.verdict.directionalMatch ? 1 : 0);
    }
  }

  const metrics = {};
  for (const [name, values] of Object.entries(series)) {
    if (values.length === 0) {
      metrics[name] = { mean: null, n: 0, note: 'no contributing deals (N/A)' };
    } else {
      const sum = values.reduce((acc, v) => acc + v, 0);
      metrics[name] = { mean: sum / values.length, n: values.length };
    }
  }

  return { metrics, counts };
}
