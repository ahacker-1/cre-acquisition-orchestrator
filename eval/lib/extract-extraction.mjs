// eval/lib/extract-extraction.mjs
//
// EXTRACTION-LAYER extractor. Runs the REAL document parser
// (dashboard/server/parser-service.ts) on each benchmark deal's source
// documents and emits one `systemAnswer` per deal for the extraction layer.
//
// Must run under tsx (it imports a .ts module). The eval runner spawns it once:
//   cd dashboard && npm exec tsx -- ../eval/lib/extract-extraction.mjs [dealsRoot]
//
// Output: a single JSON object printed between <<<EVAL_JSON>>> ... <<<END>>>
// markers, mapping dealId -> systemAnswer. Diagnostics go to stderr only, so the
// runner can parse stdout deterministically.
//
// HONESTY: extraction fields are namespaced "<source>::<path>" so a value
// extracted from the T12 is scored against the T12 ground truth and a value
// from the offering memo against the OM ground truth. Without this, a deal with
// a deliberate OM-vs-T12 NOI conflict would be mis-scored (last-write-wins on a
// bare path). The runner namespaces the ground truth identically.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDocumentParser } from '../../dashboard/server/parser-service.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

function mimeFor(file) {
  const ext = extname(file).toLowerCase()
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.csv') return 'text/csv'
  if (ext === '.md') return 'text/markdown'
  if (ext === '.txt') return 'text/plain'
  return 'application/octet-stream'
}

function listDealDirs(dealsRoot) {
  return readdirSync(dealsRoot)
    .map((name) => join(dealsRoot, name))
    .filter((p) => {
      try {
        return statSync(p).isDirectory() && existsSync(join(p, 'ground-truth.json'))
      } catch {
        return false
      }
    })
    .sort()
}

function extractDeal(dealDir) {
  const gt = JSON.parse(readFileSync(join(dealDir, 'ground-truth.json'), 'utf8'))
  const dealId = gt.dealId
  const fields = []
  const docNotes = []

  for (const doc of gt.documents || []) {
    const filePath = resolve(dealDir, doc.file)
    const source = doc.type // e.g. rent_roll | t12 | offering_memo
    if (!existsSync(filePath)) {
      docNotes.push(`missing document ${doc.file}`)
      continue
    }
    let preview
    try {
      preview = runDocumentParser({
        documentId: `${dealId}-${source}`,
        fileName: doc.file.split('/').pop(),
        filePath,
        mime: mimeFor(doc.file),
        type: source,
        projectRoot: repoRoot
      })
    } catch (err) {
      docNotes.push(`parser threw on ${doc.file}: ${String(err && err.message ? err.message : err)}`)
      continue
    }
    docNotes.push(`${doc.file}: status=${preview.status} parser=${preview.parserId} fields=${preview.fields.length}`)
    for (const f of preview.fields || []) {
      // Namespace by source so duplicate paths across documents stay distinct.
      fields.push({ path: `${source}::${f.path}`, value: f.value })
    }
  }

  return {
    dealId,
    layer: 'extraction',
    fields,
    metrics: {},
    flagTexts: [],
    verdict: 'UNKNOWN',
    partialFailure: null,
    notes: docNotes
  }
}

function main() {
  const dealsRoot = resolve(process.argv[2] || join(repoRoot, 'eval', 'benchmark', 'deals'))
  const result = {}
  for (const dir of listDealDirs(dealsRoot)) {
    try {
      const answer = extractDeal(dir)
      result[answer.dealId] = answer
    } catch (err) {
      process.stderr.write(`[extract-extraction] failed on ${dir}: ${String(err)}\n`)
    }
  }
  process.stdout.write(`<<<EVAL_JSON>>>${JSON.stringify(result)}<<<END>>>`)
}

main()
