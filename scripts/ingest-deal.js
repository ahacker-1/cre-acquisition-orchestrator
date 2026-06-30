#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { assertSafeSegment } = require('./lib/safe-paths');

const BASE_DIR = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  function getArg(flag, fallback = null) {
    const index = args.indexOf(flag);
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
  }
  return {
    dealConfigPath: path.resolve(BASE_DIR, getArg('--deal', 'config/deal.json')),
    incomingDir: path.resolve(BASE_DIR, getArg('--incoming', 'documents/incoming')),
    outputDir: path.resolve(BASE_DIR, getArg('--output-dir', 'data/normalized')),
    dealId: getArg('--deal-id', null)
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function repoRelative(filePath) {
  return path.relative(BASE_DIR, filePath).replace(/\\/g, '/');
}

function printVerifiedPath(label, filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} was not created: ${filePath}`);
  }
  console.log(`${label}: ${repoRelative(filePath)}`);
}

function classifyDocument(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.includes('rent') && lower.includes('roll')) return 'rent_roll';
  if (lower.includes('t12') || lower.includes('financial')) return 't12';
  if (lower.includes('offering') || lower.includes('memo') || lower.endsWith('.md')) return 'offering_memo';
  if (lower.includes('title')) return 'title';
  if (lower.includes('survey')) return 'survey';
  if (lower.includes('psa') || lower.includes('purchase')) return 'psa';
  return 'other';
}

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { rows: 0, columns: [], sample: [] };
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => line.split(',').map((cell) => cell.trim()));
  return {
    rows: rows.length,
    columns: headers,
    sample: rows.slice(0, 3)
  };
}

function parseOfferingMemo(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const result = {
    extracted: {},
    length: raw.length
  };
  const patterns = [
    { key: 'askingPrice', regex: /asking price[:\s]+\$?([\d,]+)/i },
    { key: 'units', regex: /(\d+)\s+units?/i },
    { key: 'occupancy', regex: /occupancy[:\s]+(\d{1,3}(?:\.\d+)?)%/i },
    { key: 'noi', regex: /noi[:\s]+\$?([\d,]+)/i },
    { key: 'capRate', regex: /cap rate[:\s]+(\d{1,2}(?:\.\d+)?)%/i }
  ];
  patterns.forEach((pattern) => {
    const match = raw.match(pattern.regex);
    if (match) result.extracted[pattern.key] = match[1];
  });
  return result;
}

function ingestDocuments(incomingDir) {
  if (!fs.existsSync(incomingDir)) {
    return {
      files: [],
      byType: {}
    };
  }
  const allFiles = fs
    .readdirSync(incomingDir)
    .map((name) => path.join(incomingDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile());

  const byType = {};
  const files = [];

  allFiles.forEach((filePath) => {
    const fileName = path.basename(filePath);
    const type = classifyDocument(fileName);
    if (!byType[type]) byType[type] = [];
    byType[type].push(filePath);
    files.push({ fileName, filePath, type });
  });

  return { files, byType };
}

function buildNormalizedDeal(baseDeal, ingestionResult) {
  const normalized = JSON.parse(JSON.stringify(baseDeal));
  const extraction = {
    documentCounts: {},
    extractedMetrics: {},
    notes: []
  };

  Object.entries(ingestionResult.byType).forEach(([type, paths]) => {
    extraction.documentCounts[type] = paths.length;
  });

  const rentRollFile = ingestionResult.byType.rent_roll?.[0];
  if (rentRollFile && fs.existsSync(rentRollFile)) {
    const parsed = parseCsv(rentRollFile);
    extraction.extractedMetrics.rentRoll = parsed;
    extraction.notes.push(`Parsed rent roll with ${parsed.rows} rows`);
    if (parsed.rows > 0 && !normalized.property?.totalUnits) {
      normalized.property = normalized.property || {};
      normalized.property.totalUnits = parsed.rows;
    }
  }

  const t12File = ingestionResult.byType.t12?.[0];
  if (t12File && fs.existsSync(t12File)) {
    const parsed = parseCsv(t12File);
    extraction.extractedMetrics.t12 = parsed;
    extraction.notes.push(`Parsed T12 with ${parsed.rows} rows`);
  }

  const memoFile = ingestionResult.byType.offering_memo?.[0];
  if (memoFile && fs.existsSync(memoFile)) {
    const memo = parseOfferingMemo(memoFile);
    extraction.extractedMetrics.offeringMemo = memo;
    if (memo.extracted.askingPrice && !normalized.financials?.askingPrice) {
      normalized.financials = normalized.financials || {};
      normalized.financials.askingPrice = Number(String(memo.extracted.askingPrice).replace(/,/g, ''));
    }
    if (memo.extracted.units && !normalized.property?.totalUnits) {
      normalized.property = normalized.property || {};
      normalized.property.totalUnits = Number(memo.extracted.units);
    }
    if (memo.extracted.occupancy && normalized.financials) {
      normalized.financials.inPlaceOccupancy =
        normalized.financials.inPlaceOccupancy || Number(memo.extracted.occupancy) / 100;
    }
    extraction.notes.push('Parsed offering memo for key metrics');
  }

  normalized.ingestion = {
    ingestedAt: new Date().toISOString(),
    sourceDirectory: ingestionResult.files.length > 0 ? path.dirname(ingestionResult.files[0].filePath) : '',
    fileCount: ingestionResult.files.length,
    extraction
  };

  return { normalized, extraction };
}

function validateMinimumDealShape(deal) {
  const missing = [];
  if (!deal.dealId) missing.push('dealId');
  if (!deal.property || !deal.property.totalUnits) missing.push('property.totalUnits');
  if (!deal.financials || !deal.financials.askingPrice) missing.push('financials.askingPrice');
  if (!deal.financials || deal.financials.inPlaceOccupancy == null) missing.push('financials.inPlaceOccupancy');
  if (missing.length > 0) {
    throw new Error(`Normalized deal missing required fields: ${missing.join(', ')}`);
  }
}

function main() {
  const args = parseArgs();
  const baseDeal = readJson(args.dealConfigPath);
  if (!baseDeal.dealId && !args.dealId) {
    throw new Error('Deal config must include dealId or pass --deal-id');
  }
  if (args.dealId) baseDeal.dealId = args.dealId;
  baseDeal.dealId = assertSafeSegment(baseDeal.dealId, 'deal ID');

  const incomingRoot = fs.existsSync(path.join(args.incomingDir, baseDeal.dealId))
    ? path.join(args.incomingDir, baseDeal.dealId)
    : args.incomingDir;
  const ingestionResult = ingestDocuments(incomingRoot);
  const { normalized, extraction } = buildNormalizedDeal(baseDeal, ingestionResult);
  validateMinimumDealShape(normalized);

  const normalizedDealId = assertSafeSegment(normalized.dealId, 'normalized deal ID');
  const dealDir = path.join(args.outputDir, normalizedDealId);
  ensureDir(dealDir);
  const normalizedPath = path.join(dealDir, 'deal-normalized.json');
  fs.writeFileSync(normalizedPath, JSON.stringify(normalized, null, 2));

  const reportPath = path.join(dealDir, 'ingestion-report.md');
  const lines = [];
  lines.push(`# Ingestion Report - ${normalized.dealId}`);
  lines.push('');
  lines.push(`- Input Directory: ${incomingRoot}`);
  lines.push(`- Files Processed: ${ingestionResult.files.length}`);
  lines.push(`- Normalized Output: ${normalizedPath}`);
  lines.push('');
  lines.push('## File Classification');
  if (ingestionResult.files.length === 0) lines.push('- No files found');
  ingestionResult.files.forEach((file) => {
    lines.push(`- ${file.fileName} -> ${file.type}`);
  });
  lines.push('');
  lines.push('## Extraction Notes');
  if (extraction.notes.length === 0) lines.push('- No extraction notes');
  extraction.notes.forEach((note) => lines.push(`- ${note}`));
  lines.push('');
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);

  printVerifiedPath('Normalized deal written', normalizedPath);
  printVerifiedPath('Ingestion report written', reportPath);
}

try {
  main();
} catch (error) {
  console.error(`ingest-deal.js failed: ${error.message}`);
  process.exit(1);
}
