// Automated smoke test for the adversarial "real-world pile".
//
// Proves the document-ingestion BOUNDARY is bulletproof against the messy mix a
// real operator drops in: valid-but-messy rent rolls / T12s / offering memos
// alongside junk (a .docx, an image, a scanned PDF, a .zip, an empty file, a
// 35 MB file, a mislabeled binary, a corrupt workbook, and a name/content
// mismatch). The bar (DoD-B / DoD-D of docs/USABILITY-GOAL.md):
//   - every file returns a typed status — never throws past the parser boundary
//   - parseable files are `extracted` with >=1 field; unparseable/irrelevant
//     files degrade gracefully (`unsupported` / `parse_failed` / needs-OCR)
//   - ZERO crashes, ZERO hangs (>15s), ZERO silent-empty `extracted`
//   - no surfaced error/notes string leaks a local filesystem path or interpreter
//
// Run from dashboard/ (so the TypeScript parser-service imports under tsx), the
// same way the eval harness runs:
//   cd dashboard && npm exec tsx -- ../scripts/real-world-pile.test.mjs

import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const pileDir = join(repoRoot, 'fixtures', 'real-world-pile')

const { runDocumentParser } = await import(
  pathToFileURL(resolve(repoRoot, 'dashboard', 'server', 'parser-service.ts')).href
)

const MIME_BY_EXT = {
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.zip': 'application/zip',
}
const mimeFor = (fileName) => MIME_BY_EXT[extname(fileName).toLowerCase()] || 'application/octet-stream'

// Expected per-file outcome. `type` is the document type the real drop flow
// assigns (content-aware classification for the name/content-mismatch file is
// verified separately in scripts/workspace-service.test.mjs). `status` is the
// REQUIRED graceful outcome — every value here is a typed parser status, never a
// crash.
const EXPECTATIONS = {
  'rent-roll.xlsx': { type: 'rent_roll', status: 'extracted', minFields: 1 },
  't12.xlsx': { type: 't12', status: 'extracted', minFields: 1 },
  'offering-memo.pdf': { type: 'offering_memo', status: 'extracted', minFields: 1 },
  // Name/content mismatch: named like a rent roll, content is a rent roll → extracts.
  't12-but-actually-rentroll.csv': { type: 'rent_roll', status: 'extracted', minFields: 1 },
  // Scanned / image-only → graceful needs-OCR (degrade, don't crash).
  'scanned-rent-roll.pdf': { type: 'rent_roll', status: 'unsupported', minFields: 0 },
  // Irrelevant / unparseable junk → graceful unsupported, never a crash.
  'deal-summary.docx': { type: 'other', status: 'unsupported', minFields: 0 },
  'rent-roll-photo.png': { type: 'rent_roll', status: 'unsupported', minFields: 0 },
  'property-brochure.pdf': { type: 'other', status: 'unsupported', minFields: 0 },
  'deal-docs.zip': { type: 'other', status: 'unsupported', minFields: 0 },
  'empty.csv': { type: 'other', status: 'unsupported', minFields: 0 },
  'not-really.csv': { type: 'other', status: 'unsupported', minFields: 0 },
  // 35 MB file → caught by the size cap, graceful parse_failed (no heap blowup / hang).
  'huge-rent-roll.csv': { type: 'rent_roll', status: 'parse_failed', minFields: 0 },
  // Corrupt workbook → parse_failed (the FILE is bad), NOT parser-unavailable.
  'corrupt.xlsx': { type: 'other', status: 'parse_failed', minFields: 0 },
  // Operator-named "operating statement" whose content is a rent roll: the real
  // upload path classifies by content (P5) → rent_roll → extracts.
  'operating-statement.csv': { type: 'rent_roll', status: 'extracted', minFields: 1 },
}

// A surfaced error/notes string must never leak a local path or interpreter.
const PATH_LEAK = /[A-Za-z]:\\|\\\\[A-Za-z0-9._-]+\\|\/(?:home|Users|root)\/|python[0-9.]*\.exe|\bpy(?:thon)?3?\.exe\b/i

// The oversized-CSV fixture is generated at test time, not committed (a ~35 MB
// file does not belong in git). Any file past the parser's 25 MB cap exercises
// the same byte-size guard.
function ensureOversizedCsv(filePath) {
  if (existsSync(filePath) && statSync(filePath).size > 26 * 1024 * 1024) return
  const header = 'Unit,Unit Type,SqFt,Market Rent,Current Rent,Status\n'
  const row = '101,1BR/1BA,720,1650,1575,Occupied\n'
  const target = 27 * 1024 * 1024
  const parts = [header]
  for (let size = header.length; size < target; size += row.length) parts.push(row)
  writeFileSync(filePath, parts.join(''))
}
ensureOversizedCsv(join(pileDir, 'huge-rent-roll.csv'))

const failures = []
const summary = []

const pileFiles = readdirSync(pileDir)
  .filter((name) => name.toLowerCase() !== 'readme.md')
  .sort()

// The expectations map and the fixture dir must stay in lockstep.
for (const fileName of pileFiles) {
  if (!EXPECTATIONS[fileName]) failures.push(`Unmapped fixture in pile (add to EXPECTATIONS): ${fileName}`)
}
for (const fileName of Object.keys(EXPECTATIONS)) {
  if (!pileFiles.includes(fileName)) failures.push(`Expected fixture missing from pile: ${fileName}`)
}

for (const fileName of pileFiles) {
  const expected = EXPECTATIONS[fileName]
  if (!expected) continue
  const filePath = join(pileDir, fileName)
  const input = {
    documentId: `pile_${fileName.replace(/[^a-z0-9]/gi, '_')}`,
    fileName,
    filePath,
    mime: mimeFor(fileName),
    type: expected.type,
    projectRoot: repoRoot,
    allowedBasePath: repoRoot,
  }

  const started = Date.now()
  let preview
  try {
    preview = runDocumentParser(input)
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    failures.push(`${fileName}: THREW past parser boundary — ${msg}`)
    continue
  }
  const elapsed = Date.now() - started

  // Invariant: no hang.
  if (elapsed > 15000) failures.push(`${fileName}: took ${elapsed}ms (> 15s) — possible hang`)

  // Invariant: typed status.
  const VALID = ['extracted', 'extraction-pending', 'parse_failed', 'parser-unavailable', 'unsupported']
  if (!VALID.includes(preview.status)) {
    failures.push(`${fileName}: untyped/invalid status "${preview.status}"`)
  }

  // Invariant: required graceful outcome.
  if (preview.status !== expected.status) {
    failures.push(`${fileName}: status "${preview.status}" != expected "${expected.status}"`)
  }

  // Invariant: extracted ⇒ has fields (no silent-empty success).
  const fieldCount = Array.isArray(preview.fields) ? preview.fields.length : 0
  if (preview.status === 'extracted' && fieldCount < Math.max(1, expected.minFields)) {
    failures.push(`${fileName}: status=extracted but only ${fieldCount} field(s) — silent failure`)
  }

  // Invariant: no path/interpreter leakage in surfaced strings.
  const surfaced = `${preview.error || ''} ${(preview.notes || []).join(' ')}`
  if (PATH_LEAK.test(surfaced)) {
    failures.push(`${fileName}: surfaced string leaks a local path/interpreter: "${surfaced.slice(0, 120)}"`)
  }

  summary.push(`  ${fileName.padEnd(30)} ${String(preview.status).padEnd(20)} ${fieldCount} field(s)  ${elapsed}ms`)
}

console.log('[real-world-pile-test] per-file outcomes:')
console.log(summary.join('\n'))

if (failures.length > 0) {
  console.error(`\n[real-world-pile-test] FAIL — ${failures.length} issue(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`\n[real-world-pile-test] PASS — ${pileFiles.length} files, zero crashes/hangs/silent-failures/path-leaks.`)
