#!/usr/bin/env node
// eval/run-eval.mjs
//
// The one command: `npm run eval`. Scores the synthetic benchmark against the
// committed ground truth across three honestly-separable layers and emits a
// schema-valid scorecard (eval/results/scorecard.json) plus a human-readable
// trust report (eval/results/TRUST-REPORT.md).
//
//   --mode  all | extraction | sim | live   (default: all)
//   --deals <id,id,...>                      (default: every benchmark deal)
//   --run-id <id>
//   --workflow <id>                          (live; default quick-deal-screen)
//   --concurrency <n>                        (live; default 3)
//   --model <name>                           (live; optional, recorded)
//   --no-update-results                      write only raw gitignored run artifacts
//
// Honesty: a failed layer/agent is reported, never hidden. The scorecard is
// validated against eval/schemas/scorecard.schema.json before it is written; if
// it does not validate, the run fails loudly rather than emitting junk.

import { spawnSync } from 'node:child_process'
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  statSync,
  mkdirSync,
  rmSync
} from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { scoreDeal, aggregate } from './lib/scoring.mjs'
import { runSim } from './lib/extract-sim.mjs'
import { runLive, reparseLive } from './lib/extract-live.mjs'
import { buildTrustReport } from './lib/trust-report.mjs'
import { stashAnswerKeys, restoreAnswerKeys, answerKeyPaths } from './lib/answer-stash.mjs'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const dealsRoot = join(repoRoot, 'eval', 'benchmark', 'deals')
const resultsDir = join(repoRoot, 'eval', 'results')
const EVAL_VERSION = '1.0.0'

// ---- args ------------------------------------------------------------------
function parseArgs(argv) {
  const get = (flag, def) => {
    const i = argv.indexOf(flag)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def
  }
  const mode = get('--mode', 'all')
  return {
    mode,
    deals: get('--deals', null),
    runId: get('--run-id', `eval-${new Date().toISOString().replace(/[:.]/g, '-')}`),
    workflow: get('--workflow', 'quick-deal-screen'),
    concurrency: Number(get('--concurrency', '3')),
    model: get('--model', null),
    updateResults: !argv.includes('--no-update-results'),
    // For --mode reparse: the base run-id whose saved Codex workpapers to
    // re-score (live runId per deal is `<reparseRun>-<dealId>`). Lets us re-run
    // scoring after tuning parsers WITHOUT re-invoking Codex.
    reparseRun: get('--reparse-run', null)
  }
}

// ---- deal loading ----------------------------------------------------------
function loadDeals(filterCsv) {
  const filter = filterCsv ? new Set(filterCsv.split(',').map((s) => s.trim())) : null
  const deals = []
  for (const name of readdirSync(dealsRoot).sort()) {
    const dir = join(dealsRoot, name)
    if (!statSync(dir).isDirectory()) continue
    const gtPath = join(dir, 'ground-truth.json')
    const dealPath = join(dir, 'deal.json')
    if (!existsSync(gtPath) || !existsSync(dealPath)) continue
    const gt = JSON.parse(readFileSync(gtPath, 'utf8'))
    const deal = JSON.parse(readFileSync(dealPath, 'utf8'))
    if (filter && !filter.has(gt.dealId)) continue
    deals.push({ dir, deal, gt, dealId: gt.dealId })
  }
  return deals
}

// ---- extraction layer (single tsx subprocess) ------------------------------
function runExtractionLayer(deals) {
  const extractor = join(repoRoot, 'eval', 'lib', 'extract-extraction.mjs')
  // tsx lives in dashboard/node_modules; invoke via `npm exec` from there. On
  // Windows the npm shim is a .cmd, so we run through the shell. All arguments
  // are internal constants (no user input), quoted to tolerate spaces in paths.
  const cmd = `npm exec tsx -- "${extractor}" "${dealsRoot}"`
  const proc = spawnSync(cmd, {
    cwd: join(repoRoot, 'dashboard'),
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 64 * 1024 * 1024,
    shell: true
  })
  const stdout = proc.stdout || ''
  const m = stdout.match(/<<<EVAL_JSON>>>([\s\S]*?)<<<END>>>/)
  if (!m) {
    process.stderr.write(
      `[eval] extraction extractor produced no JSON. exit=${proc.status}\n${(proc.stderr || '').slice(-2000)}\n`
    )
    return { cards: [], ok: false }
  }
  const byDeal = JSON.parse(m[1])
  const cards = []
  for (const { gt, dealId } of deals) {
    const sys = byDeal[dealId]
    // Namespace ground-truth extraction fields by source to match the
    // namespaced system fields ("<source>::<path>"). This keeps OM-vs-T12
    // conflicts honestly separated.
    const nsGt = {
      ...gt,
      extraction: {
        fields: ((gt.extraction && gt.extraction.fields) || []).map((f) => ({
          ...f,
          path: `${f.source}::${f.path}`
        }))
      }
    }
    const answer = sys || { dealId, layer: 'extraction', fields: [], partialFailure: { failedAgents: ['extractor'], note: 'no extractor output' } }
    cards.push(scoreDeal(nsGt, answer))
  }
  return { cards, ok: true }
}

// ---- main ------------------------------------------------------------------
function main() {
  // Crash recovery: if a previous live run was killed mid-stash, the answer
  // keys are sitting in the OS temp stash — put them back before doing anything.
  const recovered = restoreAnswerKeys()
  if (recovered > 0) console.log(`[eval] recovered ${recovered} answer-key path(s) from a prior interrupted run`)

  const args = parseArgs(process.argv.slice(2))
  // Modes: `all` = every layer (incl. live Codex); `offline` = the no-API layers
  // (extraction + sim); or a single layer; or a comma-separated subset
  // (e.g. `--mode extraction,sim`).
  const KNOWN_MODES = ['extraction', 'sim', 'live']
  const runModes =
    args.mode === 'all'
      ? ['extraction', 'sim', 'live']
      : args.mode === 'offline'
        ? ['extraction', 'sim']
        : args.mode
            .split(',')
            .map((m) => m.trim())
            .filter((m) => m.length > 0)
  const unknownModes = runModes.filter((m) => !KNOWN_MODES.includes(m) && m !== 'reparse')
  if (runModes.length === 0 || unknownModes.length > 0) {
    process.stderr.write(
      `[eval] invalid --mode "${args.mode}". Use: all | offline | extraction | sim | live | reparse (or a comma-separated subset).\n`,
    )
    process.exit(1)
  }
  const deals = loadDeals(args.deals)
  if (deals.length === 0) {
    process.stderr.write('[eval] no benchmark deals found/selected.\n')
    process.exit(1)
  }

  const runDir = join(repoRoot, 'data', 'eval-runs', args.runId)
  mkdirSync(runDir, { recursive: true })

  const layers = { extraction: null, simulation: null, live: null }
  const allDeals = []
  const notes = []
  let model = args.model
  let codexVersion = null
  const liveMetas = []

  console.log(`[eval] run ${args.runId} | modes: ${runModes.join(', ')} | deals: ${deals.length}`)

  if (runModes.includes('extraction')) {
    console.log('[eval] === extraction layer (deterministic parser) ===')
    const { cards } = runExtractionLayer(deals)
    layers.extraction = { ...aggregate(cards), deals: cards }
    allDeals.push(...cards)
    for (const c of cards) {
      const p = c.extraction
      console.log(`  ${c.dealId}: P=${fmt(p && p.precision)} R=${fmt(p && p.recall)} F1=${fmt(p && p.f1)} numTol=${fmt(p && p.numericWithinTolerance)}`)
    }
  }

  if (runModes.includes('sim')) {
    console.log('[eval] === simulation layer (FIXTURE baseline — not reasoning) ===')
    const cards = []
    for (const d of deals) {
      const { systemAnswer, meta } = runSim(d.dir, d.deal, d.gt)
      writeFileSync(join(runDir, `sim-${d.dealId}.json`), JSON.stringify({ systemAnswer, meta }, null, 2))
      const card = scoreDeal(d.gt, systemAnswer)
      cards.push(card)
      console.log(`  ${d.dealId}: verdict ${card.verdict.actual} (exp ${card.verdict.expected}) detFin=${fmt(card.financials.determinable.ratio)} rfRecall=${fmt(card.redFlags.recall)} ${meta.ok ? '' : '[SIM FAILED]'}`)
    }
    layers.simulation = { ...aggregate(cards), deals: cards }
    allDeals.push(...cards)
  }

  if (runModes.includes('live') || runModes.includes('reparse')) {
    // Reparse (no Codex) when explicitly in reparse mode OR when a --reparse-run
    // is supplied alongside any mode (lets `--mode all --reparse-run X` produce a
    // complete scorecard: extraction + sim fresh, live re-scored from saved run X).
    const reparse = runModes.includes('reparse') || !!args.reparseRun
    const baseRunId = args.reparseRun || args.runId
    console.log(
      reparse
        ? `[eval] === live layer (RE-PARSE saved workpapers from run "${baseRunId}", no Codex) ===`
        : '[eval] === live layer (REAL Codex reasoning — the headline) ==='
    )
    const cards = []
    // VALIDITY: hide every answer-bearing file from the live agents (which have
    // read-only access to the whole repo) for the duration of the run. Ground
    // truth is already loaded into memory above, so scoring is unaffected.
    if (!reparse) {
      const hidden = stashAnswerKeys(answerKeyPaths(repoRoot))
      console.log(`[eval] hid ${hidden} answer-key path(s) from the live agents for the duration of the run`)
      // Remove THIS eval's OWN prior artifacts so the live agents can't read a
      // previous run's verdicts/sim numbers (the per-deal cleanup in
      // extract-live already scrubs this deal's data/logs|status|phase-outputs|
      // reports). Scoped strictly to this eval's outputs — data/eval-runs/* and
      // the per-deal data/codex-runs/<run>-<dealId> dirs — so nothing unrelated
      // (e.g. a user's own codex-smoke run) is ever touched.
      const selectedIds = new Set(deals.map((d) => d.dealId))
      try {
        const evalRunsRoot = join(repoRoot, 'data', 'eval-runs')
        for (const name of readdirSync(evalRunsRoot)) {
          if (name === args.runId) continue
          rmSync(join(evalRunsRoot, name), { recursive: true, force: true })
        }
      } catch {
        /* nothing to clear */
      }
      try {
        const codexRunsRoot = join(repoRoot, 'data', 'codex-runs')
        for (const name of readdirSync(codexRunsRoot)) {
          if (name.startsWith(`${args.runId}-`)) continue
          // Only this eval's per-deal runs, named "<someRunId>-<benchmarkDealId>".
          if ([...selectedIds].some((id) => name.endsWith(`-${id}`))) {
            rmSync(join(codexRunsRoot, name), { recursive: true, force: true })
          }
        }
      } catch {
        /* nothing to clear */
      }
      console.log('[eval] cleared this eval\'s prior run artifacts (eval-runs + per-deal codex-runs) from agent reach')
    }
    try {
      for (const d of deals) {
      // When reparsing, only include deals that actually have a saved live run —
      // a deal we never ran live is "not measured", NOT a failure, so we omit it
      // from the live layer rather than scoring it as UNKNOWN/partial.
      if (reparse && !existsSync(join(repoRoot, 'data', 'codex-runs', `${baseRunId}-${d.dealId}`, 'manifest.json'))) {
        console.log(`  ${d.dealId}: no saved live run — omitted from live layer`)
        continue
      }
      const scenario = { 'core-plus': 'core-plus', 'value-add': 'value-add', distressed: 'distressed' }[d.gt.archetype]
      const { systemAnswer, meta } = reparse
        ? reparseLive(d.dealId, `${baseRunId}-${d.dealId}`, { scenario, workflow: args.workflow })
        : runLive(d.dir, d.deal, d.gt, {
            workflow: args.workflow,
            concurrency: args.concurrency,
            model: args.model,
            // Run-scoped so concurrent/sequential runs never collide on the
            // data/codex-runs/<runId> directory.
            runId: `${args.runId}-${d.dealId}`
          })
      liveMetas.push({ dealId: d.dealId, ...meta })
      writeFileSync(join(runDir, `live-${d.dealId}.json`), JSON.stringify({ systemAnswer, meta }, null, 2))
      if (!codexVersion && meta.codexVersion) codexVersion = meta.codexVersion
      if (!model && meta.model) model = meta.model
      const card = scoreDeal(d.gt, systemAnswer)
      cards.push(card)
      const pf = card.partialFailure ? ` [partial: ${card.partialFailure.failedAgents.join(',')}]` : ''
      console.log(`  ${d.dealId}: verdict ${card.verdict.actual} (exp ${card.verdict.expected}) detFin=${fmt(card.financials.determinable.ratio)} rfRecall=${fmt(card.redFlags.recall)} dbRecall=${fmt(card.dealbreakers.recall)}${pf}`)
      }
    } finally {
      if (!reparse) {
        const restored = restoreAnswerKeys()
        console.log(`[eval] restored ${restored} answer-key path(s)`)
      }
    }
    layers.live = { ...aggregate(cards), deals: cards }
    allDeals.push(...cards)
    writeFileSync(join(runDir, 'live-metas.json'), JSON.stringify(liveMetas, null, 2))
    if (liveMetas.length) {
      notes.push(`Live path: Codex ${codexVersion || 'unknown'} (${liveMetas[0].codexLoginStatus || 'login unknown'}); workflow ${args.workflow}; runs ${liveMetas[0].startedAt || '?'} .. ${liveMetas[liveMetas.length - 1].completedAt || '?'}.`)
    }
  }

  const scorecard = {
    generatedAt: new Date().toISOString(),
    runId: args.runId,
    model: model || null,
    codexVersion: codexVersion || null,
    evalVersion: EVAL_VERSION,
    layers,
    deals: allDeals,
    notes
  }

  // Validate before writing — the harness must emit schema-valid output.
  const Ajv = require('ajv')
  const addFormats = require('ajv-formats')
  const ajv = new Ajv({ allErrors: true, strict: false })
  addFormats(ajv)
  const schema = JSON.parse(readFileSync(join(repoRoot, 'eval', 'schemas', 'scorecard.schema.json'), 'utf8'))
  const validate = ajv.compile(schema)
  const valid = validate(scorecard)

  // Always write the raw scorecard to the (gitignored) run dir for debugging.
  writeFileSync(join(runDir, 'scorecard.json'), JSON.stringify(scorecard, null, 2))

  if (!valid) {
    process.stderr.write('[eval] SCORECARD FAILED SCHEMA VALIDATION:\n')
    process.stderr.write(JSON.stringify(validate.errors, null, 2) + '\n')
    process.exit(1)
  }

  console.log('[eval] scorecard schema-valid ✓')
  if (args.updateResults) {
    // Commit-quality artifacts.
    mkdirSync(resultsDir, { recursive: true })
    writeFileSync(join(resultsDir, 'scorecard.json'), JSON.stringify(scorecard, null, 2))
    const report = buildTrustReport(scorecard)
    writeFileSync(join(resultsDir, 'TRUST-REPORT.md'), report)
    console.log(`[eval] wrote eval/results/scorecard.json + eval/results/TRUST-REPORT.md`)
  } else {
    console.log('[eval] skipped eval/results update (--no-update-results)')
  }
  console.log(`[eval] raw run artifacts in data/eval-runs/${args.runId}/ (gitignored)`)
}

function fmt(x) {
  if (x === null || x === undefined) return 'N/A'
  if (typeof x !== 'number') return String(x)
  return (x * 100).toFixed(0) + '%'
}

main()
