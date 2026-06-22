#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Ajv = require('ajv');

const BASE_DIR = path.resolve(__dirname, '..');
const DEFAULT_DATA_ROOT = path.join(BASE_DIR, 'data');
const GENERATED_PREFIX = 'QA-LOCAL-2026-';
const DEFAULT_COUNT = 150;
const SUMMARY_DIR = path.join('eval-runs', 'production-scale-local-data');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    count: DEFAULT_COUNT,
    dataRoot: DEFAULT_DATA_ROOT,
    clean: false,
    quiet: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--count') {
      options.count = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--data-root') {
      options.dataRoot = path.resolve(argv[index + 1] || '');
      index += 1;
    } else if (arg === '--clean') {
      options.clean = true;
    } else if (arg === '--quiet') {
      options.quiet = true;
    } else if (arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 500) {
    throw new Error('--count must be an integer from 1 to 500');
  }

  const relative = path.relative(BASE_DIR, options.dataRoot);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('--data-root must stay inside this repository for local-only QA seeding');
  }

  return options;
}

function usage() {
  return [
    'Usage: npm run seed:prod-local -- [--count 150] [--clean] [--quiet]',
    '',
    'Builds sanitized production-scale local runtime data under data/ using the',
    `${GENERATED_PREFIX}* namespace. No production or sensitive data is read.`,
    '',
    'Options:',
    '  --count N       Number of synthetic deals to upsert (1-500, default 150)',
    '  --data-root P   Local data root inside this repository (default data/)',
    '  --clean         Remove prior generated QA-LOCAL records before writing',
    '  --quiet         Print only the final JSON summary path',
  ].join('\n');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function asRepoPath(filePath) {
  return path.relative(BASE_DIR, filePath).replace(/\\/g, '/');
}

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(BASE_DIR, relPath), 'utf8'));
}

function buildValidator() {
  const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true });
  const schema = readJson('config/deal-schema.json');
  return ajv.compile(schema);
}

const MARKETS = [
  ['Austin', 'TX', '78701'],
  ['Dallas', 'TX', '75201'],
  ['Phoenix', 'AZ', '85004'],
  ['Charlotte', 'NC', '28202'],
  ['Atlanta', 'GA', '30303'],
  ['Denver', 'CO', '80202'],
  ['Nashville', 'TN', '37203'],
  ['Tampa', 'FL', '33602'],
  ['Raleigh', 'NC', '27601'],
  ['Salt Lake City', 'UT', '84101'],
];
const STRATEGIES = ['core', 'core-plus', 'value-add', 'opportunistic'];
const LOAN_TYPES = ['Agency', 'CMBS', 'Bank', 'Bridge', 'Life Company', 'HUD'];
const DOCUMENT_TYPES = [
  ['rent-roll.csv', 'rent_roll', 'Rent Roll', 'Intake'],
  ['t12.csv', 't12', 'T12 Operating Statement', 'Underwriting'],
  ['offering-memo.md', 'offering_memo', 'Offering Memo', 'Underwriting'],
];

function dealIdFor(index) {
  return `${GENERATED_PREFIX}${String(index).padStart(4, '0')}`;
}

function fixedDate(index) {
  const day = 1 + (index % 24);
  return `2026-07-${String(day).padStart(2, '0')}`;
}

function isoFor(index, minuteOffset = 0) {
  const minutes = index + minuteOffset;
  const mm = String(minutes % 60).padStart(2, '0');
  const hh = String(9 + Math.floor(minutes / 60)).padStart(2, '0');
  return `2026-06-22T${hh}:${mm}:00.000Z`;
}

function unitMixFor(index) {
  const oneBeds = 40 + (index % 21);
  const twoBeds = 36 + ((index * 2) % 23);
  const studios = 12 + (index % 11);
  const threeBeds = 8 + (index % 7);
  return [
    { type: 'Studio', count: studios, avgSqFt: 515 + (index % 20), marketRent: 1275 + (index % 9) * 15, inPlaceRent: 1210 + (index % 7) * 15 },
    { type: '1BR/1BA', count: oneBeds, avgSqFt: 710 + (index % 30), marketRent: 1580 + (index % 11) * 20, inPlaceRent: 1495 + (index % 9) * 20 },
    { type: '2BR/2BA', count: twoBeds, avgSqFt: 1030 + (index % 40), marketRent: 2140 + (index % 13) * 20, inPlaceRent: 2030 + (index % 11) * 20 },
    { type: '3BR/2BA', count: threeBeds, avgSqFt: 1290 + (index % 55), marketRent: 2650 + (index % 8) * 25, inPlaceRent: 2520 + (index % 6) * 25 },
  ];
}

function buildDeal(index) {
  const id = dealIdFor(index);
  const [city, state, zip] = MARKETS[index % MARKETS.length];
  const strategy = STRATEGIES[index % STRATEGIES.length];
  const unitMix = unitMixFor(index);
  const totalUnits = unitMix.reduce((sum, row) => sum + row.count, 0);
  const grossPotentialRentAnnual = unitMix.reduce((sum, row) => sum + row.count * row.marketRent * 12, 0);
  const inPlaceRentAnnual = unitMix.reduce((sum, row) => sum + row.count * row.inPlaceRent * 12, 0);
  const occupancy = Number((0.88 + (index % 10) * 0.01).toFixed(4));
  const revenue = Math.round(inPlaceRentAnnual * occupancy + 18000 + index * 220);
  const expenses = Math.round(revenue * (0.38 + (index % 7) * 0.015));
  const noi = revenue - expenses;
  const capRate = 0.052 + (index % 12) * 0.002;
  const askingPrice = Math.round(noi / capRate / 1000) * 1000;
  const targetLTV = Number((0.58 + (index % 11) * 0.015).toFixed(3));
  const rate = Number((0.056 + (index % 8) * 0.0025).toFixed(4));
  const psaDate = fixedDate(index);
  const ddStartDay = String(2 + (index % 24)).padStart(2, '0');
  const ddExpirationDay = String(8 + (index % 18)).padStart(2, '0');
  const closingDay = String(1 + (index % 24)).padStart(2, '0');

  return {
    dealId: id,
    dealName: `QA Local Portfolio ${String(index).padStart(4, '0')}`,
    property: {
      address: `${100 + index} Test Harbor Drive`,
      city,
      state,
      zip,
      county: `${city} County`,
      propertyType: 'multifamily',
      yearBuilt: 1988 + (index % 35),
      totalUnits,
      totalSqFt: unitMix.reduce((sum, row) => sum + row.count * row.avgSqFt, 0),
      avgUnitSqFt: Math.round(unitMix.reduce((sum, row) => sum + row.count * row.avgSqFt, 0) / totalUnits),
      buildings: 2 + (index % 8),
      stories: 2 + (index % 5),
      parking: { type: index % 3 === 0 ? 'covered' : 'surface', spaces: Math.round(totalUnits * 1.35) },
      amenities: ['pool', 'fitness center', 'package lockers', 'dog park'].slice(0, 2 + (index % 3)),
      unitMix: { types: unitMix },
    },
    financials: {
      askingPrice,
      pricePerUnit: Math.round(askingPrice / totalUnits),
      currentNOI: noi,
      proFormaNOI: Math.round(noi * (1.06 + (index % 4) * 0.03)),
      inPlaceOccupancy: occupancy,
      marketOccupancy: Number(Math.min(0.98, occupancy + 0.025).toFixed(4)),
      trailingT12Revenue: revenue,
      trailingT12Expenses: expenses,
      capExBudget: 150000 + index * 2500,
      renovationBudget: strategy === 'value-add' || strategy === 'opportunistic' ? totalUnits * (7000 + (index % 6) * 1500) : 0,
      estimatedClosingCosts: Math.round(askingPrice * 0.025),
    },
    financing: {
      targetLTV,
      estimatedRate: rate,
      loanTerm: 10,
      amortization: index % 6 === 0 ? 0 : 30,
      loanType: LOAN_TYPES[index % LOAN_TYPES.length],
      interestOnly: index % 6 === 0,
      ioPeriod: index % 6 === 0 ? 3 : 0,
    },
    investmentStrategy: strategy,
    targetHoldPeriod: 5 + (index % 3),
    targetIRR: Number((0.13 + (index % 5) * 0.01).toFixed(3)),
    targetEquityMultiple: Number((1.65 + (index % 5) * 0.1).toFixed(2)),
    targetCashOnCash: Number((0.055 + (index % 5) * 0.006).toFixed(3)),
    seller: {
      entity: `Synthetic Seller ${String(index).padStart(4, '0')} LLC`,
      broker: `QA Broker ${String((index % 12) + 1).padStart(2, '0')}`,
      brokerFirm: 'Synthetic Brokerage Group',
      motivations: ['portfolio recycling', 'estate planning', 'fund maturity'].slice(0, 1 + (index % 3)),
    },
    buyer: {
      entity: 'QA Local Buyer LLC',
      contactName: 'Synthetic Operator',
    },
    earnestMoney: {
      initialDeposit: Math.round(askingPrice * 0.005),
      initialDepositTiming: 'Within 2 business days of PSA execution',
      additionalDeposit: Math.round(askingPrice * 0.005),
      additionalDepositTiming: 'At diligence expiration',
      totalEarnestMoney: Math.round(askingPrice * 0.01),
      goesHardDate: `2026-08-${String(1 + (index % 20)).padStart(2, '0')}`,
    },
    timeline: {
      loiDate: `2026-06-${String(1 + (index % 20)).padStart(2, '0')}`,
      psaExecutionDate: psaDate,
      ddStartDate: `2026-07-${ddStartDay}`,
      ddExpirationDate: `2026-08-${ddExpirationDay}`,
      financingCommitmentDeadline: `2026-08-${String(10 + (index % 14)).padStart(2, '0')}`,
      closingDate: `2026-09-${closingDay}`,
      extensionOptions: [{ type: 'dd', days: 15, cost: Math.round(askingPrice * 0.001) }],
    },
    keyMetrics: {
      inPlaceCapRate: Number((noi / askingPrice).toFixed(4)),
      proFormaCapRate: Number((Math.round(noi * 1.12) / askingPrice).toFixed(4)),
      grossRentMultiplier: Number((askingPrice / grossPotentialRentAnnual).toFixed(2)),
      expenseRatio: Number((expenses / revenue).toFixed(4)),
      debtServiceCoverageRatio: Number((noi / (askingPrice * targetLTV * rate)).toFixed(2)),
      grossPotentialRent: grossPotentialRentAnnual,
    },
    riskFactors: [
      index % 5 === 0 ? 'Insurance expense requires market check' : 'Standard lease-up monitoring',
      index % 7 === 0 ? 'Capex timing may affect first-year cash flow' : 'No extraordinary physical risk noted',
    ],
    notes: 'Synthetic, sanitized local QA deal. No production or client data.',
  };
}

function buildRentRollCsv(deal) {
  const rows = ['Unit,Unit Type,SqFt,Market Rent,Current Rent,Status'];
  let unit = 100;
  for (const mix of deal.property.unitMix.types) {
    for (let index = 0; index < Math.min(mix.count, 12); index += 1) {
      unit += 1;
      const status = index % 17 === 0 ? 'Vacant' : 'Occupied';
      const inPlace = status === 'Vacant' ? 0 : mix.inPlaceRent;
      rows.push(`${unit},${mix.type},${mix.avgSqFt},${mix.marketRent},${inPlace},${status}`);
    }
  }
  return `${rows.join('\n')}\n`;
}

function buildT12Csv(deal) {
  const revenue = deal.financials.trailingT12Revenue;
  const expenses = deal.financials.trailingT12Expenses;
  const noi = deal.financials.currentNOI;
  return [
    'Line Item,Annual Amount,Category',
    `Effective Gross Income,${revenue},revenue`,
    `Total Operating Expenses,${expenses},expense`,
    `Net Operating Income,${noi},noi`,
    `Insurance,${Math.round(expenses * 0.11)},expense`,
    `Repairs and Maintenance,${Math.round(expenses * 0.13)},expense`,
    '',
  ].join('\n');
}

function buildOfferingMemo(deal) {
  return [
    `# ${deal.dealName}`,
    '',
    `Address: ${deal.property.address}, ${deal.property.city}, ${deal.property.state} ${deal.property.zip}`,
    `Units: ${deal.property.totalUnits}`,
    `Asking Price: $${deal.financials.askingPrice.toLocaleString('en-US')}`,
    `Current NOI: $${deal.financials.currentNOI.toLocaleString('en-US')}`,
    `Occupancy: ${Math.round(deal.financials.inPlaceOccupancy * 100)}%`,
    '',
    'This is a synthetic local QA memorandum generated for production-scale dashboard testing.',
    '',
  ].join('\n');
}

function makeUploadedData(documentId, label, columns, rows) {
  return {
    generatedAt: '2026-06-22T15:12:00.000Z',
    tableCount: 1,
    rowCount: rows.length,
    columnCount: columns.length,
    tables: [{
      tableId: `${documentId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label,
      rowCount: rows.length,
      columnCount: columns.length,
      truncated: rows.length > 8,
      columns: columns.map((name, index) => ({
        columnId: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `column-${index + 1}`,
        name,
        valueType: index === 0 || /type|status/i.test(name) ? 'string' : 'number',
        fillRate: 1,
        missingCount: 0,
        uniqueCount: Math.min(rows.length, 8),
        examples: rows.slice(0, 3).map((row) => String(row[index] ?? '')),
      })),
      rows: rows.slice(0, 8).map((row, index) => ({
        rowNumber: index + 2,
        values: Object.fromEntries(columns.map((name, columnIndex) => [name, String(row[columnIndex] ?? '')])),
      })),
      source: { sheet: label, headerRow: 1 },
    }],
    issues: rows.length > 8 ? [`Inspector preview shows 8 of ${rows.length} uploaded rows.`] : [],
  };
}

function extractionField(input, pathName, label, value, confidence, location, raw) {
  const fieldId = sha256(`${input.documentId}|${pathName}|${label}|${raw}`).slice(0, 16);
  return {
    fieldId,
    path: pathName,
    label,
    value,
    valueType: Number.isInteger(value) ? 'integer' : typeof value,
    unit: /price|noi|revenue|expenses/i.test(pathName) ? 'usd' : /occupancy|ltv/i.test(pathName) ? 'decimal' : undefined,
    confidence,
    source: input.fileName,
    sourceRef: {
      documentId: input.documentId,
      fileName: input.fileName,
      fileHash: input.sourceHash,
      parserId: input.parserId,
      parserVersion: 'qa-seed-v1',
      location,
      raw: String(raw),
    },
    reviewStatus: 'applied',
    currentValue: value,
    conflict: false,
  };
}

function buildExtractions(deal, documents) {
  const rentDoc = documents.find((doc) => doc.type === 'rent_roll');
  const t12Doc = documents.find((doc) => doc.type === 't12');
  const omDoc = documents.find((doc) => doc.type === 'offering_memo');
  const rentRows = deal.property.unitMix.types.map((mix) => [
    mix.type,
    mix.count,
    mix.avgSqFt,
    mix.marketRent,
    mix.inPlaceRent,
    'Occupied',
  ]);
  const t12Rows = [
    ['Effective Gross Income', deal.financials.trailingT12Revenue],
    ['Total Operating Expenses', deal.financials.trailingT12Expenses],
    ['Net Operating Income', deal.financials.currentNOI],
  ];

  const rentFields = [
    extractionField(rentDoc, 'property.totalUnits', 'Total Units', deal.property.totalUnits, 0.94, { row: 1, description: 'Count of seeded rent roll units' }, deal.property.totalUnits),
    extractionField(rentDoc, 'financials.inPlaceOccupancy', 'In-Place Occupancy', deal.financials.inPlaceOccupancy, 0.82, { row: 1, description: 'Occupied rows divided by total units' }, deal.financials.inPlaceOccupancy),
  ];
  const t12Fields = [
    extractionField(t12Doc, 'financials.trailingT12Revenue', 'Trailing T12 Revenue', deal.financials.trailingT12Revenue, 0.86, { row: 2, description: 'Effective gross income row' }, deal.financials.trailingT12Revenue),
    extractionField(t12Doc, 'financials.trailingT12Expenses', 'Trailing T12 Expenses', deal.financials.trailingT12Expenses, 0.86, { row: 3, description: 'Total operating expenses row' }, deal.financials.trailingT12Expenses),
    extractionField(t12Doc, 'financials.currentNOI', 'Current NOI', deal.financials.currentNOI, 0.91, { row: 4, description: 'Net operating income row' }, deal.financials.currentNOI),
  ];
  const omFields = [
    extractionField(omDoc, 'financials.askingPrice', 'Asking Price', deal.financials.askingPrice, 0.78, { line: 5, description: 'Offering memo headline price' }, deal.financials.askingPrice),
  ];

  return [
    {
      document: rentDoc,
      extraction: {
        documentId: rentDoc.documentId,
        status: 'extracted',
        extractedAt: rentDoc.extractedAt,
        fields: rentFields,
        metrics: { rows: deal.property.totalUnits, seeded: true },
        notes: ['Seeded rent roll extraction for local production-scale QA.'],
        parserId: rentDoc.parserId,
        parserVersion: 'qa-seed-v1',
        sourceHash: rentDoc.sourceHash,
        reviewStatus: 'applied',
        uploadedData: makeUploadedData(rentDoc.documentId, 'Rent Roll Rows', ['Unit Type', 'Count', 'Avg SqFt', 'Market Rent', 'Current Rent', 'Status'], rentRows),
      },
    },
    {
      document: t12Doc,
      extraction: {
        documentId: t12Doc.documentId,
        status: 'extracted',
        extractedAt: t12Doc.extractedAt,
        fields: t12Fields,
        metrics: { rows: 3, seeded: true },
        notes: ['Seeded T12 extraction for local production-scale QA.'],
        parserId: t12Doc.parserId,
        parserVersion: 'qa-seed-v1',
        sourceHash: t12Doc.sourceHash,
        reviewStatus: 'applied',
        uploadedData: makeUploadedData(t12Doc.documentId, 'T12 Worksheet', ['Line Item', 'Annual Amount'], t12Rows),
      },
    },
    {
      document: omDoc,
      extraction: {
        documentId: omDoc.documentId,
        status: 'extracted',
        extractedAt: omDoc.extractedAt,
        fields: omFields,
        metrics: { lines: 8, seeded: true },
        notes: ['Seeded offering memo extraction for local production-scale QA.'],
        parserId: omDoc.parserId,
        parserVersion: 'qa-seed-v1',
        sourceHash: omDoc.sourceHash,
        reviewStatus: 'applied',
        uploadedData: makeUploadedData(omDoc.documentId, 'Offering Memo Text', ['Line', 'Text'], [
          [1, deal.dealName],
          [2, `${deal.property.totalUnits} units`],
          [3, `$${deal.financials.askingPrice}`],
        ]),
      },
    },
  ];
}

function writeDealWorkspace(dataRoot, deal, index) {
  const dealRoot = path.join(dataRoot, 'deals', deal.dealId);
  const documentsRoot = path.join(dealRoot, 'documents');
  const extractionsRoot = path.join(dealRoot, 'extractions');
  const now = isoFor(index);
  const docContents = {
    'rent-roll.csv': buildRentRollCsv(deal),
    't12.csv': buildT12Csv(deal),
    'offering-memo.md': buildOfferingMemo(deal),
  };

  const documents = DOCUMENT_TYPES.map(([fileName, type, typeLabel, phaseLabel]) => {
    const storedName = `${type}-${fileName}`;
    const filePath = path.join(documentsRoot, storedName);
    writeText(filePath, docContents[fileName]);
    const sourceHash = fileHash(filePath);
    return {
      documentId: `${type}-${String(index).padStart(4, '0')}`,
      fileName,
      storedName,
      path: filePath,
      mime: fileName.endsWith('.md') ? 'text/markdown' : 'text/csv',
      size: fs.statSync(filePath).size,
      type,
      typeLabel,
      phase: phaseLabel.toLowerCase().replace(/\s+/g, '-'),
      phaseLabel,
      status: 'applied',
      extractionStatus: 'extracted',
      uploadedAt: now,
      extractedAt: isoFor(index, 1),
      appliedAt: isoFor(index, 2),
      reviewedAt: isoFor(index, 2),
      parserId: `qa-seed-${type}-parser`,
      parserVersion: 'qa-seed-v1',
      sourceHash,
      lifecycleReason: 'Seeded source document for local production-scale QA.',
      summary: `Synthetic ${typeLabel} for ${deal.dealName}.`,
    };
  });

  const extractions = buildExtractions(deal, documents);
  for (const { document, extraction } of extractions) {
    writeJson(path.join(extractionsRoot, `${document.documentId}.json`), extraction);
  }

  const approvedFields = extractions.flatMap(({ extraction }) =>
    extraction.fields.map((field) => ({
      fieldId: field.fieldId,
      path: field.path,
      label: field.label,
      value: field.value,
      previousValue: field.value,
      valueType: field.valueType,
      unit: field.unit,
      approvedAt: now,
      appliedAt: now,
      documentId: field.sourceRef.documentId,
      sourceRef: field.sourceRef,
      confidence: field.confidence,
      provenance: 'parser',
    })),
  );

  writeJson(path.join(dealRoot, 'deal.json'), deal);
  writeJson(path.join(dealRoot, 'meta.json'), {
    dealId: deal.dealId,
    saveState: 'ready',
    createdAt: isoFor(index, -1),
    updatedAt: now,
    lastLaunchedAt: index % 4 === 0 ? isoFor(index, 3) : undefined,
  });
  writeJson(path.join(dealRoot, 'document-manifest.json'), {
    version: 1,
    dealId: deal.dealId,
    documents,
  });
  writeJson(path.join(dealRoot, 'approved-fields.json'), {
    version: 1,
    dealId: deal.dealId,
    updatedAt: now,
    fields: approvedFields,
  });
  writeJson(path.join(dealRoot, 'criteria.json'), {
    investmentStrategy: deal.investmentStrategy,
    targetHoldPeriod: deal.targetHoldPeriod,
    targetIRR: deal.targetIRR,
    targetEquityMultiple: deal.targetEquityMultiple,
    targetCashOnCash: deal.targetCashOnCash,
    targetLTV: deal.financing.targetLTV,
    estimatedRate: deal.financing.estimatedRate,
    loanTerm: deal.financing.loanTerm,
    amortization: deal.financing.amortization,
    loanType: deal.financing.loanType,
    riskTolerance: index % 3 === 0 ? 'conservative' : index % 3 === 1 ? 'balanced' : 'aggressive',
    scenario: deal.investmentStrategy === 'opportunistic' ? 'distressed' : deal.investmentStrategy === 'value-add' ? 'value-add' : 'core-plus',
    notes: 'Seeded local criteria for production-scale QA.',
    updatedAt: now,
  });
  writeJson(path.join(dealRoot, 'phase-state.json'), {
    intake: {
      'intake-create-workspace': { status: 'complete', note: 'Seeded workspace exists.', updatedAt: now },
      'intake-source-package': { status: 'complete', note: 'Seeded source package uploaded.', updatedAt: now },
      'intake-review-extraction': { status: 'complete', note: 'Seeded extraction applied.', updatedAt: now },
    },
    underwriting: {
      'underwriting-source-fields': { status: 'complete', note: 'Core launch fields source-backed.', updatedAt: now },
    },
  });

  return {
    documents,
    approvedFieldCount: approvedFields.length,
    documentCount: documents.length,
  };
}

function phase(status, progress, summary, verdict = null) {
  const state = status.toLowerCase();
  return {
    name: summary.split(':')[0],
    status: state,
    progress,
    startedAt: '2026-06-22T15:12:00.000Z',
    completedAt: state === 'complete' ? '2026-06-22T15:42:00.000Z' : null,
    agents: { total: 3, completed: state === 'complete' ? 3 : 1, running: state === 'running' ? 1 : 0, failed: state === 'failed' ? 1 : 0, pending: state === 'pending' ? 3 : 0, skipped: 0 },
    outputs: {
      phaseSummary: summary,
      keyFindings: [`${summary} finding for sanitized QA data.`],
      redFlags: verdict === 'NEEDS_REVIEW' ? [{ description: 'Synthetic QA red flag for review behavior.', severity: 'MEDIUM', category: 'QA' }] : [],
      dataGaps: [],
      phaseVerdict: verdict,
    },
    agentStatuses: {},
    verdict,
  };
}

function writeRuntimeArtifacts(dataRoot, deal, index, workspaceStats) {
  const status = index % 5 === 0 ? 'COMPLETE' : index % 7 === 0 ? 'FAILED' : index % 3 === 0 ? 'RUNNING' : 'PENDING';
  const phases = {
    dueDiligence: phase(status === 'COMPLETE' ? 'complete' : 'pending', status === 'COMPLETE' ? 1 : 0.2, 'Due Diligence: synthetic local package reviewed', status === 'FAILED' ? 'NEEDS_REVIEW' : null),
    underwriting: phase(status === 'COMPLETE' ? 'complete' : 'running', status === 'COMPLETE' ? 1 : 0.55, 'Underwriting: seeded economics reviewed', status === 'FAILED' ? 'NEEDS_REVIEW' : 'PASS'),
    financing: phase(status === 'COMPLETE' ? 'complete' : 'pending', status === 'COMPLETE' ? 1 : 0, 'Financing: source-backed debt assumptions staged'),
    legal: phase(status === 'COMPLETE' ? 'complete' : 'pending', status === 'COMPLETE' ? 1 : 0, 'Legal: seeded PSA review placeholder'),
    closing: phase(status === 'COMPLETE' ? 'complete' : 'pending', status === 'COMPLETE' ? 1 : 0, 'Closing: seeded closing checklist placeholder'),
  };
  const checkpoint = {
    dealId: deal.dealId,
    dealName: deal.dealName,
    property: {
      address: deal.property.address,
      city: deal.property.city,
      state: deal.property.state,
      zip: deal.property.zip,
      totalUnits: deal.property.totalUnits,
      askingPrice: deal.financials.askingPrice,
    },
    status,
    workflowId: status === 'COMPLETE' ? 'quick-deal-screen' : 'full-acquisition-review',
    workflowName: status === 'COMPLETE' ? 'Quick Deal Screen' : 'Full Acquisition Review',
    runtimeProvider: 'simulation',
    overallProgress: status === 'COMPLETE' ? 100 : status === 'FAILED' ? 62 : status === 'RUNNING' ? 43 : 0,
    startedAt: isoFor(index),
    completedAt: status === 'COMPLETE' ? isoFor(index, 30) : null,
    lastUpdatedAt: isoFor(index, 30),
    phases,
    inputSnapshot: {
      sourceCoverage: {
        sourceDocumentCount: workspaceStats.documentCount,
        appliedDocumentCount: workspaceStats.documentCount,
        reviewReadyDocumentCount: 0,
        pendingExtractionCount: 0,
        approvedFieldCount: workspaceStats.approvedFieldCount,
        requiredApprovedFieldCount: 4,
        missingApprovedFieldCount: 0,
        staleDocumentCount: 0,
        invalidApprovedFieldCount: 0,
      },
    },
    resumeInstructions: 'Synthetic local QA checkpoint. Re-run workflows from the dashboard if needed.',
  };

  writeJson(path.join(dataRoot, 'status', `${deal.dealId}.json`), checkpoint);
  if (status === 'COMPLETE') {
    const reportPath = path.join(dataRoot, 'reports', deal.dealId, 'underwriting', 'financial-model-builder-workpaper-v1.md');
    writeText(reportPath, `# ${deal.dealName} Financial Model Builder Workpaper\n\nSynthetic local QA workpaper for browser-scale testing.\n`);
  }
  return status;
}

function removeGeneratedNamespace(dataRoot) {
  const roots = [
    path.join(dataRoot, 'deals'),
    path.join(dataRoot, 'status'),
    path.join(dataRoot, 'logs'),
    path.join(dataRoot, 'reports'),
    path.join(dataRoot, 'phase-outputs'),
    path.join(dataRoot, 'runs'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      if (entry.startsWith(GENERATED_PREFIX)) {
        fs.rmSync(path.join(root, entry), { recursive: true, force: true });
      }
      if (entry.endsWith('.json') && entry.startsWith(GENERATED_PREFIX)) {
        fs.rmSync(path.join(root, entry), { force: true });
      }
    }
  }
}

function assertNoSensitiveStrings(dataRoot, dealIds) {
  const banned = [
    'ahacker@',
    'theaiconsultingnetwork.com',
    'Avi Hacker',
    'Jake Heller',
    'Krista',
    'Harrison',
    'Campbell',
  ];
  for (const dealId of dealIds) {
    const dealRoot = path.join(dataRoot, 'deals', dealId);
    const statusPath = path.join(dataRoot, 'status', `${dealId}.json`);
    const blobs = [
      fs.readFileSync(path.join(dealRoot, 'deal.json'), 'utf8'),
      fs.readFileSync(path.join(dealRoot, 'document-manifest.json'), 'utf8'),
      fs.readFileSync(statusPath, 'utf8'),
    ];
    for (const blob of blobs) {
      const hit = banned.find((term) => blob.includes(term));
      if (hit) throw new Error(`Sensitive-looking token found in generated data: ${hit}`);
    }
  }
}

function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }

  const validateDeal = buildValidator();
  ensureDir(options.dataRoot);
  if (options.clean) removeGeneratedNamespace(options.dataRoot);

  const summary = {
    generatedAt: '2026-06-22T15:12:00.000Z',
    dataRoot: asRepoPath(options.dataRoot),
    namespace: `${GENERATED_PREFIX}*`,
    count: options.count,
    deals: 0,
    documents: 0,
    approvedFields: 0,
    statuses: {},
    validationErrors: [],
  };
  const dealIds = [];

  for (let index = 1; index <= options.count; index += 1) {
    const deal = buildDeal(index);
    dealIds.push(deal.dealId);
    const valid = validateDeal(deal);
    if (!valid) {
      summary.validationErrors.push({
        dealId: deal.dealId,
        errors: validateDeal.errors,
      });
      continue;
    }
    const workspaceStats = writeDealWorkspace(options.dataRoot, deal, index);
    const status = writeRuntimeArtifacts(options.dataRoot, deal, index, workspaceStats);
    summary.deals += 1;
    summary.documents += workspaceStats.documentCount;
    summary.approvedFields += workspaceStats.approvedFieldCount;
    summary.statuses[status] = (summary.statuses[status] || 0) + 1;
  }

  if (summary.validationErrors.length > 0) {
    writeJson(path.join(options.dataRoot, SUMMARY_DIR, 'latest.json'), summary);
    throw new Error(`Generated ${summary.validationErrors.length} invalid deal(s)`);
  }

  assertNoSensitiveStrings(options.dataRoot, dealIds);

  const summaryPath = path.join(options.dataRoot, SUMMARY_DIR, 'latest.json');
  writeJson(summaryPath, summary);
  if (options.quiet) {
    console.log(asRepoPath(summaryPath));
    return;
  }
  console.log(`[seed-production-local-data] Generated ${summary.deals} sanitized deals`);
  console.log(`[seed-production-local-data] Documents: ${summary.documents}; approved fields: ${summary.approvedFields}`);
  console.log(`[seed-production-local-data] Statuses: ${JSON.stringify(summary.statuses)}`);
  console.log(`[seed-production-local-data] Summary: ${asRepoPath(summaryPath)}`);
}

try {
  main();
} catch (error) {
  console.error(`[seed-production-local-data] ${error.message}`);
  process.exit(1);
}
