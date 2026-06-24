// scripts/eval-scoring.test.mjs
//
// Pure Node ESM test for eval/lib/scoring.mjs — the gate against DISHONEST
// scoring. Run with: node scripts/eval-scoring.test.mjs   (NOT tsx)
//
// Every expected number below is hand-computed and annotated so a reviewer can
// re-derive it. assert throws on failure; we also set exit(1) explicitly.
import assert from 'node:assert/strict';
import {
  withinTolerance,
  scoreExtraction,
  scoreFinancials,
  scoreFlags,
  scoreDealbreakers,
  normalizeVerdict,
  verdictDirection,
  scoreVerdict,
  scoreDeal,
  aggregate
} from '../eval/lib/scoring.mjs';
import {
  parseMoney,
  parsePercent,
  parseRatio,
  splitSections,
  parseFinancials,
  parseVerdict,
  parseFlagTexts
} from '../eval/lib/markdown-parse.mjs';
import {
  THRESHOLDS,
  evaluateThresholds,
  computeFalseApprove
} from '../eval/lib/thresholds.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL - ${name}`);
    console.error(err && err.stack ? err.stack : String(err));
  }
}

// Helper for comparing nullable floats with a tiny epsilon.
function closeTo(actual, expected, eps = 1e-9) {
  assert.ok(
    typeof actual === 'number' && Math.abs(actual - expected) <= eps,
    `expected ${expected}, got ${actual}`
  );
}

// ===========================================================================
// withinTolerance — every type incl. boundary, just-over, null/NaN
// ===========================================================================

test('withinTolerance exact: numbers strict equal', () => {
  assert.equal(withinTolerance(100, 100, { type: 'exact' }), true);
  assert.equal(withinTolerance(100.0000001, 100, { type: 'exact' }), false);
});

test('withinTolerance exact: strings case-insensitive + trimmed', () => {
  assert.equal(withinTolerance('  PASS ', 'pass', { type: 'exact' }), true);
  assert.equal(withinTolerance('Core-Plus', 'core-plus', { type: 'exact' }), true);
  assert.equal(withinTolerance('fail', 'pass', { type: 'exact' }), false);
});

test('withinTolerance exact: type mismatch number vs string is not a match', () => {
  assert.equal(withinTolerance(120, '120', { type: 'exact' }), false);
  assert.equal(withinTolerance('120', 120, { type: 'exact' }), false);
});

test('withinTolerance exact: booleans', () => {
  assert.equal(withinTolerance(true, true, { type: 'exact' }), true);
  assert.equal(withinTolerance(false, true, { type: 'exact' }), false);
});

test('withinTolerance relative: at boundary passes, just over fails', () => {
  // pct 0.01 of expected 1000 => band of 10.
  assert.equal(withinTolerance(1010, 1000, { type: 'relative', pct: 0.01 }), true); // exactly at boundary
  assert.equal(withinTolerance(990, 1000, { type: 'relative', pct: 0.01 }), true); // exactly at boundary, low side
  assert.equal(withinTolerance(1010.0001, 1000, { type: 'relative', pct: 0.01 }), false); // just over
});

test('withinTolerance relative: expected 0 collapses to exact-zero', () => {
  assert.equal(withinTolerance(0, 0, { type: 'relative', pct: 0.05 }), true);
  assert.equal(withinTolerance(0.001, 0, { type: 'relative', pct: 0.05 }), false);
});

test('withinTolerance absolute: at boundary passes, just over fails', () => {
  // Use cleanly-representable values so the boundary is exact: diff of exactly
  // 5 against an abs band of 5. (0.0615-0.06 in IEEE-754 is 0.00150000...013,
  // i.e. just over 0.0015 — withinTolerance correctly rejects that, see the
  // float-honesty test below. We do NOT fudge floating point here.)
  assert.equal(withinTolerance(105, 100, { type: 'absolute', abs: 5 }), true); // boundary high
  assert.equal(withinTolerance(95, 100, { type: 'absolute', abs: 5 }), true); // boundary low
  assert.equal(withinTolerance(105.0001, 100, { type: 'absolute', abs: 5 }), false); // just over
});

test('withinTolerance absolute: no floating-point fudge (honest rejection at IEEE boundary)', () => {
  // 0.0615 - 0.06 === 0.0015000000000000013 > 0.0015, so this is correctly a
  // MISS. Scoring must never round floats up to flatter a result.
  assert.equal(withinTolerance(0.0615, 0.06, { type: 'absolute', abs: 0.0015 }), false);
  // The low side 0.0585 - 0.06 === -0.0014999999999999944, within band -> match.
  assert.equal(withinTolerance(0.0585, 0.06, { type: 'absolute', abs: 0.0015 }), true);
});

test('withinTolerance: null/undefined/NaN actual is NEVER within tolerance', () => {
  for (const tol of [{ type: 'exact' }, { type: 'relative', pct: 0.5 }, { type: 'absolute', abs: 1000 }]) {
    assert.equal(withinTolerance(null, 100, tol), false);
    assert.equal(withinTolerance(undefined, 100, tol), false);
    assert.equal(withinTolerance(NaN, 100, tol), false);
  }
});

test('withinTolerance: relative/absolute with non-numeric actual fails', () => {
  assert.equal(withinTolerance('abc', 100, { type: 'relative', pct: 0.5 }), false);
  assert.equal(withinTolerance('abc', 100, { type: 'absolute', abs: 1000 }), false);
});

test('withinTolerance: default tolerance (missing type) behaves as exact', () => {
  assert.equal(withinTolerance(5, 5, {}), true);
  assert.equal(withinTolerance(5, 6, {}), false);
});

// ===========================================================================
// scoreExtraction — precision/recall partial matches, F1, divide-by-zero
// ===========================================================================

test('scoreExtraction: partial matches with precision/recall/F1', () => {
  const gt = [
    { path: 'property.totalUnits', value: 120, tolerance: { type: 'exact' } },
    { path: 'financials.askingPrice', value: 18500000, tolerance: { type: 'relative', pct: 0.005 } },
    { path: 'financials.currentNOI', value: 1110000, tolerance: { type: 'relative', pct: 0.01 } },
    { path: 'financials.inPlaceOccupancy', value: 0.94, tolerance: { type: 'absolute', abs: 0.01 } }
  ];
  const sys = [
    { path: 'property.totalUnits', value: 120 }, // exact match
    { path: 'financials.askingPrice', value: 18550000 }, // within 0.5% (band 92500) -> match
    { path: 'financials.currentNOI', value: 1200000 }, // off by 90k > 1% (11100) -> miss
    // inPlaceOccupancy MISSING -> not recalled
    { path: 'financials.extraGuess', value: 999 } // extra field, NOT in ground truth -> excluded from precision
  ];
  const r = scoreExtraction(gt, sys);

  // recall: matched GT fields = totalUnits, askingPrice = 2 of 4.
  assert.equal(r.matched, 2);
  assert.equal(r.groundTruthCount, 4);
  closeTo(r.recall, 2 / 4); // 0.5

  // precision denominator = system fields whose path IS in ground truth:
  //   totalUnits, askingPrice, currentNOI = 3 (extraGuess excluded).
  // numerator = those within tolerance = totalUnits, askingPrice = 2.
  closeTo(r.precision, 2 / 3);

  // F1 = 2*p*r/(p+r) = 2*(2/3)*(1/2)/((2/3)+(1/2)) = (2/3)/(7/6) = 4/7.
  closeTo(r.f1, 4 / 7);

  // numeric-within-tolerance: all 4 GT fields numeric; 2 matched.
  closeTo(r.numericWithinTolerance, 2 / 4);

  assert.equal(r.extractedCount, 4); // all system fields counted in extractedCount

  // perField present/matched flags.
  const occ = r.perField.find((f) => f.path === 'financials.inPlaceOccupancy');
  assert.equal(occ.present, false);
  assert.equal(occ.matched, false);
  assert.equal(occ.actual, null);
  const noi = r.perField.find((f) => f.path === 'financials.currentNOI');
  assert.equal(noi.present, true);
  assert.equal(noi.matched, false);
});

test('scoreExtraction: divide-by-zero guards return null, never NaN', () => {
  const r = scoreExtraction([], []);
  assert.equal(r.recall, null);
  assert.equal(r.precision, null);
  assert.equal(r.f1, null);
  assert.equal(r.numericWithinTolerance, null);
  assert.equal(r.matched, 0);
  assert.equal(r.groundTruthCount, 0);
});

test('scoreExtraction: string field exact case-insensitive match', () => {
  const gt = [{ path: 'investmentStrategy', value: 'Core-Plus', tolerance: { type: 'exact' } }];
  const sys = [{ path: 'investmentStrategy', value: 'core-plus' }];
  const r = scoreExtraction(gt, sys);
  closeTo(r.recall, 1);
  closeTo(r.precision, 1);
  closeTo(r.f1, 1);
  // No numeric GT fields -> numericWithinTolerance N/A.
  assert.equal(r.numericWithinTolerance, null);
});

test('scoreExtraction: perfect numeric extraction', () => {
  const gt = [
    { path: 'a', value: 10, tolerance: { type: 'exact' } },
    { path: 'b', value: 20, tolerance: { type: 'exact' } }
  ];
  const sys = [
    { path: 'a', value: 10 },
    { path: 'b', value: 20 }
  ];
  const r = scoreExtraction(gt, sys);
  closeTo(r.precision, 1);
  closeTo(r.recall, 1);
  closeTo(r.f1, 1);
  closeTo(r.numericWithinTolerance, 1);
});

// ===========================================================================
// scoreFinancials — determinable / model-dependent split + guards
// ===========================================================================

test('scoreFinancials: splits by class and computes per-bucket ratios', () => {
  const gtMetrics = [
    { key: 'noi', value: 1110000, tolerance: { type: 'relative', pct: 0.02 }, class: 'determinable' },
    { key: 'egi', value: 1820000, tolerance: { type: 'relative', pct: 0.02 }, class: 'determinable' },
    { key: 'capRate', value: 0.06, tolerance: { type: 'absolute', abs: 0.0015 }, class: 'determinable' },
    { key: 'dscr', value: 1.35, tolerance: { type: 'absolute', abs: 0.08 }, class: 'determinable' },
    { key: 'irr', value: 0.145, tolerance: { type: 'absolute', abs: 0.03 }, class: 'model-dependent' },
    { key: 'equityMultiple', value: 1.75, tolerance: { type: 'absolute', abs: 0.2 }, class: 'model-dependent' }
  ];
  const sysMetrics = {
    noi: 1115000, // within 2% -> match
    egi: 1900000, // off by 80k > 2% (36400) -> miss
    capRate: 0.0605, // within 0.0015 -> match
    dscr: 1.20, // off 0.15 > 0.08 -> miss
    irr: 0.16, // off 0.015 < 0.03 -> match
    equityMultiple: null // null -> miss
  };
  const r = scoreFinancials(gtMetrics, sysMetrics);

  // determinable: noi match, egi miss, capRate match, dscr miss => 2/4.
  assert.equal(r.determinable.withinTolerance, 2);
  assert.equal(r.determinable.total, 4);
  closeTo(r.determinable.ratio, 2 / 4);

  // model-dependent: irr match, equityMultiple miss (null) => 1/2.
  assert.equal(r.modelDependent.withinTolerance, 1);
  assert.equal(r.modelDependent.total, 2);
  closeTo(r.modelDependent.ratio, 1 / 2);

  // perMetric carries class + tolerance.
  const dscrRow = r.perMetric.find((m) => m.key === 'dscr');
  assert.equal(dscrRow.class, 'determinable');
  assert.equal(dscrRow.matched, false);
  const emRow = r.perMetric.find((m) => m.key === 'equityMultiple');
  assert.equal(emRow.actual, null);
  assert.equal(emRow.matched, false);
});

test('scoreFinancials: missing key (not in systemMetrics) counts as miss, never NaN', () => {
  const gtMetrics = [
    { key: 'noi', value: 1000, tolerance: { type: 'exact' }, class: 'determinable' }
  ];
  const r = scoreFinancials(gtMetrics, {}); // noi absent
  assert.equal(r.determinable.withinTolerance, 0);
  assert.equal(r.determinable.total, 1);
  closeTo(r.determinable.ratio, 0);
  // model-dependent bucket empty -> ratio null (N/A), not NaN.
  assert.equal(r.modelDependent.ratio, null);
  assert.equal(r.modelDependent.total, 0);
});

// ===========================================================================
// scoreFlags — keyword hit/miss, case-insensitive, clean-deal FP counting
// ===========================================================================

test('scoreFlags: keyword detection hit (case-insensitive)', () => {
  const gtFlags = [
    { id: 'insurance-understated', required: true, keywords: ['insurance', 'understated', 'below market'] },
    { id: 'deferred-maint', required: false, keywords: ['deferred maintenance', 'capex backlog'] }
  ];
  const sysTexts = [
    'The INSURANCE line appears Understated relative to market.', // hits flag 1
    'No major concerns on the roof.' // hits nothing
  ];
  const r = scoreFlags(gtFlags, sysTexts);

  assert.equal(r.total, 2);
  assert.equal(r.detected, 1); // only flag 1 detected
  closeTo(r.recall, 1 / 2);
  assert.equal(r.requiredTotal, 1);
  assert.equal(r.requiredDetected, 1);
  closeTo(r.requiredRecall, 1); // the one required flag detected

  // precision: of 2 raised texts, 1 matched a planted flag -> 1/2.
  closeTo(r.precision, 1 / 2);
  // false positives: raised texts that matched nothing = 1.
  assert.equal(r.falsePositiveCount, 1);

  const f1 = r.perFlag.find((f) => f.id === 'insurance-understated');
  assert.equal(f1.detected, true);
  assert.ok(typeof f1.matchedText === 'string');
  const f2 = r.perFlag.find((f) => f.id === 'deferred-maint');
  assert.equal(f2.detected, false);
  assert.equal(f2.matchedText, null);
});

test('scoreFlags: keyword miss when no text contains a keyword', () => {
  const gtFlags = [{ id: 'x', required: true, keywords: ['phase i esa', 'environmental'] }];
  const sysTexts = ['Strong in-place occupancy and clean rent roll.'];
  const r = scoreFlags(gtFlags, sysTexts);
  assert.equal(r.detected, 0);
  closeTo(r.recall, 0);
  closeTo(r.requiredRecall, 0);
  assert.equal(r.falsePositiveCount, 1); // the one raised text matched nothing
});

test('scoreFlags: clean deal (no planted flags) -> recall N/A, FPs counted', () => {
  const r = scoreFlags([], ['I think occupancy might be a concern', 'cap rate looks aggressive']);
  assert.equal(r.recall, null); // N/A on a clean deal
  assert.equal(r.total, 0);
  // Every raised flag on a clean deal is a false positive.
  assert.equal(r.falsePositiveCount, 2);
  // precision denominator = raised texts; numerator 0 since no planted flags.
  closeTo(r.precision, 0);
});

test('scoreFlags: clean deal with zero flags raised -> no false positives, precision N/A', () => {
  const r = scoreFlags([], []);
  assert.equal(r.recall, null);
  assert.equal(r.falsePositiveCount, 0);
  assert.equal(r.precision, null); // no flags raised -> precision N/A
});

// ===========================================================================
// scoreDealbreakers — recall + keyword matching
// ===========================================================================

test('scoreDealbreakers: detection and recall', () => {
  const gtDb = [
    { id: 'dscr-sub-080', required: true, keywords: ['dscr', '0.80', 'below 0.8'] },
    { id: 'occupancy-collapse', required: true, keywords: ['occupancy collapse', '62%', '0.62'] }
  ];
  const sysTexts = ['The going-in DSCR of 0.76 is below 0.8 — hard stop.'];
  const r = scoreDealbreakers(gtDb, sysTexts);
  assert.equal(r.total, 2);
  assert.equal(r.detected, 1); // dscr one detected; occupancy not
  closeTo(r.recall, 1 / 2);
  const d1 = r.perDealbreaker.find((d) => d.id === 'dscr-sub-080');
  assert.equal(d1.detected, true);
});

test('scoreDealbreakers: empty -> recall N/A', () => {
  const r = scoreDealbreakers([], ['anything']);
  assert.equal(r.recall, null);
  assert.equal(r.total, 0);
  assert.equal(r.detected, 0);
});

// ===========================================================================
// normalizeVerdict + verdictDirection — all aliases
// ===========================================================================

test('normalizeVerdict: canonical + aliases (case-insensitive)', () => {
  assert.equal(normalizeVerdict('PASS'), 'PASS');
  assert.equal(normalizeVerdict('pass'), 'PASS');
  assert.equal(normalizeVerdict('FAIL'), 'FAIL');
  assert.equal(normalizeVerdict('Conditional'), 'CONDITIONAL');
  assert.equal(normalizeVerdict('PROCEED_WITH_MITIGATIONS'), 'CONDITIONAL');
  assert.equal(normalizeVerdict('proceed_with_mitigations'), 'CONDITIONAL');
  assert.equal(normalizeVerdict('NEEDS_REVIEW'), 'CONDITIONAL');
  assert.equal(normalizeVerdict('needs_review'), 'CONDITIONAL');
  assert.equal(normalizeVerdict('  pass  '), 'PASS'); // trimmed
  assert.equal(normalizeVerdict('GO'), 'UNKNOWN'); // banned legacy enum -> unknown
  assert.equal(normalizeVerdict(''), 'UNKNOWN');
  assert.equal(normalizeVerdict(null), 'UNKNOWN');
  assert.equal(normalizeVerdict(undefined), 'UNKNOWN');
  assert.equal(normalizeVerdict(42), 'UNKNOWN');
});

test('verdictDirection: FAIL->no-go, PASS/CONDITIONAL->go, UNKNOWN->unknown', () => {
  assert.equal(verdictDirection('FAIL'), 'no-go');
  assert.equal(verdictDirection('PASS'), 'go');
  assert.equal(verdictDirection('CONDITIONAL'), 'go');
  assert.equal(verdictDirection('PROCEED_WITH_MITIGATIONS'), 'go');
  assert.equal(verdictDirection('NEEDS_REVIEW'), 'go');
  assert.equal(verdictDirection('garbage'), 'unknown');
});

// ===========================================================================
// scoreVerdict — exact + directional
// ===========================================================================

test('scoreVerdict: exact match', () => {
  const r = scoreVerdict('FAIL', 'fail');
  assert.equal(r.exactMatch, true);
  assert.equal(r.directionalMatch, true);
  assert.equal(r.expected, 'FAIL');
  assert.equal(r.actual, 'FAIL');
  assert.equal(r.expectedDirection, 'no-go');
  assert.equal(r.actualDirection, 'no-go');
});

test('scoreVerdict: directional match without exact (PASS vs CONDITIONAL)', () => {
  const r = scoreVerdict('PASS', 'PROCEED_WITH_MITIGATIONS');
  assert.equal(r.exactMatch, false); // PASS != CONDITIONAL
  assert.equal(r.directionalMatch, true); // both "go"
});

test('scoreVerdict: directional mismatch (PASS vs FAIL)', () => {
  const r = scoreVerdict('PASS', 'FAIL');
  assert.equal(r.exactMatch, false);
  assert.equal(r.directionalMatch, false); // go vs no-go
});

test('scoreVerdict: UNKNOWN actual never matches', () => {
  const r = scoreVerdict('FAIL', 'totally unreadable');
  assert.equal(r.actual, 'UNKNOWN');
  assert.equal(r.exactMatch, false);
  assert.equal(r.directionalMatch, false);
});

// ===========================================================================
// scoreDeal — extraction layer and sim/live layer
// ===========================================================================

test('scoreDeal: extraction layer scores fields only', () => {
  const gt = {
    dealId: 'cp-stabilized-clean',
    archetype: 'core-plus',
    extraction: {
      fields: [
        { path: 'property.totalUnits', value: 120, tolerance: { type: 'exact' } },
        { path: 'financials.askingPrice', value: 18500000, tolerance: { type: 'relative', pct: 0.005 } }
      ]
    }
  };
  const sys = {
    dealId: 'cp-stabilized-clean',
    layer: 'extraction',
    fields: [
      { path: 'property.totalUnits', value: 120 },
      { path: 'financials.askingPrice', value: 18500000 }
    ]
  };
  const card = scoreDeal(gt, sys);
  assert.equal(card.layer, 'extraction');
  assert.equal(card.archetype, 'core-plus');
  assert.notEqual(card.extraction, null);
  assert.equal(card.financials, null);
  assert.equal(card.verdict, null);
  closeTo(card.extraction.f1, 1);
});

test('scoreDeal: live layer scores financials/flags/dealbreakers/verdict', () => {
  const gt = {
    dealId: 'ds-dscr-below-080',
    archetype: 'distressed',
    financials: {
      metrics: [
        { key: 'noi', value: 1000000, tolerance: { type: 'relative', pct: 0.02 }, class: 'determinable' },
        { key: 'dscr', value: 0.76, tolerance: { type: 'absolute', abs: 0.08 }, class: 'determinable' }
      ]
    },
    redFlags: [
      { id: 'low-dscr', required: true, keywords: ['dscr', 'debt service'] }
    ],
    dealbreakers: [
      { id: 'dscr-sub-080', required: true, keywords: ['below 0.8', '0.76'] }
    ],
    icVerdict: { value: 'FAIL', directional: 'no-go' }
  };
  const sys = {
    dealId: 'ds-dscr-below-080',
    layer: 'live',
    metrics: { noi: 1010000, egi: null, capRate: null, dscr: 0.76, irr: null, equityMultiple: null },
    flagTexts: ['Going-in DSCR is 0.76, well below 0.8 minimum — debt service not covered.'],
    verdict: 'FAIL',
    partialFailure: null
  };
  const card = scoreDeal(gt, sys);
  assert.equal(card.layer, 'live');
  assert.equal(card.extraction, null);
  closeTo(card.financials.determinable.ratio, 1); // both noi + dscr within tol
  closeTo(card.redFlags.recall, 1);
  closeTo(card.dealbreakers.recall, 1);
  assert.equal(card.verdict.exactMatch, true);
  assert.equal(card.verdict.directionalMatch, true);
});

// ===========================================================================
// scoreDeal + aggregate — full happy-path with hand-computed expected numbers
// ===========================================================================

test('aggregate: macro-averages across deals, ignoring null/NA, never NaN', () => {
  // Build three extraction-layer scorecards with known sub-scores.
  const mkExtraction = (dealId, gtFields, sysFields) =>
    scoreDeal(gt(dealId, gtFields), sysAnswer(dealId, sysFields));

  function gt(dealId, fields) {
    return { dealId, archetype: 'core-plus', extraction: { fields } };
  }
  function sysAnswer(dealId, fields) {
    return { dealId, layer: 'extraction', fields };
  }

  // Deal A: perfect 2/2 -> precision 1, recall 1, f1 1, numeric 1.
  const a = mkExtraction(
    'A',
    [
      { path: 'x', value: 10, tolerance: { type: 'exact' } },
      { path: 'y', value: 20, tolerance: { type: 'exact' } }
    ],
    [
      { path: 'x', value: 10 },
      { path: 'y', value: 20 }
    ]
  );
  // Deal B: 1 of 2 recalled, both candidate paths in GT.
  //   GT: x=10, y=20. SYS: x=10 (match), y=99 (miss).
  //   recall 1/2=0.5; precision 1/2=0.5; f1 0.5; numeric 1/2=0.5.
  const b = mkExtraction(
    'B',
    [
      { path: 'x', value: 10, tolerance: { type: 'exact' } },
      { path: 'y', value: 20, tolerance: { type: 'exact' } }
    ],
    [
      { path: 'x', value: 10 },
      { path: 'y', value: 99 }
    ]
  );

  const agg = aggregate([a, b]);

  // precision mean = (1 + 0.5)/2 = 0.75 over n=2.
  closeTo(agg.metrics.extractionPrecision.mean, 0.75);
  assert.equal(agg.metrics.extractionPrecision.n, 2);
  // recall mean = (1 + 0.5)/2 = 0.75.
  closeTo(agg.metrics.extractionRecall.mean, 0.75);
  // f1 mean = (1 + 0.5)/2 = 0.75.
  closeTo(agg.metrics.extractionF1.mean, 0.75);
  // numeric mean = (1 + 0.5)/2 = 0.75.
  closeTo(agg.metrics.extractionNumericWithinTolerance.mean, 0.75);

  assert.equal(agg.counts.deals, 2);
  assert.equal(agg.counts.byLayer.extraction, 2);
});

test('aggregate: live deals — IC exact/directional means + flag recall', () => {
  // Two live deals.
  // Deal 1: verdict FAIL vs FAIL (exact + directional), dealbreaker recall 1.
  const d1 = scoreDeal(
    {
      dealId: 'd1',
      financials: { metrics: [{ key: 'dscr', value: 0.76, tolerance: { type: 'absolute', abs: 0.08 }, class: 'determinable' }] },
      redFlags: [{ id: 'r', required: true, keywords: ['dscr'] }],
      dealbreakers: [{ id: 'db', required: true, keywords: ['below 0.8'] }],
      icVerdict: { value: 'FAIL' }
    },
    {
      dealId: 'd1',
      layer: 'live',
      metrics: { dscr: 0.76 },
      flagTexts: ['dscr is below 0.8'],
      verdict: 'FAIL'
    }
  );
  // Deal 2: verdict PASS vs CONDITIONAL (directional match only), clean deal.
  const d2 = scoreDeal(
    {
      dealId: 'd2',
      financials: { metrics: [{ key: 'capRate', value: 0.06, tolerance: { type: 'absolute', abs: 0.0015 }, class: 'determinable' }] },
      redFlags: [], // clean
      dealbreakers: [],
      icVerdict: { value: 'PASS' }
    },
    {
      dealId: 'd2',
      layer: 'live',
      metrics: { capRate: 0.0601 },
      flagTexts: [], // no flags raised on the clean deal -> no false positives
      verdict: 'NEEDS_REVIEW' // -> CONDITIONAL -> directional "go" matches PASS "go"
    }
  );

  const agg = aggregate([d1, d2]);

  // IC exact: d1 exact(1), d2 not exact(0) -> mean 0.5.
  closeTo(agg.metrics.icExactMatch.mean, 0.5);
  assert.equal(agg.metrics.icExactMatch.n, 2);
  // IC directional: both directional matches -> mean 1.
  closeTo(agg.metrics.icDirectionalMatch.mean, 1);

  // Determinable financial accuracy: both within tol -> means over (1,1)=1.
  closeTo(agg.metrics.financialDeterminable.mean, 1);

  // Red-flag recall: d1 has recall 1; d2 is clean (recall null -> excluded).
  // So mean is over n=1 only.
  closeTo(agg.metrics.redFlagRecall.mean, 1);
  assert.equal(agg.metrics.redFlagRecall.n, 1);

  // Dealbreaker recall: d1 recall 1; d2 empty (null -> excluded) => mean 1, n=1.
  closeTo(agg.metrics.dealbreakerRecall.mean, 1);
  assert.equal(agg.metrics.dealbreakerRecall.n, 1);
});

test('aggregate: empty input -> no NaN, counts zeroed', () => {
  const agg = aggregate([]);
  assert.equal(agg.counts.deals, 0);
  assert.deepEqual(agg.metrics, {}); // no series collected
});

test('aggregate: metric with only null contributors -> mean null, n 0', () => {
  // A live deal whose every dealbreaker list is empty -> dealbreakerRecall null.
  const card = scoreDeal(
    {
      dealId: 'clean',
      financials: { metrics: [] },
      redFlags: [],
      dealbreakers: [],
      icVerdict: { value: 'PASS' }
    },
    { dealId: 'clean', layer: 'live', metrics: {}, flagTexts: [], verdict: 'PASS' }
  );
  const agg = aggregate([card]);
  // dealbreakerRecall was collected but only null -> series has it as length 0.
  if (agg.metrics.dealbreakerRecall) {
    assert.equal(agg.metrics.dealbreakerRecall.mean, null);
    assert.equal(agg.metrics.dealbreakerRecall.n, 0);
  }
  // financialDeterminable: empty metrics -> ratio null -> not collected as finite.
  if (agg.metrics.financialDeterminable) {
    assert.equal(agg.metrics.financialDeterminable.mean, null);
  }
});

test('aggregate: counts partial failures honestly', () => {
  const card = scoreDeal(
    { dealId: 'p', financials: { metrics: [] }, redFlags: [], dealbreakers: [], icVerdict: { value: 'FAIL' } },
    {
      dealId: 'p',
      layer: 'live',
      metrics: {},
      flagTexts: [],
      verdict: 'FAIL',
      partialFailure: { failedAgents: ['opex-analyst'], note: '1 agent failed' }
    }
  );
  const agg = aggregate([card]);
  assert.equal(agg.counts.partialFailures, 1);
});

// ===========================================================================
// markdown-parse — reading live agent free-text workpapers (honesty-critical)
// ===========================================================================

test('parseMoney: currency, commas, magnitude suffixes', () => {
  assert.equal(parseMoney('$1,234,567'), 1234567);
  assert.equal(parseMoney('1,234,000'), 1234000);
  assert.equal(parseMoney('$1.2M'), 1200000);
  assert.equal(parseMoney('1.2 million'), 1200000);
  assert.equal(parseMoney('$958,000'), 958000);
  assert.equal(parseMoney('$1.2mm'), 1200000);
  assert.equal(parseMoney('not a number'), null);
});

test('parsePercent: % sign, "percent", and decimal forms', () => {
  closeTo(parsePercent('6.18%'), 0.0618);
  closeTo(parsePercent('6.18 percent'), 0.0618);
  closeTo(parsePercent('0.0618'), 0.0618); // already a decimal rate (<=1)
  closeTo(parsePercent('14.5%'), 0.145);
  closeTo(parsePercent('11.2'), 0.112); // bare >1 treated as percent
  assert.equal(parsePercent('n/a'), null);
});

test('parseRatio: with and without x suffix', () => {
  closeTo(parseRatio('1.13x'), 1.13);
  closeTo(parseRatio('1.13'), 1.13);
  closeTo(parseRatio('0.76x'), 0.76);
  assert.equal(parseRatio('none'), null);
});

test('splitSections: splits ## headings into a map', () => {
  const md = [
    '## Agent Verdict',
    'CONDITIONAL because DSCR is thin.',
    '## Red Flags',
    '- DSCR 1.13x below the 1.20x floor',
    '## Data Gaps',
    'None.'
  ].join('\n');
  const sections = splitSections(md);
  assert.ok(sections.get('agent verdict').includes('CONDITIONAL'));
  assert.ok(sections.get('red flags').includes('1.13x'));
  assert.equal(sections.get('data gaps'), 'None.');
});

test('parseFinancials: pulls labeled figures from a realistic workpaper', () => {
  const md = [
    '## Key Findings',
    '- Net Operating Income: $958,000 on a going-in cap rate of 6.18%.',
    '- DSCR of 1.13x at 72% LTV is below the 1.20x agency floor.',
    '- Effective Gross Income: $2,020,000.',
    '- Leveraged IRR projected at 11.2% with an equity multiple of 1.67x.'
  ].join('\n');
  const f = parseFinancials(md);
  assert.equal(f.noi, 958000);
  assert.equal(f.egi, 2020000);
  closeTo(f.capRate, 0.0618);
  closeTo(f.dscr, 1.13);
  closeTo(f.irr, 0.112);
  closeTo(f.equityMultiple, 1.67);
});

test('parseFinancials: unstated metric is null (no credit)', () => {
  const md = '## Agent Verdict\nPASS. The deal looks clean. No specific figures cited here.';
  const f = parseFinancials(md);
  // No labeled NOI/EGI/cap/dscr/irr/EM -> all null. (Never invent a number.)
  assert.equal(f.noi, null);
  assert.equal(f.egi, null);
  assert.equal(f.dscr, null);
  assert.equal(f.equityMultiple, null);
});

test('parseFinancials: value-before-label and unit-rejection (real agent phrasing)', () => {
  // Phrasing taken from an actual financial-model-builder workpaper.
  const md = [
    'Current NOI of $958K supports only about 1.13x DSCR at 6.5% amortizing debt.',
    'Current cap rate is about 6.18%; pro forma NOI of $1.46M implies a 9.42% stabilized cap rate.'
  ].join('\n');
  const f = parseFinancials(md);
  // DSCR must be the 1.13x ratio, NOT the 6.5% interest rate that follows it.
  closeTo(f.dscr, 1.13);
  // NOI: "Current NOI of $958K" -> 958000 (earliest, not the $1.46M pro forma).
  assert.equal(f.noi, 958000);
  // Cap rate: earliest stated is the 6.18% going-in, not 9.42% stabilized.
  closeTo(f.capRate, 0.0618);
});

test('parseFinancials: rich metrics block — going-in wins over pro-forma; no cross-line label binding', () => {
  // Real failure mode from a financial-model-builder "## Metrics" block: many
  // labeled variants appear one per line, plus an early prose line mentioning
  // pro-forma NOI. The scorer must read the GOING-IN values, must NOT bind a
  // value on line N to a label on line N+1 (e.g. read "LTV: 82.0%" as the cap
  // rate, or the NOI value as EGI), and must prefer going-in over pro-forma /
  // stabilized variants.
  const md = [
    'CONDITIONAL. 82.0% LTV, 0.85x going-in DSCR on amortizing debt; pro forma NOI of $1.56M would support coverage if achieved.',
    '',
    '## Metrics',
    'NOI: $960,000',
    'EGI: $2,120,000',
    'LTV: 82.0%',
    'Going-in Cap Rate: 5.22%',
    'Going-in DSCR (amortizing): 0.85x',
    'Going-in DSCR (interest-only): 0.99x',
    'Pro Forma NOI: $1,560,000',
    'Stabilized DSCR (amortizing): 1.38x'
  ].join('\n');
  const f = parseFinancials(md);
  assert.equal(f.noi, 960000); // going-in NOI, not the $1.56M pro forma
  assert.equal(f.egi, 2120000); // EGI line, not the NOI value on the prior line
  closeTo(f.capRate, 0.0522); // cap rate, not the 82% LTV on the prior line
  closeTo(f.dscr, 0.85); // going-in amortizing, not 1.38x stabilized / 0.99x IO
});

test('parseFinancials: DSCR as "Label (qualifier): value" and "Nx amortizing DSCR"', () => {
  // Metrics-block phrasing where DSCR carries a parenthetical basis and an IO
  // variant follows; read the parenthetical-labelled value, prefer amortizing.
  const block = parseFinancials(
    ['## Metrics', 'Going-in DSCR (amortizing): 1.31x', 'Going-in DSCR (interest-only): 1.59x'].join('\n')
  );
  closeTo(block.dscr, 1.31);
  // Value-before-label with a basis adjective between value and label.
  const prose = parseFinancials('Going-in coverage is 1.31x amortizing DSCR at the deal rate.');
  closeTo(prose.dscr, 1.31);
});

test('parseFinancials: context numbers are NOT mistaken for metrics', () => {
  // The agent declined to compute IRR/EM (no scenario matrix). "27-scenario"
  // must NOT be read as 27% IRR or 27x equity multiple — those stay null.
  const md =
    'No base exit cap or completed 27-scenario matrix was available for full IRR/equity multiple validation.';
  const f = parseFinancials(md);
  assert.equal(f.irr, null); // no "N% IRR" / "IRR N%" present
  assert.equal(f.equityMultiple, null); // no "Nx equity multiple" present
});

test('parseFinancials: IRR/EM read only with their units', () => {
  const md = 'Leveraged IRR of 14.5% and an equity multiple of 1.8x over a 5-year hold.';
  const f = parseFinancials(md);
  closeTo(f.irr, 0.145); // not the "5" from "5-year"
  closeTo(f.equityMultiple, 1.8);
});

test('parseFinancials: threshold/requirement values are NOT read as computed metrics', () => {
  // Real scenario-analyst phrasing: these are REQUIREMENTS, not the deal's
  // numbers, and the agent explicitly did not compute the deal IRR/EM.
  const md = 'The repo threshold requires 1.25x DSCR, 15% IRR, 1.8x equity multiple, and 18 of 27 scenarios passing.';
  const f = parseFinancials(md);
  assert.equal(f.irr, null); // 15% IRR is a threshold -> not credited
  assert.equal(f.equityMultiple, null); // 1.8x is a threshold -> not credited
  assert.equal(f.dscr, null); // 1.25x is a threshold -> not credited
});

test('parseFinancials: a real projected value still reads when not a threshold', () => {
  const md = 'Base-case leveraged IRR is about 12.4% with a 1.6x equity multiple.';
  const f = parseFinancials(md);
  closeTo(f.irr, 0.124);
  closeTo(f.equityMultiple, 1.6);
});

test('parseFinancials: negative returns (distressed) keep their sign', () => {
  // A distressed deal where the agent correctly reports catastrophic returns.
  // The extractor MUST preserve the leading minus — dropping it (reading
  // "-99.0%" as "+99%") flips a precise match into a wild miss.
  const md = ['## Metrics', 'Leveraged IRR: -99.0%', 'Equity Multiple: -2.38x'].join('\n');
  const f = parseFinancials(md);
  closeTo(f.irr, -0.99);
  closeTo(f.equityMultiple, -2.38);
});

test('parseVerdict: reads PASS/CONDITIONAL/FAIL from the verdict section', () => {
  assert.equal(parseVerdict('## Agent Verdict\nFAIL — debt service not covered.'), 'FAIL');
  assert.equal(parseVerdict('## Agent Verdict\nCONDITIONAL pending lower leverage.'), 'CONDITIONAL');
  assert.equal(parseVerdict('## Agent Verdict\nPASS, strong stabilized cash flow.'), 'PASS');
  assert.equal(parseVerdict('## Notes\nno verdict token present here at all'), 'UNKNOWN');
});

test('parseFlagTexts: collects risk-bearing lines for keyword matching', () => {
  const md = [
    '## Key Findings',
    '- Single employer drives ~60% of tenant income (concentration risk).',
    '## Red Flags',
    '- Insurance line looks understated vs market.',
    '## Data Gaps',
    '- No Phase I ESA on file.'
  ].join('\n');
  const texts = parseFlagTexts(md);
  const joined = texts.join(' | ').toLowerCase();
  assert.ok(joined.includes('concentration'));
  assert.ok(joined.includes('insurance'));
  assert.ok(joined.includes('phase i esa'));
  // Bullet markers stripped.
  assert.ok(texts.every((t) => !t.startsWith('-')));
});

test('parseFlagTexts: preserves leading metric values after bullet/list markers', () => {
  const md = [
    '## Red Flags',
    '- 0.76x DSCR is below the 0.80x minimum.',
    '1. 62% occupancy collapse leaves debt service uncovered.',
    '2) 1.13x DSCR below lender floor.',
    '## Notes',
    '- This section should not be included.'
  ].join('\n');
  const texts = parseFlagTexts(md);
  assert.deepEqual(texts, [
    '0.76x DSCR is below the 0.80x minimum.',
    '62% occupancy collapse leaves debt service uncovered.',
    '1.13x DSCR below lender floor.'
  ]);
});

test('parseFlagTexts: empty / non-string input -> []', () => {
  assert.deepEqual(parseFlagTexts(''), []);
  assert.deepEqual(parseFlagTexts(null), []);
});

// ===========================================================================
// Regression thresholds — eval/lib/thresholds.mjs
// ===========================================================================
// These tests are the REGRESSION GATE. They prove two things a skeptic cares
// about: (1) the threshold evaluator FAILS LOUDLY when a real score drops, and
// (2) the committed offline scorecard (the numbers behind eval/REPORT.md) still
// clears every hard gate. A breach here turns `npm run test:eval` red.

// Synthetic scorecard helpers: build a minimal scorecard the evaluator accepts.
function aggMetric(mean, n) {
  return { mean, n: n === undefined ? (mean === null ? 0 : 1) : n };
}
function makeScorecard({ ext = {}, sim = {}, simDeals = [] } = {}) {
  const layers = {};
  if (ext && Object.keys(ext).length) {
    layers.extraction = { metrics: {}, counts: { deals: 8 }, deals: [] };
    for (const [k, v] of Object.entries(ext)) layers.extraction.metrics[k] = aggMetric(v, 8);
  }
  if ((sim && Object.keys(sim).length) || simDeals.length) {
    layers.simulation = { metrics: {}, counts: { deals: 8 }, deals: simDeals };
    for (const [k, v] of Object.entries(sim)) layers.simulation.metrics[k] = aggMetric(v, 8);
  }
  return { layers };
}
function noGoDeal(dealId, actualDirection) {
  return {
    dealId,
    layer: 'sim',
    verdict: { expectedDirection: 'no-go', actualDirection, expected: 'FAIL', actual: actualDirection === 'go' ? 'PASS' : 'FAIL' }
  };
}

// A scorecard that clears every hard gate (mirrors the real offline numbers).
const PASSING = makeScorecard({
  ext: { extractionPrecision: 1, extractionRecall: 1, extractionF1: 1, extractionNumericWithinTolerance: 1 },
  sim: { financialDeterminable: 1, dealbreakerRecall: 1, icDirectionalMatch: 1, icExactMatch: 0.75 },
  simDeals: [noGoDeal('ds-a', 'no-go'), noGoDeal('ds-b', 'no-go')]
});

test('thresholds: a fully-passing scorecard yields ok=true with measured gates', () => {
  const r = evaluateThresholds(PASSING);
  assert.equal(r.ok, true);
  assert.ok(r.measuredGates >= 9, `expected >=9 measured gates, got ${r.measuredGates}`);
  assert.equal(r.gatedFailures, 0);
});

test('thresholds: a DROPPED extraction precision trips the gate (regression caught)', () => {
  const bad = makeScorecard({
    ext: { extractionPrecision: 0.5, extractionRecall: 1, extractionF1: 1, extractionNumericWithinTolerance: 1 },
    sim: { financialDeterminable: 1, dealbreakerRecall: 1, icDirectionalMatch: 1, icExactMatch: 0.75 },
    simDeals: [noGoDeal('ds-a', 'no-go'), noGoDeal('ds-b', 'no-go')]
  });
  const r = evaluateThresholds(bad);
  assert.equal(r.ok, false);
  assert.ok(r.gatedFailures >= 1);
  const row = r.results.find((x) => x.id === 'extractionPrecision');
  assert.equal(row.pass, false);
});

test('thresholds: a FALSE APPROVE (go verdict on a FAIL deal) trips the safety gate', () => {
  const bad = makeScorecard({
    ext: { extractionPrecision: 1, extractionRecall: 1, extractionF1: 1, extractionNumericWithinTolerance: 1 },
    sim: { financialDeterminable: 1, dealbreakerRecall: 1, icDirectionalMatch: 0.875, icExactMatch: 0.75 },
    // One of the two no-go deals was wrongly approved (direction "go").
    simDeals: [noGoDeal('ds-a', 'go'), noGoDeal('ds-b', 'no-go')]
  });
  const fa = computeFalseApprove(bad);
  assert.equal(fa.count, 1);
  assert.equal(fa.total, 2);
  closeTo(fa.rate, 0.5);
  const r = evaluateThresholds(bad);
  assert.equal(r.ok, false);
  const row = r.results.find((x) => x.id === 'falseApproveRate');
  assert.equal(row.pass, false);
});

test('thresholds: a null/N-A on a measured GATE metric is a FAILURE, never a free pass', () => {
  const bad = makeScorecard({
    ext: { extractionPrecision: null, extractionRecall: 1, extractionF1: 1, extractionNumericWithinTolerance: 1 }
  });
  const r = evaluateThresholds(bad);
  const row = r.results.find((x) => x.id === 'extractionPrecision');
  // A null mean (n=0) is "not measured" — present:true but not gate-counted.
  // The point being asserted: it does NOT silently pass.
  assert.notEqual(row.pass, true);
});

test('thresholds: an absent layer is "not measured" and does not fail the run', () => {
  // Extraction-only scorecard: sim + false-approve gates are simply absent.
  const extOnly = makeScorecard({
    ext: { extractionPrecision: 1, extractionRecall: 1, extractionF1: 1, extractionNumericWithinTolerance: 1 }
  });
  const r = evaluateThresholds(extOnly);
  assert.equal(r.ok, true);
  const simRow = r.results.find((x) => x.id === 'simFinancialDeterminable');
  assert.equal(simRow.present, false);
});

test('thresholds: every hard gate is set at-or-below a sane ceiling and uses a known op', () => {
  for (const t of THRESHOLDS) {
    assert.ok(['min', 'max'].includes(t.op), `${t.id} has bad op ${t.op}`);
    assert.ok(typeof t.value === 'number' && t.value >= 0 && t.value <= 1, `${t.id} value out of [0,1]`);
  }
  // The headline safety gate must exist and be max ≤ 0.
  const fa = THRESHOLDS.find((t) => t.id === 'falseApproveRate');
  assert.ok(fa && fa.gate === true && fa.op === 'max' && fa.value === 0);
});

// ---- THE LIVE GATE on the committed offline scorecard --------------------
// Loads the machine-readable scorecard that backs eval/REPORT.md and asserts
// the real committed numbers still clear every hard gate. Regenerated by
// the offline `node eval/run-eval.mjs … --report-json …` command. If that file
// is missing (fresh checkout that hasn't generated it yet), this is reported as
// a skip, not a false pass.
test('committed offline scorecard clears every hard regression gate', () => {
  const p = join(repoRoot, 'eval', 'results', 'offline-scorecard.json');
  if (!existsSync(p)) {
    console.log('    (skip) eval/results/offline-scorecard.json absent — run the offline eval with --report-json');
    return;
  }
  const sc = JSON.parse(readFileSync(p, 'utf8'));
  const r = evaluateThresholds(sc);
  const breaches = r.results
    .filter((x) => x.gate && x.present && x.pass === false)
    .map((x) => `${x.label}=${x.actual} (needs ${x.op === 'max' ? '<=' : '>='} ${x.value})`);
  assert.equal(r.ok, true, `committed scorecard breached gate(s): ${breaches.join('; ')}`);
  assert.ok(r.measuredGates >= 9, `expected >=9 measured gates, got ${r.measuredGates}`);
  // Sanity: the embedded thresholds block (written by the harness) agrees with
  // a fresh evaluation — the committed verdict is not stale/hand-edited.
  if (sc.thresholds) {
    assert.equal(sc.thresholds.ok, r.ok, 'embedded thresholds.ok disagrees with fresh evaluation');
    assert.equal(sc.thresholds.gatedFailures, r.gatedFailures, 'embedded gatedFailures disagrees');
  }
});

// ===========================================================================
// Done
// ===========================================================================
if (failures > 0) {
  console.error(`[eval-scoring-test] FAIL — ${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log('[eval-scoring-test] PASS');
}
