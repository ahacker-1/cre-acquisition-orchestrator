// Verifies the legal-document wiring in codex-agent-runner.js: a deal's uploaded
// legal documents (PSA / title / estoppel) and their source-backed extractions
// are surfaced to the LEGAL-phase Codex agents, and only to them.
//
// Run:
//   node scripts/codex-legal-docs.test.mjs

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const { legalDocumentRepoFiles, buildPrompt } = require('./codex-agent-runner.js')

const dealId = 'codex-legal-docs-test'
const dealRoot = resolve(projectRoot, 'data', 'deals', dealId)

const psaDocId = 'doc_psa_0001'
const loiDocId = 'doc_loi_0002'
const memoDocId = 'doc_memo_0003'

function setup() {
  mkdirSync(resolve(dealRoot, 'documents'), { recursive: true })
  mkdirSync(resolve(dealRoot, 'extractions'), { recursive: true })
  // PSA: binary-style source (pdf) -> only the extraction JSON should surface.
  // LOI: text source (.txt) -> both the extraction JSON and the source surface.
  // Offering memo: a non-legal type -> must NOT surface to legal agents.
  writeFileSync(resolve(dealRoot, 'document-manifest.json'), JSON.stringify({
    version: 1,
    dealId,
    documents: [
      { documentId: psaDocId, fileName: 'psa.pdf', type: 'psa', path: resolve(dealRoot, 'documents', 'psa.pdf') },
      { documentId: loiDocId, fileName: 'loi.txt', type: 'loi', path: resolve(dealRoot, 'documents', 'loi.txt') },
      { documentId: memoDocId, fileName: 'memo.md', type: 'offering_memo', path: resolve(dealRoot, 'documents', 'memo.md') },
    ],
  }))
  writeFileSync(resolve(dealRoot, 'documents', 'psa.pdf'), '%PDF-1.4 stub')
  writeFileSync(resolve(dealRoot, 'documents', 'loi.txt'), 'Letter of Intent stub')
  writeFileSync(resolve(dealRoot, 'documents', 'memo.md'), '# Offering Memo stub')
  writeFileSync(resolve(dealRoot, 'extractions', `${psaDocId}.json`), JSON.stringify({ fields: [] }))
  writeFileSync(resolve(dealRoot, 'extractions', `${loiDocId}.json`), JSON.stringify({ fields: [] }))
  writeFileSync(resolve(dealRoot, 'extractions', `${memoDocId}.json`), JSON.stringify({ fields: [] }))
}

function teardown() {
  rmSync(dealRoot, { recursive: true, force: true })
}

function makePrompt(phaseSlug) {
  return buildPrompt({
    task: {
      agentName: phaseSlug === 'legal' ? 'psa-reviewer' : 'financial-model-builder',
      agentMeta: { file: 'config/agent-registry.json' },
      phaseMeta: { slug: phaseSlug, label: phaseSlug },
      phasePromptPath: 'config/agent-registry.json',
    },
    deal: { dealId, dealName: 'Codex Legal Docs Test' },
    dealPath: resolve(projectRoot, 'config', 'deal.json'),
    inputSnapshotPath: null,
    inputSnapshot: null,
    registry: { skills: {}, agents: {} },
    scenarioName: 'core-plus',
    workflow: { id: 'legal-psa-review', name: 'Legal / PSA Review' },
    scenarioConfig: { assumptions: {} },
  })
}

const failures = []
function check(name, fn) {
  try {
    fn()
    console.log(`  PASS ${name}`)
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
    console.error(`  FAIL ${name}: ${error.message}`)
  }
}

setup()
try {
  check('legalDocumentRepoFiles returns legal extractions + text sources only', () => {
    const files = legalDocumentRepoFiles(dealId)
    assert.ok(files.includes(`data/deals/${dealId}/extractions/${psaDocId}.json`), 'PSA extraction should be included')
    assert.ok(files.includes(`data/deals/${dealId}/extractions/${loiDocId}.json`), 'LOI extraction should be included')
    assert.ok(files.includes(`data/deals/${dealId}/documents/loi.txt`), 'LOI text source should be included')
    assert.ok(!files.includes(`data/deals/${dealId}/documents/psa.pdf`), 'binary PDF source should NOT be included')
    assert.ok(!files.some((f) => f.includes(memoDocId)), 'non-legal offering_memo must NOT be included')
  })

  check('legal-phase prompt lists the legal documents + guidance', () => {
    const prompt = makePrompt('legal')
    assert.match(prompt, new RegExp(`data/deals/${dealId}/extractions/${psaDocId}\\.json`), 'legal prompt should list the PSA extraction')
    assert.match(prompt, /Legal source documents:.*included in the file list/, 'legal prompt should include the grounding note')
  })

  check('legalDocumentRepoFiles skips text source paths outside the repo', () => {
    const outsideRoot = mkdtempSync(join(tmpdir(), 'cre-codex-legal-outside-'))
    try {
      const outsidePath = join(outsideRoot, 'outside-loi.txt')
      const outsideDocId = 'doc_outside_loi_0004'
      writeFileSync(outsidePath, 'Outside LOI text must not enter prompt files')
      const manifestPath = resolve(dealRoot, 'document-manifest.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      manifest.documents.push({
        documentId: outsideDocId,
        fileName: 'outside-loi.txt',
        type: 'loi',
        path: outsidePath,
      })
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
      writeFileSync(resolve(dealRoot, 'extractions', `${outsideDocId}.json`), JSON.stringify({ fields: [] }))

      const files = legalDocumentRepoFiles(dealId)
      assert.ok(
        files.includes(`data/deals/${dealId}/extractions/${outsideDocId}.json`),
        'repo-contained extraction should still be included',
      )
      assert.ok(!files.some((filePath) => filePath.includes('..')), 'prompt file paths must not escape the repo')
      assert.ok(!files.some((filePath) => filePath.includes('outside-loi.txt')), 'outside text source must be skipped')
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true })
    }
  })

  check('non-legal phase prompt excludes the legal documents', () => {
    const prompt = makePrompt('underwriting')
    assert.ok(!prompt.includes(`data/deals/${dealId}/extractions/${psaDocId}.json`), 'underwriting prompt must NOT list the PSA extraction')
    assert.ok(!/Legal source documents:/.test(prompt), 'underwriting prompt must NOT include the legal-docs note')
  })

  check('legal-phase prompt with no documents flags a data gap', () => {
    const prompt = buildPrompt({
      task: {
        agentName: 'psa-reviewer',
        agentMeta: { file: 'config/agent-registry.json' },
        phaseMeta: { slug: 'legal', label: 'legal' },
        phasePromptPath: 'config/agent-registry.json',
      },
      deal: { dealId: 'codex-legal-docs-test-empty', dealName: 'No Docs' },
      dealPath: resolve(projectRoot, 'config', 'deal.json'),
      inputSnapshotPath: null,
      inputSnapshot: null,
      registry: { skills: {}, agents: {} },
      scenarioName: 'core-plus',
      workflow: { id: 'legal-psa-review', name: 'Legal / PSA Review' },
      scenarioConfig: { assumptions: {} },
    })
    assert.match(prompt, /Legal source documents: none uploaded/, 'should flag missing legal docs as a data gap')
  })
} finally {
  teardown()
}

if (failures.length > 0) {
  console.error(`\n[codex-legal-docs-test] FAIL — ${failures.length} issue(s).`)
  process.exit(1)
}
console.log('\n[codex-legal-docs-test] PASS — legal documents scoped to legal-phase Codex agents.')
