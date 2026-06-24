#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createWorker } from 'tesseract.js'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const isWindows = process.platform === 'win32'
const renderScript = join(projectRoot, 'scripts', 'render_pdf_pages.py')
const MIN_OCR_CONFIDENCE = 35
const tesseractCachePath = join(tmpdir(), 'cre-acquisition-orchestrator-tesseract-cache')

function parseArgs(argv) {
  const args = argv.slice(2)
  const filePath = args[0]
  let documentType = 'auto'
  const typeIndex = args.indexOf('--type')
  if (typeIndex >= 0 && args[typeIndex + 1]) documentType = args[typeIndex + 1]
  return { filePath, documentType }
}

function pythonCandidates() {
  const candidates = []
  candidates.push(isWindows
    ? { command: join(projectRoot, '.venv', 'Scripts', 'python.exe'), args: [] }
    : { command: join(projectRoot, '.venv', 'bin', 'python'), args: [] })
  if (isWindows) {
    candidates.push(
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
      { command: 'python3', args: [] },
    )
  } else {
    candidates.push(
      { command: 'python3', args: [] },
      { command: 'python', args: [] },
    )
  }
  return candidates
}

export function renderPdfFailureMessage({ runnableErrors = [], missingInterpreters = [] } = {}) {
  const firstRunnableError = runnableErrors.find((message) => typeof message === 'string' && message.trim().length > 0)
  if (firstRunnableError) return firstRunnableError
  if (missingInterpreters.length > 0) return 'No Python interpreter could render the PDF for OCR.'
  return 'No Python interpreter could render the PDF for OCR.'
}

export function renderPdfCandidateError({ stdout = '', stderr = '', status = 'unknown' } = {}) {
  const trimmedStdout = String(stdout || '').trim()
  if (trimmedStdout) {
    try {
      const parsed = JSON.parse(trimmedStdout)
      if (parsed && typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
        return parsed.error.trim()
      }
    } catch {
      // Fall through to the combined output below.
    }
  }
  const combined = `${stdout || ''}\n${stderr || ''}`.trim()
  return combined || `exit ${status ?? 'unknown'}`
}

function renderPdf(filePath, outputDir) {
  const runnableErrors = []
  const missingInterpreters = []
  for (const candidate of pythonCandidates()) {
    const result = spawnSync(candidate.command, [...candidate.args, renderScript, filePath, outputDir], {
      cwd: projectRoot,
      encoding: 'utf8',
    })
    const combined = `${result.stdout || ''}\n${result.stderr || ''}`.trim()
    if (result.error) {
      if (result.error.code === 'ENOENT') {
        missingInterpreters.push(result.error.message)
        continue
      }
      runnableErrors.push(result.error.message)
      continue
    }
    if (!result.error && result.status === 0) {
      try {
        const parsed = JSON.parse(result.stdout || '{}')
        if (parsed.success === true && Array.isArray(parsed.images)) return parsed
        runnableErrors.push(parsed.error || 'PDF render script returned no images.')
      } catch {
        runnableErrors.push(combined || 'PDF render script returned invalid JSON.')
      }
      continue
    }
    runnableErrors.push(renderPdfCandidateError({
      stdout: result.stdout,
      stderr: result.stderr,
      status: result.status ?? 'unknown',
    }))
  }
  throw new Error(renderPdfFailureMessage({ runnableErrors, missingInterpreters }))
}

function numberValue(raw) {
  const cleaned = String(raw || '').replace(/[$,]/g, '').trim()
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Number.isInteger(value) ? value : value
}

function field(path, label, value, confidence, page, raw, unit) {
  const result = {
    path,
    label,
    value,
    valueType: Number.isInteger(value) ? 'integer' : typeof value,
    confidence,
    page,
    raw: String(raw || '').trim(),
  }
  if (unit) result.unit = unit
  return result
}

function extractFieldsFromText(pages) {
  const fields = []
  const seen = new Set()
  const matchers = [
    {
      path: 'financials.askingPrice',
      label: 'Asking Price',
      regex: /(?:offering price|asking price)[:\s#*$]+([\d,]+)/i,
      confidence: 0.78,
      unit: 'usd',
      transform: (match) => numberValue(match[1]),
    },
    {
      path: 'property.totalUnits',
      label: 'Total Units',
      regex: /(?:total units[:\s|]*?|\b)(\d{1,5})\s*[- ]?units?\b/i,
      confidence: 0.74,
      unit: 'count',
      transform: (match) => numberValue(match[1]),
    },
    {
      path: 'financials.inPlaceOccupancy',
      label: 'In-Place Occupancy',
      regex: /(\d{1,3}(?:\.\d+)?)\s*%\s*occupancy/i,
      confidence: 0.7,
      unit: 'decimal',
      transform: (match) => Math.round((Number(match[1]) / 100) * 10000) / 10000,
    },
    {
      path: 'financials.currentNOI',
      label: 'Current NOI',
      regex: /(?:net operating income|noi)[:\s*$]+([\d,]+)/i,
      confidence: 0.7,
      unit: 'usd',
      transform: (match) => numberValue(match[1]),
    },
  ]

  for (const page of pages) {
    for (const matcher of matchers) {
      if (seen.has(matcher.path)) continue
      const match = matcher.regex.exec(page.text)
      if (!match) continue
      const value = matcher.transform(match)
      if (value === null || value === undefined || Number.isNaN(value)) continue
      seen.add(matcher.path)
      fields.push(field(
        matcher.path,
        matcher.label,
        value,
        matcher.confidence,
        page.page,
        match[0],
        matcher.unit,
      ))
    }
  }
  return fields
}

async function ocrImages(images) {
  const worker = await createWorker('eng', 1, { cachePath: tesseractCachePath })
  const pages = []
  try {
    for (const image of images) {
      const result = await worker.recognize(image.path)
      pages.push({
        page: Number(image.page) || pages.length + 1,
        text: result.data.text || '',
        confidence: typeof result.data.confidence === 'number' ? result.data.confidence : null,
        width: image.width,
        height: image.height,
      })
    }
  } finally {
    await worker.terminate()
  }
  return pages
}

async function main() {
  const { filePath, documentType } = parseArgs(process.argv)
  if (!filePath) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node ocr_pdf.mjs <file_path> [--type type]' }))
    process.exit(1)
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'cre-ocr-'))
  try {
    const rendered = renderPdf(filePath, tempDir)
    const pages = await ocrImages(rendered.images)
    const totalTextChars = pages.reduce((sum, page) => sum + page.text.trim().length, 0)
    const confidences = pages
      .map((page) => page.confidence)
      .filter((value) => typeof value === 'number' && Number.isFinite(value))
    const averageConfidence = confidences.length
      ? Math.round((confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 10) / 10
      : null
    const fields = averageConfidence !== null && averageConfidence < MIN_OCR_CONFIDENCE
      ? []
      : extractFieldsFromText(pages)

    const warnings = []
    if (averageConfidence !== null && averageConfidence < MIN_OCR_CONFIDENCE) {
      warnings.push(`OCR confidence ${averageConfidence}% is below the ${MIN_OCR_CONFIDENCE}% extraction threshold; review OCR text before applying fields.`)
    }
    if (fields.length === 0) {
      warnings.push('OCR completed, but no supported headline fields were found.')
    }

    console.log(JSON.stringify({
      success: true,
      needsOcr: false,
      status: fields.length > 0 ? 'extracted' : 'unsupported',
      source: { file: basename(filePath), type: documentType },
      provenance: {
        pageCount: rendered.pageCount,
        ocrTextChars: totalTextChars,
        ocrEngine: 'tesseract.js',
        averageConfidence,
        pages,
      },
      warnings,
      fields,
    }, null, 2))
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }))
    process.exit(1)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
