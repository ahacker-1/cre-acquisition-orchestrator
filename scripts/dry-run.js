#!/usr/bin/env node
/**
 * dry-run.js (Task 12.3)
 *
 * Simulates the 5-phase pipeline with timed checkpoint writes (no LLM calls needed).
 *
 * Usage:
 *   node scripts/dry-run.js
 *   node scripts/dry-run.js --deal config/deal.json --speed fast
 *   node scripts/dry-run.js --speed normal
 *   node scripts/dry-run.js --speed slow
 *
 * Speed settings:
 *   fast   = 500ms per agent step
 *   normal = 2000ms per agent step (default)
 *   slow   = 5000ms per agent step
 *
 * Simulates the full pipeline by writing checkpoints at timed intervals.
 * Useful for testing the dashboard real-time display.
 */

const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------
const BASE_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const dealPath = path.resolve(BASE_DIR, getArg('--deal', 'config/deal.json'));
const speed = getArg('--speed', 'normal');

const DELAYS = { fast: 500, normal: 2000, slow: 5000 };
const STEP_DELAY = DELAYS[speed] || 2000;

// ------------------------------------------------------------------
// Phase definitions
// ------------------------------------------------------------------
const PHASES = [
  {
    key: 'dueDiligence',
    label: 'Due Diligence',
    agents: ['rent-roll-analyst', 'opex-analyst', 'physical-inspection', 'legal-title-review', 'market-study', 'tenant-credit', 'environmental-review'],
    verdict: 'CONDITIONAL',
    riskScore: 78
  },
  {
    key: 'underwriting',
    label: 'Underwriting',
    agents: ['financial-model-builder', 'scenario-analyst', 'ic-memo-writer'],
    verdict: 'PASS',
    riskScore: 82
  },
  {
    key: 'financing',
    label: 'Financing',
    agents: ['lender-outreach', 'quote-comparator', 'term-sheet-builder'],
    verdict: 'PASS',
    riskScore: 88
  },
  {
    key: 'legal',
    label: 'Legal',
    agents: ['psa-reviewer', 'loan-doc-reviewer', 'title-survey-reviewer', 'estoppel-tracker', 'insurance-coordinator', 'transfer-doc-preparer'],
    verdict: 'PASS',
    riskScore: 92
  },
  {
    key: 'closing',
    label: 'Closing',
    agents: ['closing-coordinator', 'funds-flow-manager'],
    verdict: 'GO',
    riskScore: 95
  }
];

// ------------------------------------------------------------------
// Data generators (same logic as generate-checkpoint.js but inline)
// ------------------------------------------------------------------
function randomBetween(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function generateDDData(deal) {
  const units = deal.property.totalUnits || 200;
  const occupancy = deal.financials.inPlaceOccupancy || 0.93;
  const totalExpenses = deal.financials.trailingT12Expenses || 1440000;
  const revenue = deal.financials.trailingT12Revenue || 3360000;
  let avgInPlaceRent = 1450, avgMarketRent = 1525;
  if (deal.property.unitMix && deal.property.unitMix.types) {
    const mix = deal.property.unitMix.types;
    const tc = mix.reduce((s, t) => s + t.count, 0);
    if (tc > 0) {
      avgInPlaceRent = Math.round(mix.reduce((s, t) => s + t.inPlaceRent * t.count, 0) / tc);
      avgMarketRent = Math.round(mix.reduce((s, t) => s + t.marketRent * t.count, 0) / tc);
    }
  }
  const currentYear = new Date().getFullYear();
  const buildingAge = currentYear - (deal.property.yearBuilt || 1998);

  return {
    rentRoll: {
      totalUnits: units, occupancy, avgRent: avgInPlaceRent, avgMarketRent,
      lossToLease: Math.round((avgMarketRent - avgInPlaceRent) * units * occupancy),
      lossToLeasePercent: parseFloat(((avgMarketRent - avgInPlaceRent) / avgMarketRent).toFixed(3)),
      tenantMix: { studioCount: Math.round(units * 0.1), oneBedCount: Math.round(units * 0.4), twoBedCount: Math.round(units * 0.4), threeBedCount: Math.round(units * 0.1) },
      leaseExpirationSchedule: { [currentYear]: Math.round(units * 0.22), [currentYear + 1]: Math.round(units * 0.43), [currentYear + 2]: Math.round(units * 0.25), [currentYear + 3]: Math.round(units * 0.07), [currentYear + 4]: Math.round(units * 0.03) },
      vacancyTrend: [0.05, 0.06, 0.07, 0.07],
      concessions: [{ type: '1 month free', units: Math.round(units * 0.06), value: Math.round(avgInPlaceRent * units * 0.06) }]
    },
    expenses: {
      totalOpEx: totalExpenses, opExPerUnit: Math.round(totalExpenses / units),
      opExRatio: parseFloat((totalExpenses / revenue).toFixed(2)),
      anomalies: [{ item: 'Repair spike Q3', amount: Math.round(totalExpenses * 0.031), explanation: 'Roof repair after storm' }],
      oneTimeItems: [{ item: 'Legal settlement', amount: Math.round(totalExpenses * 0.015) }],
      adjustedExpenses: {
        taxes: Math.round(totalExpenses * 0.333), insurance: Math.round(totalExpenses * 0.067),
        utilities: Math.round(totalExpenses * 0.133), repairs: Math.round(totalExpenses * 0.117),
        management: Math.round(totalExpenses * 0.100), payroll: Math.round(totalExpenses * 0.133),
        admin: Math.round(totalExpenses * 0.033), marketing: Math.round(totalExpenses * 0.025),
        contractServices: Math.round(totalExpenses * 0.042), other: Math.round(totalExpenses * 0.017)
      },
      benchmarkComparison: { vsMarket: '5% below', vsClass: 'in-line' }
    },
    physical: {
      condition: buildingAge > 20 ? 'FAIR' : 'GOOD', conditionScore: Math.max(50, 100 - buildingAge * 1.2),
      deferredMaintenance: Math.round(units * 3400), deferredMaintenancePerUnit: 3400,
      capExNeeds: [
        { item: 'Roof replacement - Bldg A', cost: Math.round(units * 900), year: 1 },
        { item: 'HVAC units (' + Math.round(units * 0.2) + ')', cost: Math.round(units * 0.2 * 6000), year: 2 },
        { item: 'Parking lot resurface', cost: Math.round(units * 475), year: 3 },
        { item: 'Unit renovations', cost: Math.round(units * 0.25 * 10000), year: 1 }
      ],
      capExTotal5Year: Math.round(units * 6000),
      majorIssues: buildingAge > 20 ? ['Roof age (' + buildingAge + ' years)', 'HVAC units past useful life'] : [],
      systemAges: {
        roof: { age: buildingAge, remainingLife: Math.max(0, 25 - buildingAge) },
        hvac: { age: Math.round(buildingAge * 0.7), remainingLife: Math.max(0, 25 - Math.round(buildingAge * 0.7)) },
        plumbing: { age: buildingAge, remainingLife: Math.max(0, 40 - buildingAge) },
        electrical: { age: buildingAge, remainingLife: Math.max(0, 40 - buildingAge) }
      },
      immediateRepairs: [{ item: 'Roof leak Bldg A, unit 312', cost: 8500 }]
    },
    title: { status: 'CLEAR', exceptions: ['Standard utility easements', 'HOA covenant (acceptable)'], liens: [], easements: ['10ft utility easement along north boundary'], zoningCompliance: 'COMPLIANT', surveyIssues: [], encumbrances: [] },
    market: {
      submarket: deal.property.city || 'Austin', submarketClass: 'B+',
      rentGrowthTrailing12: 0.035, rentGrowthProjected: 0.04,
      capRateRange: { low: 0.050, mid: 0.055, high: 0.065 },
      supplyPipeline: { unitsUnderConstruction: 1200, unitsPlanned: 800, deliveryTimeline: [{ year: currentYear, units: 600 }, { year: currentYear + 1, units: 1400 }] },
      demandDrivers: ['Tech sector growth', 'University expansion', 'Population influx'],
      employmentGrowth: 0.032, populationGrowth: 0.025, medianHouseholdIncome: 78500, rentToIncomeRatio: 0.22,
      comparableProperties: [
        { name: 'The Preserve', units: 180, avgRent: 1510, capRate: 0.054 },
        { name: 'Oak Hill Village', units: 240, avgRent: 1480, capRate: 0.058 },
        { name: 'Riverside Commons', units: 160, avgRent: 1550, capRate: 0.052 }
      ]
    },
    tenants: {
      creditSummary: 'Generally good tenant base', avgCreditScore: 680, concentrationRisk: 'LOW',
      topTenantExposure: 0.005, leaseExpirations: { year1: 45, year2: 85, year3: 50, year4: 15, year5: 5 },
      delinquencyRate: 0.04, tenantRetentionRate: 0.72
    },
    environmental: {
      phase1Status: 'CLEAN', recognizedEnvironmentalConditions: [], recommendations: ['Standard Phase I monitoring'],
      risks: [], floodZone: 'X', wetlands: false, estimatedRemediationCost: 0, regulatoryCompliance: 'COMPLIANT'
    }
  };
}

function generateUWData(deal, ddData) {
  const price = deal.financials.askingPrice || 32000000;
  const units = deal.property.totalUnits || 200;
  const occ = ddData.rentRoll.occupancy;
  const rent = ddData.rentRoll.avgRent;
  const expenses = ddData.expenses.totalOpEx;
  const revenue = rent * 12 * units * occ;
  const noi = revenue - expenses;
  const capRate = parseFloat((noi / price).toFixed(4));
  const ltv = deal.financing.targetLTV || 0.70;
  const loanAmt = Math.round(price * ltv);
  const rate = deal.financing.estimatedRate || 0.065;
  const mr = rate / 12;
  const tp = (deal.financing.amortization || 30) * 12;
  const mp = loanAmt * (mr * Math.pow(1 + mr, tp)) / (Math.pow(1 + mr, tp) - 1);
  const ads = Math.round(mp * 12);
  const dscr = parseFloat((noi / ads).toFixed(2));
  const equity = price - loanAmt;
  const coc = parseFloat(((noi - ads) / equity).toFixed(3));
  const dy = parseFloat((noi / loanAmt).toFixed(3));
  const exitCap = capRate + 0.005;
  const y5noi = noi * Math.pow(1.03, 5);
  const exitVal = y5noi / exitCap;
  const netProc = exitVal * 0.97 - loanAmt * 0.95;
  const totalRet = (noi - ads) * 5 + netProc;
  const em = parseFloat(((equity + totalRet) / equity).toFixed(2));
  const irr = parseFloat((Math.pow(em, 1 / 5) - 1).toFixed(3));

  return {
    financialModel: { purchasePrice: price, pricePerUnit: Math.round(price / units), noi: Math.round(noi), capRate, dscr, ltv, cashOnCash: coc, irr, equityMultiple: em, debtYield: dy, debtService: ads },
    scenarios: { totalScenarios: 27, scenariosPassingAll: 22, baseCaseIRR: irr, worstCaseIRR: parseFloat((irr * 0.5).toFixed(3)), bestCaseIRR: parseFloat((irr * 1.5).toFixed(3)) },
    recommendation: dscr >= 1.25 ? 'APPROVE' : 'CONDITIONAL'
  };
}

function generateFinancingData(deal, uwData) {
  const price = uwData.financialModel.purchasePrice;
  const ltv = uwData.financialModel.ltv;
  const loanAmount = Math.round(price * ltv);
  const rate = deal.financing.estimatedRate || 0.065;
  return {
    bestQuote: { lender: 'Freddie Mac Optigo', rate: parseFloat((rate - 0.008).toFixed(4)), ltv, loanAmount, term: deal.financing.loanTerm || 10, amortization: deal.financing.amortization || 30, prepayment: 'yield-maintenance', originationFee: 0.01 },
    lenderCount: 8, quotesReceived: 5, totalCostOfCapital: parseFloat((rate - 0.004).toFixed(4))
  };
}

function generateLegalData() {
  return { psaStatus: 'EXECUTED', titleStatus: 'CLEAR', estoppelReturnRate: 0.88, insuranceStatus: 'BOUND', loanDocsStatus: 'EXECUTED', transferDocsStatus: 'PREPARED' };
}

function generateClosingData(deal, uwData, finData) {
  const price = uwData.financialModel.purchasePrice;
  const loanAmt = finData.bestQuote.loanAmount;
  const cc = deal.financials.estimatedClosingCosts || Math.round(price * 0.02);
  return { readinessVerdict: 'GO', purchasePrice: price, loanAmount: loanAmt, equityRequired: price - loanAmt + cc, closingCosts: cc, prorations: Math.round(price * 0.0014), closingDate: deal.timeline.closingDate || '2024-07-15' };
}

// ------------------------------------------------------------------
// Checkpoint writer
// ------------------------------------------------------------------
function writeCheckpoint(dealId, checkpoint) {
  const dir = path.join(BASE_DIR, 'data', 'status');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${dealId}.json`);
  checkpoint.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
}

function appendLog(dealId, phase, agentName, category, message) {
  const logDir = path.join(BASE_DIR, 'data', 'logs', dealId);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${phase}.log`);
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${agentName}] [${category}] ${message}\n`;
  fs.appendFileSync(logFile, line);
}

// ------------------------------------------------------------------
// Simulation
// ------------------------------------------------------------------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function colorize(text, color) {
  const c = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m', reset: '\x1b[0m' };
  return `${c[color] || ''}${text}${c.reset}`;
}

async function simulatePipeline(deal) {
  const dealId = deal.dealId || 'DRY-RUN-001';
  const dealName = deal.dealName || 'Dry Run Deal';

  console.log(colorize(`\n=== DRY RUN: ${dealName} (${dealId}) ===`, 'bold'));
  console.log(`Speed: ${speed} (${STEP_DELAY}ms per agent step)\n`);

  // Initialize checkpoint
  const checkpoint = {
    dealId,
    dealName: dealName + ' Acquisition',
    property: {
      name: dealName,
      address: [deal.property.address, deal.property.city, deal.property.state, deal.property.zip].filter(Boolean).join(', '),
      units: deal.property.totalUnits || 200,
      yearBuilt: deal.property.yearBuilt || 1998,
      type: deal.property.propertyType || 'multifamily',
      class: 'B'
    },
    strategy: deal.investmentStrategy || 'core-plus',
    status: 'RUNNING',
    currentPhase: null,
    overallProgress: 0,
    overallVerdict: null,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    completedAt: null,
    traceId: `${dealId}-${Date.now()}`,
    events: [],
    phases: {}
  };

  // Initialize all phases as PENDING
  for (const phase of PHASES) {
    const agentStatuses = {};
    for (const agent of phase.agents) {
      agentStatuses[agent] = 'PENDING';
    }
    checkpoint.phases[phase.key] = {
      status: 'PENDING',
      startedAt: null,
      completedAt: null,
      verdict: null,
      agentStatuses,
      redFlagCount: 0,
      dataGapCount: 0,
      riskScore: 0,
      dataForDownstream: {}
    };
  }

  writeCheckpoint(dealId, checkpoint);
  appendLog(dealId, 'master', 'master-orchestrator', 'ACTION', `Pipeline started for ${dealName}`);
  console.log(colorize('  Initial checkpoint written (all phases PENDING)', 'dim'));

  // Generate data for use during simulation
  const ddData = generateDDData(deal);
  const uwData = generateUWData(deal, ddData);
  const finData = generateFinancingData(deal, uwData);
  const legalData = generateLegalData();
  const closingData = generateClosingData(deal, uwData, finData);

  const phaseDataMap = {
    dueDiligence: ddData,
    underwriting: uwData,
    financing: finData,
    legal: legalData,
    closing: closingData
  };

  // Simulate each phase
  for (let pi = 0; pi < PHASES.length; pi++) {
    const phase = PHASES[pi];
    const phaseRef = checkpoint.phases[phase.key];

    console.log(colorize(`\n  Phase ${pi + 1}/5: ${phase.label}`, 'cyan'));

    // Mark phase as RUNNING
    phaseRef.status = 'RUNNING';
    phaseRef.startedAt = new Date().toISOString();
    checkpoint.currentPhase = phase.key;
    checkpoint.overallProgress = Math.round((pi / 5) * 100);
    writeCheckpoint(dealId, checkpoint);
    appendLog(dealId, phase.key, phase.key + '-orchestrator', 'ACTION', `Phase started: ${phase.label}`);

    // Simulate each agent
    for (let ai = 0; ai < phase.agents.length; ai++) {
      const agent = phase.agents[ai];

      // Mark agent as RUNNING
      phaseRef.agentStatuses[agent] = 'RUNNING';
      writeCheckpoint(dealId, checkpoint);
      appendLog(dealId, phase.key, agent, 'ACTION', `Agent started`);
      console.log(`    ${colorize('RUNNING', 'yellow')} ${agent}...`);

      await sleep(STEP_DELAY);

      // Mark agent as COMPLETED
      phaseRef.agentStatuses[agent] = 'COMPLETED';
      writeCheckpoint(dealId, checkpoint);
      appendLog(dealId, phase.key, agent, 'COMPLETE', `Agent completed successfully`);
      console.log(`    ${colorize('DONE', 'green')}    ${agent}`);
    }

    // Mark phase as COMPLETED
    phaseRef.status = 'COMPLETE';
    phaseRef.completedAt = new Date().toISOString();
    phaseRef.verdict = phase.verdict;
    phaseRef.riskScore = phase.riskScore;
    phaseRef.redFlagCount = phase.key === 'dueDiligence' ? 2 : 0;
    phaseRef.dataGapCount = phase.key === 'dueDiligence' ? 1 : 0;
    phaseRef.dataForDownstream = phaseDataMap[phase.key];

    checkpoint.overallProgress = Math.round(((pi + 1) / 5) * 100);
    writeCheckpoint(dealId, checkpoint);
    appendLog(dealId, phase.key, phase.key + '-orchestrator', 'COMPLETE', `Phase completed with verdict: ${phase.verdict}`);

    console.log(`    ${colorize('Phase ' + phase.label + ': ' + phase.verdict, 'green')} (risk score: ${phase.riskScore})`);
  }

  // Finalize
  checkpoint.status = 'COMPLETE';
  checkpoint.currentPhase = null;
  checkpoint.overallProgress = 100;
  checkpoint.overallVerdict = 'CONDITIONAL';
  checkpoint.completedAt = new Date().toISOString();
  writeCheckpoint(dealId, checkpoint);
  appendLog(dealId, 'master', 'master-orchestrator', 'COMPLETE', `Pipeline completed. Overall verdict: CONDITIONAL`);

  console.log(colorize(`\n=== DRY RUN COMPLETE ===`, 'bold'));
  console.log(`  Deal: ${dealName}`);
  console.log(`  Status: ${colorize('COMPLETE', 'green')}`);
  console.log(`  Verdict: ${colorize('CONDITIONAL', 'yellow')}`);
  console.log(`  Checkpoint: data/status/${dealId}.json`);
  console.log(`  Logs: data/logs/${dealId}/`);

  const elapsed = (new Date(checkpoint.completedAt) - new Date(checkpoint.startedAt)) / 1000;
  console.log(`  Elapsed: ${elapsed.toFixed(1)}s\n`);
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(dealPath)) {
    console.error(`Deal config not found: ${dealPath}`);
    process.exit(1);
  }

  const deal = JSON.parse(fs.readFileSync(dealPath, 'utf8'));
  console.log(`Loaded deal: ${deal.dealName || deal.dealId || 'unknown'}`);

  await simulatePipeline(deal);
}

main().catch(err => {
  console.error('Dry run failed:', err);
  process.exit(1);
});
