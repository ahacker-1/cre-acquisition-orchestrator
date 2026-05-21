// eval/lib/extract-sim.mjs
//
// DETERMINISTIC-SIMULATION extractor. Runs scripts/orchestrate.js on a deal and
// reads the structured phase-output JSON it writes, normalizing into a
// `systemAnswer` for the "sim" layer.
//
// IMPORTANT HONESTY FRAMING: the simulation is a FIXTURE, not reasoning. Its
// financial metrics are real arithmetic on deal.json inputs; its verdict and
// many of its flags are threshold/scenario-driven. The trust report labels this
// layer accordingly. We report its numbers exactly as produced.
//
// Subprocesses are spawned with spawnSync + an explicit argv array (no shell),
// so deal paths cannot inject commands.

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeVerdict } from './scoring.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

const ARCHETYPE_TO_SCENARIO = {
  'core-plus': 'core-plus',
  'value-add': 'value-add',
  distressed: 'distressed'
}

function readJsonIfExists(p) {
  try {
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function collectFlagTexts(phaseOutput) {
  const out = []
  if (!phaseOutput) return out
  for (const key of ['redFlags', 'dataGaps']) {
    for (const f of phaseOutput[key] || []) {
      const parts = [f.severity, f.category, f.message, f.impact].filter(Boolean)
      if (parts.length) out.push(parts.join(' | '))
    }
  }
  return out
}

// Runs the deterministic sim on one deal and returns { systemAnswer, meta }.
export function runSim(dealDir, deal, gt, opts = {}) {
  const dealId = deal.dealId
  const scenario = ARCHETYPE_TO_SCENARIO[gt.archetype] || 'core-plus'
  const runId = `eval-sim-${dealId}`
  const dealPath = join(dealDir, 'deal.json')

  // Clean any prior outputs for this deal so the run is fresh & deterministic.
  for (const dir of [
    join(repoRoot, 'data', 'phase-outputs', dealId),
    join(repoRoot, 'data', 'status', dealId)
  ]) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
  try {
    rmSync(join(repoRoot, 'data', 'status', `${dealId}.json`), { force: true })
  } catch {
    /* ignore */
  }

  const run = spawnSync(
    process.execPath,
    [
      'scripts/orchestrate.js',
      '--deal',
      dealPath,
      '--scenario',
      scenario,
      '--seed',
      '42',
      '--run-id',
      runId
    ],
    { cwd: repoRoot, encoding: 'utf8', timeout: opts.timeoutMs || 120000 }
  )

  const meta = {
    scenario,
    runId,
    exitCode: run.status,
    ok: run.status === 0,
    stderrTail: (run.stderr || '').split(/\r?\n/).filter(Boolean).slice(-5).join('\n')
  }

  const poDir = join(repoRoot, 'data', 'phase-outputs', dealId)
  const uw = readJsonIfExists(join(poDir, 'underwriting-output.json'))
  const dd = readJsonIfExists(join(poDir, 'due-diligence-output.json'))
  const fin = readJsonIfExists(join(poDir, 'financing-output.json'))
  const legal = readJsonIfExists(join(poDir, 'legal-output.json'))
  const closing = readJsonIfExists(join(poDir, 'closing-output.json'))

  const base = (uw && uw.baseCase) || {}
  const proForma0 = (uw && Array.isArray(uw.proForma) && uw.proForma[0]) || {}

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  const metrics = {
    noi: num(base.year1NOI),
    egi: num(proForma0.revenue),
    capRate: num(base.goingInCapRate),
    dscr: num(base.targetDSCR),
    irr: num(base.leveragedIRR),
    equityMultiple: num(base.equityMultiple)
  }

  const flagTexts = [
    ...collectFlagTexts(dd),
    ...collectFlagTexts(uw),
    ...collectFlagTexts(fin),
    ...collectFlagTexts(legal),
    ...collectFlagTexts(closing)
  ]

  // IC verdict for sim = the underwriting verdict (the IC-facing, computed
  // verdict that is the analog of the live ic-memo-writer output).
  const verdict = normalizeVerdict(uw && uw.verdict)

  const systemAnswer = {
    dealId,
    layer: 'sim',
    fields: [],
    metrics,
    flagTexts,
    verdict,
    partialFailure: meta.ok ? null : { failedAgents: ['orchestrate'], note: meta.stderrTail || `exit ${meta.exitCode}` }
  }

  return { systemAnswer, meta }
}
