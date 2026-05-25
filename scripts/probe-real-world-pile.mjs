// Probe the REAL document parser against the adversarial "real-world pile".
//
// Run the same way the eval harness runs (from dashboard/, via tsx so the
// TypeScript parser-service imports cleanly):
//   cd dashboard && npm exec tsx -- ../scripts/probe-real-world-pile.mjs
//
// For each file in fixtures/real-world-pile/, calls runDocumentParser with a
// ParserInput mirroring workspace-service.ts (filename-only type guess, mime by
// extension), wraps the call in try/catch, and TIMES it. Prints a results table
// plus flags for anything that threw, hung (>15s), or silently produced an
// empty 'extracted' result.

import { readdirSync, statSync } from 'node:fs'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const pileDir = join(repoRoot, 'fixtures', 'real-world-pile')

const { runDocumentParser } = await import(
  pathToFileURL(resolve(repoRoot, 'dashboard', 'server', 'parser-service.ts')).href
)

// Mirror workspace-service.ts::classifyDocument (filename-only).
function classifyDocument(fileName) {
  const lower = fileName.toLowerCase()
  if (lower.includes('rent') && lower.includes('roll')) return 'rent_roll'
  if (lower.includes('t12') || lower.includes('operating') || lower.includes('financial')) return 't12'
  if (lower.includes('offering') || lower.includes('memo') || lower.includes('-om') || lower.endsWith('.md')) return 'offering_memo'
  if (lower.includes('inspection') || lower.includes('pca')) return 'inspection_report'
  if (lower.includes('environmental') || lower.includes('phase-i') || lower.includes('phase 1') || lower.includes('esa')) return 'environmental'
  if (lower.includes('title')) return 'title'
  if (lower.includes('survey')) return 'survey'
  if (lower.includes('loi') || lower.includes('letter-of-intent') || lower.includes('letter of intent')) return 'loi'
  if (lower.includes('psa') || lower.includes('purchase')) return 'psa'
  if (lower.includes('insurance')) return 'insurance'
  if (lower.includes('loan') || lower.includes('debt')) return 'loan_documents'
  if (lower.includes('closing') || lower.includes('settlement')) return 'closing_statement'
  return 'other'
}

const MIME_BY_EXT = {
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.zip': 'application/zip',
}

function mimeFor(fileName) {
  return MIME_BY_EXT[extname(fileName).toLowerCase()] || 'application/octet-stream'
}

const files = readdirSync(pileDir)
  .filter((name) => name.toLowerCase() !== 'readme.md')
  .sort()

const rows = []
for (const fileName of files) {
  const filePath = join(pileDir, fileName)
  const sizeMb = (statSync(filePath).size / 1024 / 1024).toFixed(2)
  const type = classifyDocument(fileName)
  const input = {
    documentId: `probe_${fileName.replace(/[^a-z0-9]/gi, '_')}`,
    fileName,
    filePath,
    mime: mimeFor(fileName),
    type,
    projectRoot: repoRoot,
    allowedBasePath: repoRoot,
  }

  const started = Date.now()
  let status = ''
  let fieldCount = 0
  let threw = ''
  let notes = ''
  try {
    const preview = runDocumentParser(input)
    status = preview.status
    fieldCount = Array.isArray(preview.fields) ? preview.fields.length : 0
    const note0 = (preview.notes && preview.notes[0]) || ''
    const errPart = preview.error ? ` err=${preview.error}` : ''
    notes = `${note0}${errPart}`.slice(0, 90)
  } catch (err) {
    threw = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  }
  const elapsed = Date.now() - started

  rows.push({ fileName, sizeMb, type, status, fieldCount, elapsed, threw, notes })
}

// --- Render table ---------------------------------------------------------
const header = ['file', 'MB', 'guessedType', 'status', '#flds', 'ms', 'THREW', 'notes']
const data = rows.map((r) => [
  r.fileName,
  r.sizeMb,
  r.type,
  r.threw ? '—' : r.status,
  r.threw ? '—' : String(r.fieldCount),
  String(r.elapsed),
  r.threw ? 'YES' : 'no',
  r.threw ? r.threw.slice(0, 70) : r.notes,
])
const all = [header, ...data]
const widths = header.map((_, c) => Math.max(...all.map((row) => String(row[c]).length)))
const fmt = (row) => row.map((cell, c) => String(cell).padEnd(widths[c])).join('  ')
console.log('\n=== REAL-WORLD PILE PROBE RESULTS ===\n')
console.log(fmt(header))
console.log(widths.map((w) => '-'.repeat(w)).join('  '))
for (const row of data) console.log(fmt(row))

// --- Flags ----------------------------------------------------------------
console.log('\n=== FLAGS ===')
let flagged = 0
for (const r of rows) {
  const issues = []
  if (r.threw) issues.push(`THREW past parser boundary: ${r.threw}`)
  if (r.elapsed > 15000) issues.push(`SLOW/HANG: ${r.elapsed}ms (> 15s timeout)`)
  if (!r.threw && r.status === 'extracted' && r.fieldCount === 0) {
    issues.push('SILENT FAILURE: status=extracted but 0 fields')
  }
  if (issues.length > 0) {
    flagged += 1
    console.log(`- ${r.fileName}: ${issues.join(' | ')}`)
  }
}
if (flagged === 0) console.log('(no files threw, hung >15s, or returned silent-empty extracted)')
console.log(`\n${rows.length} files probed, ${flagged} flagged.\n`)
