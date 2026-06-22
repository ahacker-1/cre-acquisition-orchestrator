import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import Ajv from 'ajv'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataRoot = join(repoRoot, '.Codex', 'prod-local-seed-test')
const scriptPath = join(repoRoot, 'scripts', 'seed-production-local-data.js')
const generatedPrefix = 'QA-LOCAL-2026-'

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`Command failed: node ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  }
  return result
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function listFiles(dirPath, files = []) {
  if (!existsSync(dirPath)) return files
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) listFiles(fullPath, files)
    else if (entry.isFile()) files.push(fullPath)
  }
  return files
}

function assertNoSensitiveTokens(filePaths) {
  const forbidden = [
    /ahacker@/i,
    /theaiconsultingnetwork\.com/i,
    /Avi Hacker/i,
    /Jake Heller/i,
    /Krista/i,
    /Harrison/i,
    /Campbell/i,
    /sk-[A-Za-z0-9_-]{20,}/,
  ]
  for (const filePath of filePaths) {
    const text = readFileSync(filePath, 'utf8')
    const hit = forbidden.find((pattern) => pattern.test(text))
    assert.equal(hit, undefined, `${filePath} contains sensitive-looking token ${hit}`)
  }
}

if (existsSync(dataRoot)) rmSync(dataRoot, { recursive: true, force: true })

try {
  const first = runNode([scriptPath, '--count', '12', '--data-root', dataRoot, '--clean', '--quiet'])
  const summaryRel = first.stdout.trim().replace(/\\/g, '/')
  assert.equal(summaryRel, '.Codex/prod-local-seed-test/eval-runs/production-scale-local-data/latest.json')

  const summaryPath = join(repoRoot, summaryRel)
  const summary = readJson(summaryPath)
  assert.equal(summary.count, 12)
  assert.equal(summary.deals, 12)
  assert.equal(summary.documents, 36)
  assert.equal(summary.approvedFields, 72)
  assert.deepEqual(Object.keys(summary.statuses).sort(), ['COMPLETE', 'FAILED', 'PENDING', 'RUNNING'])
  assert.deepEqual(summary.validationErrors, [])

  const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true })
  const validateDeal = ajv.compile(readJson(join(repoRoot, 'config', 'deal-schema.json')))
  const firstDealId = `${generatedPrefix}0001`
  const lastDealId = `${generatedPrefix}0012`
  for (const dealId of [firstDealId, lastDealId]) {
    const dealRoot = join(dataRoot, 'deals', dealId)
    const deal = readJson(join(dealRoot, 'deal.json'))
    assert.equal(validateDeal(deal), true, JSON.stringify(validateDeal.errors, null, 2))
    const manifest = readJson(join(dealRoot, 'document-manifest.json'))
    assert.equal(manifest.documents.length, 3)
    assert.ok(manifest.documents.every((doc) => doc.status === 'applied'))
    assert.ok(manifest.documents.every((doc) => existsSync(doc.path)))
    const approved = readJson(join(dealRoot, 'approved-fields.json'))
    assert.equal(approved.fields.length, 6)
    assert.ok(approved.fields.every((field) => field.sourceRef?.fileHash))
    const status = readJson(join(dataRoot, 'status', `${dealId}.json`))
    assert.equal(status.inputSnapshot.sourceCoverage.missingApprovedFieldCount, 0)
  }

  const files = listFiles(dataRoot).filter((filePath) => /\.(json|csv|md)$/i.test(filePath))
  assertNoSensitiveTokens(files)

  const second = runNode([scriptPath, '--count', '12', '--data-root', dataRoot, '--clean', '--quiet'])
  assert.equal(second.stdout.trim().replace(/\\/g, '/'), summaryRel)
  const secondSummary = readJson(summaryPath)
  assert.equal(secondSummary.deals, 12)
  assert.ok(statSync(join(dataRoot, 'deals', firstDealId, 'deal.json')).size > 1000)

  console.log('production-local-data: 12 sanitized local deals generated, validated, and re-seeded')
} finally {
  if (existsSync(dataRoot)) rmSync(dataRoot, { recursive: true, force: true })
}
