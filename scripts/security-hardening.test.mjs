import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDealRecord, saveUserDeal } from '../dashboard/server/deal-service.ts'
import { runDocumentParser, sanitizeCsvCell } from '../dashboard/server/parser-service.ts'
import { RunManager } from '../dashboard/server/run-manager.ts'
import {
  MAX_DEAL_ARTIFACT_BYTES,
  parseDealArtifactRoute,
  readDealArtifact,
} from '../dashboard/server/artifact-service.ts'
import codexManifestPaths from './lib/codex-manifest-paths.js'
import runtimeCore from './lib/runtime-core.js'
import safePaths from './lib/safe-paths.js'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const { resolveCodexRunArtifactPath, resolveRepoRelativePath } = codexManifestPaths
const { readScenarioConfig } = runtimeCore

const insidePath = safePaths.assertWithinBase(projectRoot, join(projectRoot, 'data', 'status'), 'inside test')
assert.equal(insidePath, resolve(projectRoot, 'data', 'status'))
assert.throws(
  () => safePaths.assertWithinBase(join(projectRoot, 'data'), resolve(projectRoot, '..', 'outside.json'), 'escape test'),
  /escapes/,
)
assert.equal(safePaths.assertSafeSegment('parkview-2026-001', 'deal ID'), 'parkview-2026-001')
assert.throws(() => safePaths.assertSafeSegment('../parkview', 'deal ID'), /Invalid deal ID/)
assert.equal(readScenarioConfig(projectRoot, 'core-plus').name, 'core-plus')
assert.throws(
  () => readScenarioConfig(projectRoot, '../../package'),
  /Invalid scenario name/,
  'scenario names must not read JSON outside config/scenarios',
)

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

const unsafeScenarioResponse = runManager.start({
  runtimeProvider: 'simulation',
  scenario: '../../package',
})
assert.equal(unsafeScenarioResponse.statusCode, 400)
assert.match(String(unsafeScenarioResponse.body.error), /Invalid scenario name/)

const shutdownRoot = mkdtempSync(join(tmpdir(), 'cre-run-manager-shutdown-'))
let shutdownManager = null
try {
  mkdirSync(join(shutdownRoot, 'scripts'), { recursive: true })
  const stubbornGrandchildSource = [
    "require('node:fs').writeFileSync('grandchild-ready', String(process.pid))",
    "process.on('SIGTERM', () => {})",
    'setInterval(() => {}, 1000)',
  ].join('; ')
  writeFileSync(
    join(shutdownRoot, 'scripts', 'orchestrate.js'),
    [
      "const { spawn } = require('node:child_process')",
      "const { writeFileSync } = require('node:fs')",
      `const grandchild = spawn(process.execPath, ['-e', ${JSON.stringify(stubbornGrandchildSource)}], { stdio: 'ignore' })`,
      "writeFileSync('parent-ready', String(process.pid))",
      "writeFileSync('grandchild-pid', String(grandchild.pid))",
      "process.on('SIGTERM', () => {})",
      'setInterval(() => {}, 1000)',
      '',
    ].join('\n'),
  )
  shutdownManager = new RunManager({
    projectRoot: shutdownRoot,
    dataRoot: join(shutdownRoot, 'data'),
    onEvent: () => {},
  })
  const started = shutdownManager.start({ runtimeProvider: 'simulation', reset: false })
  assert.equal(started.statusCode, 202)
  const readyDeadline = Date.now() + 2_000
  while (
    (!existsSync(join(shutdownRoot, 'parent-ready')) || !existsSync(join(shutdownRoot, 'grandchild-ready'))) &&
    Date.now() < readyDeadline
  ) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 10))
  }
  assert.equal(existsSync(join(shutdownRoot, 'parent-ready')), true, 'workflow child must be ready for shutdown test')
  assert.equal(existsSync(join(shutdownRoot, 'grandchild-ready')), true, 'workflow grandchild must be ready for shutdown test')
  const parentPid = Number(readFileSync(join(shutdownRoot, 'parent-ready'), 'utf8'))
  const grandchildPid = Number(readFileSync(join(shutdownRoot, 'grandchild-pid'), 'utf8'))
  await shutdownManager.shutdown(100)
  const processExited = (pid) => {
    try {
      process.kill(pid, 0)
      return false
    } catch (error) {
      if (error?.code === 'ESRCH') return true
      throw error
    }
  }
  const exitDeadline = Date.now() + 1_000
  while ((!processExited(parentPid) || !processExited(grandchildPid)) && Date.now() < exitDeadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 10))
  }
  assert.equal(processExited(parentPid), true, 'shutdown terminates the SIGTERM-resistant workflow child')
  assert.equal(processExited(grandchildPid), true, 'shutdown terminates the SIGTERM-resistant workflow grandchild')
  assert.equal(shutdownManager.getStatus().active, false)
  assert.equal(shutdownManager.getStatus().state, 'STOPPED')
} finally {
  if (shutdownManager) await shutdownManager.shutdown(50)
  rmSync(shutdownRoot, { recursive: true, force: true })
}

const unsafeIngestRoot = mkdtempSync(join(tmpdir(), 'cre-ingest-security-'))
try {
  const dealPath = join(unsafeIngestRoot, 'deal.json')
  const incomingDir = join(unsafeIngestRoot, 'incoming')
  const outputDir = join(unsafeIngestRoot, 'normalized')
  mkdirSync(incomingDir, { recursive: true })
  writeFileSync(
    dealPath,
    JSON.stringify({
      dealId: '../escaped-ingest',
      property: { totalUnits: 12 },
      financials: { askingPrice: 1200000, inPlaceOccupancy: 0.91 },
    }, null, 2),
  )
  const result = spawnSync(process.execPath, [
    join(projectRoot, 'scripts', 'ingest-deal.js'),
    '--deal',
    dealPath,
    '--incoming',
    incomingDir,
    '--output-dir',
    outputDir,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0, 'ingest-deal must reject path-shaped deal IDs')
  assert.match(result.stderr, /Invalid deal ID/)
  assert.equal(
    existsSync(join(unsafeIngestRoot, 'escaped-ingest', 'deal-normalized.json')),
    false,
    'ingest-deal must not write normalized deals outside the selected output root',
  )
} finally {
  rmSync(unsafeIngestRoot, { recursive: true, force: true })
}

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

const artifactRoot = mkdtempSync(join(tmpdir(), 'cre-artifact-security-'))
try {
  const dealId = 'artifact-deal-a'
  const otherDealId = 'artifact-deal-b'
  const dealReportsDir = join(artifactRoot, 'data', 'reports', dealId, 'underwriting')
  const otherReportsDir = join(artifactRoot, 'data', 'reports', otherDealId)
  mkdirSync(dealReportsDir, { recursive: true })
  mkdirSync(otherReportsDir, { recursive: true })

  const reportPath = join(dealReportsDir, 'model-workpaper.md')
  writeFileSync(reportPath, '# Model workpaper\n\nSource-backed result.\n')
  const reportRelativePath = `data/reports/${dealId}/underwriting/model-workpaper.md`
  const artifactContext = { projectRoot: artifactRoot, dataRoot: join(artifactRoot, 'data') }
  const ok = readDealArtifact(artifactContext, dealId, reportRelativePath)
  assert.equal(ok.statusCode, 200, 'a scoped Markdown workpaper must be served')
  assert.equal(ok.headers?.['Content-Type'], 'text/markdown; charset=utf-8')
  assert.equal(ok.headers?.['X-Content-Type-Options'], 'nosniff')
  assert.match(ok.body?.toString('utf8') ?? '', /Source-backed result/)
  assert.deepEqual(
    parseDealArtifactRoute(`/api/deals/${dealId}/artifacts?path=${encodeURIComponent(reportRelativePath)}`),
    { dealId, path: reportRelativePath },
  )
  assert.equal(parseDealArtifactRoute(`/api/deals/${dealId}/artifacts`), null)
  assert.equal(
    parseDealArtifactRoute(`/api/deals/${dealId}/artifacts?path=a&path=b`),
    null,
    'duplicate artifact path parameters must be rejected',
  )

  const phaseOutputsDir = join(artifactRoot, 'data', 'phase-outputs', dealId, 'underwriting')
  mkdirSync(phaseOutputsDir, { recursive: true })
  writeFileSync(join(phaseOutputsDir, 'model.json'), '{"noi":1200000}\n')
  const phaseOutput = readDealArtifact(
    artifactContext,
    dealId,
    `data/phase-outputs/${dealId}/underwriting/model.json`,
  )
  assert.equal(phaseOutput.statusCode, 200, 'a scoped JSON phase output must be served')
  assert.equal(phaseOutput.headers?.['Content-Type'], 'application/json; charset=utf-8')

  writeFileSync(join(otherReportsDir, 'foreign.md'), '# Foreign deal')
  assert.equal(
    readDealArtifact(
      artifactContext,
      dealId,
      `data/reports/${otherDealId}/foreign.md`,
    ).statusCode,
    403,
    'a deal must not read another deal report',
  )
  assert.equal(
    readDealArtifact(artifactContext, dealId, join(artifactRoot, 'outside.md')).statusCode,
    400,
    'absolute artifact paths must be rejected',
  )
  assert.equal(
    readDealArtifact(artifactContext, dealId, `data/reports/${dealId}/../${otherDealId}/foreign.md`).statusCode,
    403,
    'dot-dot traversal must be rejected before resolution',
  )
  assert.equal(
    readDealArtifact(artifactContext, dealId, `data\\reports\\${dealId}\\underwriting\\model-workpaper.md`).statusCode,
    400,
    'backslash-shaped paths must be rejected',
  )
  assert.equal(
    readDealArtifact(artifactContext, dealId, `data/reports/${dealId}/underwriting/model\0.md`).statusCode,
    400,
    'NUL-containing paths must be rejected',
  )

  const nonReportPath = join(artifactRoot, 'data', 'deals', dealId, 'approved-fields.txt')
  mkdirSync(join(artifactRoot, 'data', 'deals', dealId), { recursive: true })
  writeFileSync(nonReportPath, 'not a phase output')
  assert.equal(
    readDealArtifact(
      artifactContext,
      dealId,
      `data/deals/${dealId}/approved-fields.txt`,
    ).statusCode,
    403,
    'the route must not expose deal workspace files outside reports',
  )

  const htmlPath = join(dealReportsDir, 'private.html')
  writeFileSync(htmlPath, '<script>alert(1)</script>')
  assert.equal(
    readDealArtifact(
      artifactContext,
      dealId,
      `data/reports/${dealId}/underwriting/private.html`,
    ).statusCode,
    415,
    'non-allowlisted extensions must not be served',
  )
  assert.equal(
    readDealArtifact(artifactContext, dealId, `data/reports/${dealId}/underwriting/missing.md`).statusCode,
    404,
    'missing artifacts must return not found',
  )
  const directoryWithTextExtension = join(dealReportsDir, 'folder.md')
  mkdirSync(directoryWithTextExtension)
  assert.equal(
    readDealArtifact(artifactContext, dealId, `data/reports/${dealId}/underwriting/folder.md`).statusCode,
    404,
    'directories must not be served',
  )

  const oversizedPath = join(dealReportsDir, 'oversized.md')
  writeFileSync(oversizedPath, Buffer.alloc(MAX_DEAL_ARTIFACT_BYTES + 1, 'x'))
  assert.equal(
    readDealArtifact(
      artifactContext,
      dealId,
      `data/reports/${dealId}/underwriting/oversized.md`,
    ).statusCode,
    413,
    'oversized text artifacts must be rejected before reading',
  )

  if (process.platform !== 'win32') {
    const outsideTextPath = join(artifactRoot, 'outside.txt')
    writeFileSync(outsideTextPath, 'outside report root')
    symlinkSync(outsideTextPath, join(dealReportsDir, 'linked.txt'))
    assert.equal(
      readDealArtifact(
        artifactContext,
        dealId,
        `data/reports/${dealId}/underwriting/linked.txt`,
      ).statusCode,
      403,
      'canonical containment must reject symlinks outside the deal report root',
    )
  }
} finally {
  rmSync(artifactRoot, { recursive: true, force: true })
}

const watcherSource = readFileSync(join(projectRoot, 'dashboard', 'server', 'watcher.ts'), 'utf8')
assert.match(watcherSource, /MAX_REQUEST_BODY_BYTES = 25 \* 1024 \* 1024/)
assert.match(watcherSource, /consumeDocumentRouteToken/)
assert.match(watcherSource, /ensureLoopbackRequest\(req, res\)/)
assert.match(watcherSource, /GET \/api\/deals\/:dealId\/artifacts[\s\S]{0,500}ensureLoopbackRequest\(req, res\)/)
assert.match(watcherSource, /res\.writeHead\(200, result\.headers\)/)
assert.match(watcherSource, /httpServer\.listen\(API_PORT, LOCAL_API_HOST/)
assert.match(watcherSource, /WebSocketServer\(\{[\s\S]*host: LOCAL_API_HOST/)
assert.doesNotMatch(watcherSource, /path: checkpointPath/)

console.log('[security-hardening-test] PASS')
