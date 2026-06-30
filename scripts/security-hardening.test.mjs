import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDealRecord, saveUserDeal } from '../dashboard/server/deal-service.ts'
import { runDocumentParser, sanitizeCsvCell } from '../dashboard/server/parser-service.ts'
import { RunManager } from '../dashboard/server/run-manager.ts'
import codexManifestPaths from './lib/codex-manifest-paths.js'
import safePaths from './lib/safe-paths.js'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const { resolveCodexRunArtifactPath, resolveRepoRelativePath } = codexManifestPaths

const insidePath = safePaths.assertWithinBase(projectRoot, join(projectRoot, 'data', 'status'), 'inside test')
assert.equal(insidePath, resolve(projectRoot, 'data', 'status'))
assert.throws(
  () => safePaths.assertWithinBase(join(projectRoot, 'data'), resolve(projectRoot, '..', 'outside.json'), 'escape test'),
  /escapes/,
)
assert.equal(safePaths.assertSafeSegment('parkview-2026-001', 'deal ID'), 'parkview-2026-001')
assert.throws(() => safePaths.assertSafeSegment('../parkview', 'deal ID'), /Invalid deal ID/)

const codexRunDir = join(projectRoot, 'data', 'codex-runs', 'safe-run')
assert.equal(
  resolveCodexRunArtifactPath(
    projectRoot,
    codexRunDir,
    'data/codex-runs/safe-run/underwriting/agent.md',
    'codex output path',
  ),
  join(codexRunDir, 'underwriting', 'agent.md'),
)
assert.throws(
  () => resolveRepoRelativePath(projectRoot, '/tmp/agent.md', 'absolute codex output path'),
  /absolute paths are not allowed/,
)
assert.throws(
  () =>
    resolveCodexRunArtifactPath(
      projectRoot,
      codexRunDir,
      'data/codex-runs/safe-run/../other-run/agent.md',
      'escaping codex output path',
    ),
  /must not contain "\.\." segments/,
)
assert.throws(
  () =>
    resolveCodexRunArtifactPath(
      projectRoot,
      codexRunDir,
      'data/status/parkview/agent.md',
      'wrong-root codex output path',
    ),
  /escapes/,
)

const runManager = new RunManager({
  projectRoot,
  dataRoot: join(projectRoot, 'data'),
  onEvent: () => {},
})
const unsafeDealResponse = runManager.start({
  runtimeProvider: 'codex',
  dealPath: resolve(projectRoot, '..', 'outside-deal.json'),
})
assert.equal(unsafeDealResponse.statusCode, 400)
assert.match(String(unsafeDealResponse.body.error), /Unsafe deal path/)

const unsafeSnapshotResponse = runManager.start({
  runtimeProvider: 'simulation',
  inputSnapshotPath: resolve(projectRoot, '..', 'outside-snapshot.json'),
})
assert.equal(unsafeSnapshotResponse.statusCode, 400)
assert.match(String(unsafeSnapshotResponse.body.error), /Unsafe input snapshot path/)

const unsafeDealRoot = mkdtempSync(join(tmpdir(), 'cre-deal-id-security-'))
try {
  const dataRoot = join(unsafeDealRoot, 'data')
  const statusDir = join(dataRoot, 'status')
  mkdirSync(join(unsafeDealRoot, 'config'), { recursive: true })
  mkdirSync(statusDir, { recursive: true })

  const outsideDeal = JSON.parse(readFileSync(join(projectRoot, 'config', 'deal.json'), 'utf8'))
  outsideDeal.dealId = 'outside-probe'
  writeFileSync(join(unsafeDealRoot, 'config', 'deal.json'), JSON.stringify(outsideDeal, null, 2))

  const dealContext = { dataRoot, projectRoot, statusDir }
  assert.equal(
    getDealRecord(dealContext, '../../config'),
    null,
    'deal lookup must not resolve deal.json outside data/deals',
  )
  assert.throws(
    () => saveUserDeal(dealContext, { deal: { ...outsideDeal, dealId: '../escaped' }, mode: 'draft' }),
    /Invalid deal ID/,
    'saving a deal must reject path-shaped ids before writing data/deals paths',
  )
  assert.throws(
    () => saveUserDeal(dealContext, {
      deal: { ...outsideDeal, dealId: 'safe-after-edit' },
      mode: 'draft',
      currentDealId: '../escaped-current',
    }),
    /Invalid current deal ID/,
    'renaming a deal must reject path-shaped current ids before building source directories',
  )
} finally {
  rmSync(unsafeDealRoot, { recursive: true, force: true })
}

assert.equal(sanitizeCsvCell('=HYPERLINK("http://example.com")'), '\'=HYPERLINK("http://example.com")')
assert.equal(sanitizeCsvCell('+SUM(A1:A2)'), "'+SUM(A1:A2)")
assert.equal(sanitizeCsvCell('-10'), "'-10")
assert.equal(sanitizeCsvCell('@cmd'), "'@cmd")

const tempRoot = mkdtempSync(join(tmpdir(), 'cre-security-test-'))
try {
  const csvPath = join(tempRoot, 'rent-roll.csv')
  writeFileSync(
    csvPath,
    [
      'Unit Type,Sq Ft,Market Rent,Current Rent,Status',
      '=HYPERLINK("http://bad.example"),700,1500,1450,Occupied',
      '1BR,690,-1550,1500,Occupied',
    ].join('\n'),
  )
  const preview = runDocumentParser({
    documentId: 'formula-rent-roll',
    fileName: 'rent-roll.csv',
    filePath: csvPath,
    mime: 'text/csv',
    type: 'rent_roll',
    projectRoot,
    allowedBasePath: tempRoot,
  })
  assert.equal(preview.status, 'extracted')
  const unitMix = preview.fields.find((field) => field.path === 'property.unitMix.types')?.value
  assert.ok(Array.isArray(unitMix))
  assert.equal(unitMix[0].type, "'=HYPERLINK(http://bad.example)")
  assert.equal(unitMix[1].marketRent, -1550)
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

const watcherSource = readFileSync(join(projectRoot, 'dashboard', 'server', 'watcher.ts'), 'utf8')
assert.match(watcherSource, /MAX_REQUEST_BODY_BYTES = 25 \* 1024 \* 1024/)
assert.match(watcherSource, /consumeDocumentRouteToken/)
assert.match(watcherSource, /ensureLoopbackRequest\(req, res\)/)
assert.match(watcherSource, /httpServer\.listen\(API_PORT, LOCAL_API_HOST/)
assert.match(watcherSource, /WebSocketServer\(\{[\s\S]*host: LOCAL_API_HOST/)
assert.doesNotMatch(watcherSource, /path: checkpointPath/)

console.log('[security-hardening-test] PASS')
