// eval/lib/answer-stash.mjs
//
// VALIDITY-CRITICAL. The live Codex agents run with read-only access to the
// ENTIRE repository (codex exec --cd <repoRoot>). The benchmark answer keys live
// in the repo, so without intervention an agent can simply read the correct
// answers instead of reasoning — which was observed: a financial-model-builder
// workpaper cited "Benchmark ground truth expects roughly 11.24% IRR and 1.67x
// equity multiple". That makes the live number meaningless.
//
// Fix: temporarily MOVE every answer-bearing file/dir OUT of the repo tree (to
// an OS temp dir the agent's sandbox cannot reach) for the duration of the live
// run, then move them back. The deal inputs (deal.json + documents/) stay in
// place — those are what the agent is supposed to read.
//
// Crash safety: a manifest in the stash dir records original->stashed paths.
// run-eval.mjs calls restoreAnswerKeys() at startup, so a killed run is
// recovered on the next invocation. The files are also committed in git, so the
// canonical copies are never at risk.

import {
  renameSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  cpSync,
  readdirSync
} from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const STASH_ROOT = join(tmpdir(), 'cre-eval-answer-stash')
const MANIFEST = join(STASH_ROOT, 'manifest.json')

// Move that tolerates cross-volume (EXDEV) by falling back to copy+remove.
function safeMove(from, to) {
  try {
    renameSync(from, to)
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      cpSync(from, to, { recursive: true })
      rmSync(from, { recursive: true, force: true })
    } else {
      throw err
    }
  }
}

// All answer-bearing paths (absolute) that must be hidden from live agents.
// Deal inputs (deal.json, documents/) are deliberately NOT included.
export function answerKeyPaths(repoRoot) {
  const items = [
    join(repoRoot, 'EVAL-PLAN.md'), // design + per-deal expected verdicts/issues
    join(repoRoot, 'eval', 'README.md'), // deal table with expected IC verdicts
    join(repoRoot, 'eval', 'generators'), // generate_deals.py + README = full specs
    join(repoRoot, 'eval', 'results') // prior scorecards / trust reports
  ]
  const dealsRoot = join(repoRoot, 'eval', 'benchmark', 'deals')
  try {
    for (const name of readdirSync(dealsRoot)) {
      const gt = join(dealsRoot, name, 'ground-truth.json')
      if (existsSync(gt)) items.push(gt) // the precise answer key per deal
    }
  } catch {
    /* no deals dir */
  }
  return items
}

// Move the given absolute paths into the stash and write a manifest. Returns the
// number stashed. Call restoreAnswerKeys() (always, in a finally) to undo.
export function stashAnswerKeys(items) {
  mkdirSync(STASH_ROOT, { recursive: true })
  // If a prior stash is still present, restore it first so we never double-stash.
  if (existsSync(MANIFEST)) restoreAnswerKeys()
  const records = []
  let i = 0
  for (const original of items) {
    if (!existsSync(original)) continue
    const stashed = join(STASH_ROOT, `item-${i++}-${original.split(/[\\/]/).pop()}`)
    safeMove(original, stashed)
    records.push({ original, stashed })
  }
  writeFileSync(MANIFEST, JSON.stringify({ stashedAt: new Date().toISOString(), records }, null, 2))
  return records.length
}

// Restore everything recorded in the manifest back to its original path. Safe to
// call when nothing is stashed (no-op). Returns the number restored.
export function restoreAnswerKeys() {
  if (!existsSync(MANIFEST)) return 0
  let restored = 0
  let records = []
  try {
    records = JSON.parse(readFileSync(MANIFEST, 'utf8')).records || []
  } catch {
    records = []
  }
  for (const { original, stashed } of records) {
    if (!existsSync(stashed)) continue
    mkdirSync(dirname(original), { recursive: true })
    if (existsSync(original)) rmSync(original, { recursive: true, force: true })
    safeMove(stashed, original)
    restored++
  }
  try {
    rmSync(MANIFEST, { force: true })
  } catch {
    /* ignore */
  }
  return restored
}
