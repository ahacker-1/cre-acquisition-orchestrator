// eval/lib/extract-live.mjs
//
// LIVE-AGENT extractor — THE NUMBER THAT COUNTS. Runs the real Codex agents
// (scripts/codex-agent-runner.js) on a deal and parses their free-text Markdown
// workpapers into a `systemAnswer` for the "live" layer.
//
// HONESTY-CRITICAL DESIGN:
//   1. Before the run we DELETE any pre-existing data/phase-outputs/<dealId> and
//      data/status/<dealId> so the agents reason from the deal inputs + repo
//      ONLY. The agent prompt opportunistically reads those runtime files if
//      present; leaving stale simulation JSON there would let an agent copy
//      computed numbers instead of reasoning. We want real reasoning measured.
//   2. Financial figures are read conservatively from the markdown (see
//      markdown-parse.mjs). A figure not clearly stated is null (no credit).
//   3. Failed agents are recorded as partialFailure and NEVER counted as a
//      detected flag.
//
// Subprocess spawned with spawnSync + explicit argv (no shell).

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFinancials, parseFlagTexts, parseVerdict } from './markdown-parse.mjs'
import { normalizeVerdict } from './scoring.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

const ARCHETYPE_TO_SCENARIO = {
  'core-plus': 'core-plus',
  'value-add': 'value-add',
  distressed: 'distressed'
}

function readIfExists(p) {
  try {
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  } catch {
    return null
  }
}

function readJsonIfExists(p) {
  const raw = readIfExists(p)
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Merge metrics, preferring the first non-null value across workpapers in
// priority order (financial-model-builder is authoritative for financials).
function mergeMetrics(primary, ...fallbacks) {
  const keys = ['noi', 'egi', 'capRate', 'dscr', 'irr', 'equityMultiple']
  const out = {}
  for (const k of keys) {
    let v = primary && primary[k] != null ? primary[k] : null
    if (v == null) {
      for (const fb of fallbacks) {
        if (fb && fb[k] != null) {
          v = fb[k]
          break
        }
      }
    }
    out[k] = v
  }
  return out
}

// Runs the live Codex agents on one deal and returns { systemAnswer, meta }.
export function runLive(dealDir, deal, gt, opts = {}) {
  const dealId = deal.dealId
  const scenario = ARCHETYPE_TO_SCENARIO[gt.archetype] || 'core-plus'
  const workflow = opts.workflow || 'quick-deal-screen'
  const concurrency = String(opts.concurrency || 3)
  const runId = opts.runId || `eval-live-${dealId}`
  const dealPath = join(dealDir, 'deal.json')

  // 1. Clean prior runtime outputs so agents reason from inputs only. The agent
  //    prompt opportunistically reads exactly these computed artifacts; clearing
  //    them forces the agent to reason from the deal inputs, not from a prior
  //    simulation/live run's numbers:
  //      - data/status/<id>.json          (master checkpoint FILE)
  //      - data/phase-outputs/<id>/*       (computed phase outputs)
  //      - data/reports/<id>/final-report.md (computed report)
  //    We deliberately do NOT delete the data/status/<id>/ DIRECTORY: the prompt
  //    never reads its contents (only run-scoped logs live there), and the live
  //    runner's StoryEngine writes its run logs into it — deleting it out from
  //    under the StoryEngine caused an ENOENT mid-run. We also clear the
  //    run-scoped codex-runs/<runId> dir so this run starts fresh.
  for (const p of [
    join(repoRoot, 'data', 'phase-outputs', dealId),
    join(repoRoot, 'data', 'reports', dealId),
    join(repoRoot, 'data', 'normalized', dealId),
    join(repoRoot, 'data', 'logs', dealId), // sim writes master.log with the full scenario result
    join(repoRoot, 'data', 'deals', dealId),
    join(repoRoot, 'data', 'runs', dealId),
    join(repoRoot, 'data', 'codex-runs', runId)
  ]) {
    try {
      rmSync(p, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  }
  try {
    rmSync(join(repoRoot, 'data', 'status', `${dealId}.json`), { force: true })
  } catch {
    /* ignore */
  }
  // Also scrub sim/prior-run artifacts INSIDE data/status/<dealId>/ — the agent
  // checkpoints (agents/*.json, incl. scenario-analyst's 27-scenario verdict)
  // and run logs (run-*.json/ndjson). A live agent that read these would parrot
  // the deterministic sim's harsh fixture verdict instead of reasoning. Keep the
  // dir itself: the live runner's StoryEngine writes its own run logs there
  // (deleting the dir root caused an ENOENT mid-run).
  const statusDealDir = join(repoRoot, 'data', 'status', dealId)
  try {
    rmSync(join(statusDealDir, 'agents'), { recursive: true, force: true })
  } catch {
    /* best-effort */
  }
  try {
    if (existsSync(statusDealDir)) {
      for (const f of readdirSync(statusDealDir)) {
        if (/^run-.*\.(json|ndjson)$/.test(f)) {
          rmSync(join(statusDealDir, f), { force: true })
        }
      }
    }
  } catch {
    /* best-effort */
  }

  // 2. Run the live agents.
  const args = [
    'scripts/codex-agent-runner.js',
    '--deal',
    dealPath,
    '--workflow',
    workflow,
    '--scenario',
    scenario,
    '--run-id',
    runId,
    '--concurrency',
    concurrency
  ]
  if (opts.model) args.push('--model', opts.model)

  const run = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: opts.timeoutMs || 1800000,
    maxBuffer: 64 * 1024 * 1024
  })

  // 3. Parse the completed run directory into a system answer.
  return parseLiveRunDir({
    runDir: join(repoRoot, 'data', 'codex-runs', runId),
    dealId,
    scenario,
    workflow,
    runId,
    model: opts.model || null,
    runExitCode: run.status,
    runStderr: run.stderr || ''
  })
}

// Pure-ish parser of a COMPLETED live run directory (manifest + per-agent
// workpapers) into { systemAnswer, meta }. Reads files only — no Codex. Used by
// runLive() after the agents finish AND by reparseLive() to re-score saved
// workpapers without re-running Codex (cheap iteration when tuning parsers).
export function parseLiveRunDir({
  runDir,
  dealId,
  scenario = null,
  workflow = null,
  runId = null,
  model = null,
  runExitCode = 0,
  runStderr = ''
}) {
  const manifest = readJsonIfExists(join(runDir, 'manifest.json')) || {}
  const results = Array.isArray(manifest.results) ? manifest.results : []
  const failedAgents = Array.isArray(manifest.failedAgents) ? manifest.failedAgents : []

  const workpaperByAgent = {}
  for (const r of results) {
    if (!r || !r.agentName) continue
    // outputPath in the manifest is repo-relative.
    const outPath = r.outputPath ? join(repoRoot, r.outputPath) : null
    const md = outPath ? readIfExists(outPath) : null
    workpaperByAgent[r.agentName] = { status: r.status, markdown: md }
  }

  const wp = (name) => (workpaperByAgent[name] && workpaperByAgent[name].markdown) || ''

  // Financials — financial-model-builder is authoritative for the underwriting
  // metrics (NOI, cap rate, DSCR, IRR, equity multiple). EGI is the operating-
  // statement (T12) figure that the opex-analyst states authoritatively and the
  // underwriting workpapers typically omit, so include opex-analyst as a lower-
  // priority source. mergeMetrics only fills a key the higher-priority workpapers
  // left null, so this recovers EGI without overriding any UW-authoritative metric.
  const fmb = parseFinancials(wp('financial-model-builder'))
  const icm = parseFinancials(wp('ic-memo-writer'))
  const sca = parseFinancials(wp('scenario-analyst'))
  const opex = parseFinancials(wp('opex-analyst'))
  const metrics = mergeMetrics(fmb, icm, sca, opex)

  // Flag texts — every PASSing workpaper contributes (DD agents catch
  // occupancy/environmental/concentration; UW agents catch DSCR/leverage).
  const flagTexts = []
  for (const r of results) {
    if (!r || r.status !== 'PASS') continue
    flagTexts.push(...parseFlagTexts(wp(r.agentName)))
  }

  // IC verdict — ic-memo-writer is authoritative. If it didn't run, UNKNOWN.
  const icVerdict = normalizeVerdict(parseVerdict(wp('ic-memo-writer')))

  // Partial-failure accounting. A run that exited non-zero with NO results is a
  // hard runner failure; failed individual agents are listed honestly.
  const failedNames = failedAgents.map((f) => f && f.agentName).filter(Boolean)
  const hardRunnerFail = runExitCode !== 0 && results.length === 0
  const partialFailure =
    failedNames.length > 0 || runExitCode !== 0
      ? {
          failedAgents: failedNames.length ? failedNames : ['runner'],
          note: failedNames.length
            ? `agents failed: ${failedNames.join(', ')}`
            : hardRunnerFail
              ? `runner exit ${runExitCode} (0 agents ran)`
              : `runner exit ${runExitCode}`
        }
      : null

  const meta = {
    runId: runId || manifest.runId || null,
    scenario,
    workflow,
    exitCode: runExitCode,
    ok: runExitCode === 0,
    runStatus: manifest.status || null,
    runOutcome: manifest.runOutcome || null,
    codexVersion: manifest.codexVersion || null,
    codexLoginStatus: manifest.codexLoginStatus || null,
    startedAt: manifest.startedAt || null,
    completedAt: manifest.completedAt || null,
    model: model || manifest.model || null,
    agentCount: results.length,
    passCount: results.filter((r) => r && r.status === 'PASS').length,
    failedAgents: failedNames,
    stderrTail: String(runStderr || '')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-8)
      .join('\n')
  }

  const systemAnswer = {
    dealId,
    layer: 'live',
    fields: [],
    metrics,
    flagTexts,
    verdict: icVerdict,
    partialFailure
  }

  return { systemAnswer, meta }
}

// Re-score a previously-completed live run for one deal WITHOUT re-running
// Codex. runId is the run-scoped id used during the live run
// (e.g. `${baseRunId}-${dealId}`). Reads only saved artifacts.
export function reparseLive(dealId, runId, opts = {}) {
  const runDir = join(repoRoot, 'data', 'codex-runs', runId)
  const manifest = readJsonIfExists(join(runDir, 'manifest.json'))
  // Treat a missing/incomplete manifest as a hard failure (exit 1, no results).
  const runExitCode = manifest && manifest.status === 'COMPLETE' ? 0 : manifest ? 0 : 1
  return parseLiveRunDir({
    runDir,
    dealId,
    scenario: opts.scenario || null,
    workflow: opts.workflow || (manifest && manifest.workflowId) || null,
    runId,
    model: opts.model || null,
    runExitCode,
    runStderr: ''
  })
}
