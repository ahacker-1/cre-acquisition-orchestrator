import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDocumentParser, sanitizeCsvCell } from '../dashboard/server/parser-service.ts'
import safePaths from './lib/safe-paths.js'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

const insidePath = safePaths.assertWithinBase(projectRoot, join(projectRoot, 'data', 'status'), 'inside test')
assert.equal(insidePath, resolve(projectRoot, 'data', 'status'))
assert.throws(
  () => safePaths.assertWithinBase(join(projectRoot, 'data'), resolve(projectRoot, '..', 'outside.json'), 'escape test'),
  /escapes/,
)
assert.equal(safePaths.assertSafeSegment('parkview-2026-001', 'deal ID'), 'parkview-2026-001')
assert.throws(() => safePaths.assertSafeSegment('../parkview', 'deal ID'), /Invalid deal ID/)

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
