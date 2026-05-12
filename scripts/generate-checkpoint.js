#!/usr/bin/env node
/**
 * generate-checkpoint.js (Task 12.2)
 *
 * Generates synthetic checkpoints from deal config + expected outputs.
 *
 * Usage:
 *   node scripts/generate-checkpoint.js
 *   node scripts/generate-checkpoint.js --deal config/deal.json --output data/status/DEAL-ID.json
 *   node scripts/generate-checkpoint.js --phase dd                   # Only generate up to DD complete
 *   node scripts/generate-checkpoint.js --phase uw                   # DD + UW complete
 *   node scripts/generate-checkpoint.js --status in-progress         # Mid-pipeline checkpoint
 *
 * Generates a complete synthetic checkpoint with realistic data derived from deal config parameters.
 */

const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------
const BASE_DIR = path.resolve(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const dealPath = path.resolve(BASE_DIR, getArg('--deal', 'config/deal.json'));
const phaseFlag = getArg('--phase', 'all'); // dd, uw, financing, legal, closing, all
const statusFlag = getArg('--status', 'completed'); // completed, in-progress

// ------------------------------------------------------------------
// Phase ordering and mapping
// ------------------------------------------------------------------
const PHASE_ORDER = ['dd', 'uw', 'financing', 'legal', 'closing'];
const PHASE_KEYS = {
  dd: 'dueDiligence',
  uw: 'underwriting',
  financing: 'financing',
  legal: 'legal',
  closing: 'closing'
};

const PHASE_AGENTS = {
  dd: ['rent-roll-analyst', 'opex-analyst', 'physical-inspection', 'legal-title-review', 'market-study', 'tenant-credit', 'environmental-review'],
  uw: ['financial-model-builder', 'scenario-analyst', 'ic-memo-writer'],
  financing: ['lender-outreach', 'quote-comparator', 'term-sheet-builder'],
  legal: ['psa-reviewer', 'loan-doc-reviewer', 'title-survey-reviewer', 'estoppel-tracker', 'insurance-coordinator', 'transfer-doc-preparer'],
  closing: ['closing-coordinator', 'funds-flow-manager']
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function randomBetween(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function isoTimestamp(baseDate, offsetMinutes) {
  const d = new Date(baseDate);
  d.setMinutes(d.getMinutes() + offsetMinutes);
  return d.toISOString();
}

function phaseRuntimeStatus(status) {
  return status === 'COMPLETED' ? 'COMPLETE' : status;
}

// ------------------------------------------------------------------
// Data generators - derive realistic metrics from deal config
// ------------------------------------------------------------------
function generateDDData(deal) {
  const units = deal.property.totalUnits || 200;
  const occupancy = deal.financials.inPlaceOccupancy || 0.93;
  const askingPrice = deal.financials.askingPrice || 32000000;
  const totalExpenses = deal.financials.trailingT12Expenses || 1440000;
  const revenue = deal.financials.trailingT12Revenue || 3360000;

  // Derive avg rents from unit mix if available
  let avgInPlaceRent = 1450;
  let avgMarketRent = 1525;
  if (deal.property.unitMix && deal.property.unitMix.types) {
    const mix = deal.property.unitMix.types;
    const totalCount = mix.reduce((s, t) => s + t.count, 0);
    if (totalCount > 0) {
      avgInPlaceRent = Math.round(mix.reduce((s, t) => s + t.inPlaceRent * t.count, 0) / totalCount);
      avgMarketRent = Math.round(mix.reduce((s, t) => s + t.marketRent * t.count, 0) / totalCount);
    }
  }

  const lossToLease = (avgMarketRent - avgInPlaceRent) * units * occupancy;
  const lossToLeasePercent = parseFloat(((avgMarketRent - avgInPlaceRent) / avgMarketRent).toFixed(3));
  const yearBuilt = deal.property.yearBuilt || 1998;
  const currentYear = new Date().getFullYear();
  const buildingAge = currentYear - yearBuilt;

  // Generate unit mix counts
  const studioCount = Math.round(units * 0.10);
  const oneBedCount = Math.round(units * 0.40);
  const twoBedCount = Math.round(units * 0.40);
  const threeBedCount = units - studioCount - oneBedCount - twoBedCount;

  return {
    rentRoll: {
      totalUnits: units,
      occupancy: occupancy,
      avgRent: avgInPlaceRent,
      avgMarketRent: avgMarketRent,
      lossToLease: Math.round(lossToLease),
      lossToLeasePercent: lossToLeasePercent,
      tenantMix: { studioCount, oneBedCount, twoBedCount, threeBedCount },
      leaseExpirationSchedule: {
        [currentYear]: Math.round(units * 0.22),
        [currentYear + 1]: Math.round(units * 0.43),
        [currentYear + 2]: Math.round(units * 0.25),
        [currentYear + 3]: Math.round(units * 0.07),
        [currentYear + 4]: Math.round(units * 0.03)
      },
      vacancyTrend: [
        parseFloat((1 - occupancy - 0.02).toFixed(2)),
        parseFloat((1 - occupancy - 0.01).toFixed(2)),
        parseFloat((1 - occupancy).toFixed(2)),
        parseFloat((1 - occupancy).toFixed(2))
      ],
      concessions: [
        { type: '1 month free', units: Math.round(units * 0.06), value: Math.round(avgInPlaceRent * units * 0.06) }
      ]
    },
    expenses: {
      totalOpEx: totalExpenses,
      opExPerUnit: Math.round(totalExpenses / units),
      opExRatio: parseFloat((totalExpenses / revenue).toFixed(2)),
      anomalies: [
        { item: 'Repair spike Q3', amount: Math.round(totalExpenses * 0.031), explanation: 'Roof repair after storm' }
      ],
      oneTimeItems: [
        { item: 'Legal settlement', amount: Math.round(totalExpenses * 0.015) }
      ],
      adjustedExpenses: {
        taxes: Math.round(totalExpenses * 0.333),
        insurance: Math.round(totalExpenses * 0.067),
        utilities: Math.round(totalExpenses * 0.133),
        repairs: Math.round(totalExpenses * 0.117),
        management: Math.round(totalExpenses * 0.100),
        payroll: Math.round(totalExpenses * 0.133),
        admin: Math.round(totalExpenses * 0.033),
        marketing: Math.round(totalExpenses * 0.025),
        contractServices: Math.round(totalExpenses * 0.042),
        other: Math.round(totalExpenses * 0.017)
      },
      benchmarkComparison: { vsMarket: '5% below', vsClass: 'in-line' }
    },
    physical: {
      condition: buildingAge > 20 ? 'FAIR' : 'GOOD',
      conditionScore: Math.max(50, 100 - buildingAge * 1.2),
      deferredMaintenance: Math.round(units * randomBetween(2500, 4000)),
      deferredMaintenancePerUnit: Math.round(randomBetween(2500, 4000)),
      capExNeeds: [
        { item: 'Roof replacement - Bldg A', cost: Math.round(units * 900), year: 1 },
        { item: 'HVAC units (' + Math.round(units * 0.2) + ')', cost: Math.round(units * 0.2 * 6000), year: 2 },
        { item: 'Parking lot resurface', cost: Math.round(units * 475), year: 3 },
        { item: 'Unit renovations (' + Math.round(units * 0.25) + ' units)', cost: Math.round(units * 0.25 * 10000), year: 1 }
      ],
      capExTotal5Year: Math.round(units * 6000),
      majorIssues: buildingAge > 20
        ? ['Roof age on Building A (' + buildingAge + ' years)', 'HVAC units past useful life in ' + Math.round(units * 0.2) + ' units']
        : [],
      systemAges: {
        roof: { age: buildingAge, remainingLife: Math.max(0, 25 - buildingAge) },
        hvac: { age: Math.round(buildingAge * 0.7), remainingLife: Math.max(0, 25 - Math.round(buildingAge * 0.7)) },
        plumbing: { age: buildingAge, remainingLife: Math.max(0, 40 - buildingAge) },
        electrical: { age: buildingAge, remainingLife: Math.max(0, 40 - buildingAge) }
      },
      immediateRepairs: [
        { item: 'Roof leak Bldg A, unit 312', cost: Math.round(randomBetween(5000, 12000)) }
      ]
    },
    title: {
      status: 'CLEAR',
      exceptions: ['Standard utility easements', 'HOA covenant (acceptable)'],
      liens: [],
      easements: ['10ft utility easement along north boundary'],
      zoningCompliance: 'COMPLIANT',
      surveyIssues: [],
      encumbrances: []
    },
    market: {
      submarket: deal.property.city ? deal.property.city + ' Metro' : 'Austin Metro',
      submarketClass: 'B+',
      rentGrowthTrailing12: parseFloat(randomBetween(0.025, 0.045).toFixed(3)),
      rentGrowthProjected: parseFloat(randomBetween(0.030, 0.050).toFixed(3)),
      capRateRange: { low: 0.050, mid: 0.055, high: 0.065 },
      supplyPipeline: {
        unitsUnderConstruction: Math.round(randomBetween(800, 1500)),
        unitsPlanned: Math.round(randomBetween(500, 1000)),
        deliveryTimeline: [
          { year: currentYear, units: Math.round(randomBetween(400, 800)) },
          { year: currentYear + 1, units: Math.round(randomBetween(800, 1600)) }
        ]
      },
      demandDrivers: ['Tech sector growth', 'University expansion', 'Population influx'],
      employmentGrowth: parseFloat(randomBetween(0.020, 0.040).toFixed(3)),
      populationGrowth: parseFloat(randomBetween(0.015, 0.030).toFixed(3)),
      medianHouseholdIncome: Math.round(randomBetween(68000, 88000)),
      rentToIncomeRatio: parseFloat(randomBetween(0.20, 0.28).toFixed(2)),
      comparableProperties: [
        { name: 'The Preserve', units: Math.round(units * 0.9), avgRent: Math.round(avgMarketRent * 0.99), capRate: 0.054 },
        { name: 'Oak Hill Village', units: Math.round(units * 1.2), avgRent: Math.round(avgMarketRent * 0.97), capRate: 0.058 },
        { name: 'Riverside Commons', units: Math.round(units * 0.8), avgRent: Math.round(avgMarketRent * 1.02), capRate: 0.052 }
      ]
    },
    tenants: {
      creditSummary: 'Generally good tenant base with moderate delinquency',
      avgCreditScore: Math.round(randomBetween(660, 710)),
      concentrationRisk: 'LOW',
      topTenantExposure: parseFloat((1 / units).toFixed(4)),
      leaseExpirations: {
        year1: Math.round(units * 0.22),
        year2: Math.round(units * 0.43),
        year3: Math.round(units * 0.25),
        year4: Math.round(units * 0.07),
        year5: Math.round(units * 0.03)
      },
      delinquencyRate: parseFloat(randomBetween(0.03, 0.06).toFixed(2)),
      tenantRetentionRate: parseFloat(randomBetween(0.68, 0.78).toFixed(2))
    },
    environmental: {
      phase1Status: 'CLEAN',
      recognizedEnvironmentalConditions: [],
      recommendations: ['Standard Phase I monitoring'],
      risks: [],
      floodZone: 'X',
      wetlands: false,
      estimatedRemediationCost: 0,
      regulatoryCompliance: 'COMPLIANT'
    }
  };
}

function generateUWData(deal, ddData) {
  const purchasePrice = deal.financials.askingPrice || 32000000;
  const units = deal.property.totalUnits || 200;
  const occupancy = ddData.rentRoll.occupancy;
  const avgRent = ddData.rentRoll.avgRent;
  const totalExpenses = ddData.expenses.totalOpEx;

  const grossRevenue = avgRent * 12 * units;
  const effectiveRevenue = grossRevenue * occupancy;
  const noi = effectiveRevenue - totalExpenses;
  const capRate = parseFloat((noi / purchasePrice).toFixed(4));

  const targetLTV = deal.financing.targetLTV || 0.70;
  const loanAmount = Math.round(purchasePrice * targetLTV);
  const rate = deal.financing.estimatedRate || 0.065;
  const amort = deal.financing.amortization || 30;
  const monthlyRate = rate / 12;
  const totalPayments = amort * 12;
  const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);
  const annualDebtService = Math.round(monthlyPayment * 12);
  const dscr = parseFloat((noi / annualDebtService).toFixed(2));
  const equityRequired = purchasePrice - loanAmount;
  const cashFlow = noi - annualDebtService;
  const cashOnCash = parseFloat((cashFlow / equityRequired).toFixed(3));
  const debtYield = parseFloat((noi / loanAmount).toFixed(3));

  // Simplified IRR estimate (5-year hold, 5% exit cap, 3% rent growth)
  const exitCapRate = capRate + 0.005;
  const year5NOI = noi * Math.pow(1.03, 5);
  const exitValue = year5NOI / exitCapRate;
  const netProceeds = exitValue * 0.97 - loanAmount * 0.95; // approx remaining balance
  const totalReturn = cashFlow * 5 + netProceeds;
  const equityMultiple = parseFloat(((equityRequired + totalReturn) / equityRequired).toFixed(2));
  const irr = parseFloat((Math.pow(equityMultiple, 1 / 5) - 1).toFixed(3));

  return {
    financialModel: {
      purchasePrice: purchasePrice,
      pricePerUnit: Math.round(purchasePrice / units),
      noi: Math.round(noi),
      capRate: capRate,
      dscr: dscr,
      ltv: targetLTV,
      cashOnCash: cashOnCash,
      irr: irr,
      equityMultiple: equityMultiple,
      debtYield: debtYield,
      debtService: annualDebtService
    },
    scenarios: {
      totalScenarios: 27,
      scenariosPassingAll: Math.round(randomBetween(18, 24)),
      baseCaseIRR: irr,
      worstCaseIRR: parseFloat((irr * 0.5).toFixed(3)),
      bestCaseIRR: parseFloat((irr * 1.5).toFixed(3))
    },
    recommendation: dscr >= 1.25 ? 'APPROVE' : (dscr >= 1.0 ? 'CONDITIONAL' : 'REJECT')
  };
}

function generateFinancingData(deal, uwData) {
  const purchasePrice = uwData.financialModel.purchasePrice;
  const ltv = uwData.financialModel.ltv;
  const loanAmount = Math.round(purchasePrice * ltv);
  const rate = deal.financing.estimatedRate || 0.065;

  return {
    bestQuote: {
      lender: 'Freddie Mac Optigo',
      rate: parseFloat((rate - 0.008).toFixed(4)),
      ltv: ltv,
      loanAmount: loanAmount,
      term: deal.financing.loanTerm || 10,
      amortization: deal.financing.amortization || 30,
      prepayment: 'yield-maintenance',
      originationFee: 0.01
    },
    lenderCount: 8,
    quotesReceived: 5,
    totalCostOfCapital: parseFloat((rate - 0.004).toFixed(4))
  };
}

function generateLegalData(deal) {
  return {
    psaStatus: 'EXECUTED',
    titleStatus: 'CLEAR',
    estoppelReturnRate: parseFloat(randomBetween(0.84, 0.94).toFixed(2)),
    insuranceStatus: 'BOUND',
    loanDocsStatus: 'EXECUTED',
    transferDocsStatus: 'PREPARED'
  };
}

function generateClosingData(deal, uwData, financingData) {
  const purchasePrice = uwData.financialModel.purchasePrice;
  const loanAmount = financingData.bestQuote.loanAmount;
  const closingCosts = deal.financials.estimatedClosingCosts || Math.round(purchasePrice * 0.02);
  const prorations = Math.round(purchasePrice * 0.0014);
  const equityRequired = purchasePrice - loanAmount + closingCosts;

  return {
    readinessVerdict: 'GO',
    purchasePrice: purchasePrice,
    loanAmount: loanAmount,
    equityRequired: equityRequired,
    closingCosts: closingCosts,
    prorations: prorations,
    closingDate: deal.timeline.closingDate || '2024-07-15'
  };
}

// ------------------------------------------------------------------
// Build the checkpoint
// ------------------------------------------------------------------
function buildCheckpoint(deal) {
  const dealId = deal.dealId || 'DEAL-GEN-001';
  const dealName = deal.dealName ? deal.dealName + ' Acquisition' : 'Synthetic Deal Acquisition';
  const units = deal.property.totalUnits || 200;
  const strategy = deal.investmentStrategy || 'core-plus';

  const startTime = deal.timeline.ddStartDate
    ? new Date(deal.timeline.ddStartDate + 'T08:00:00Z')
    : new Date('2024-06-15T08:00:00Z');

  // Determine which phases to complete
  const targetPhaseIdx = phaseFlag === 'all'
    ? PHASE_ORDER.length - 1
    : PHASE_ORDER.indexOf(phaseFlag);

  if (targetPhaseIdx === -1) {
    console.error(`Unknown phase: ${phaseFlag}. Use one of: ${PHASE_ORDER.join(', ')}, all`);
    process.exit(1);
  }

  const isPartial = statusFlag === 'in-progress';

  // Generate data for completed phases
  const ddData = generateDDData(deal);
  const uwData = targetPhaseIdx >= 1 ? generateUWData(deal, ddData) : null;
  const financingData = targetPhaseIdx >= 2 ? generateFinancingData(deal, uwData) : null;
  const legalData = targetPhaseIdx >= 3 ? generateLegalData(deal) : null;
  const closingData = targetPhaseIdx >= 4 ? generateClosingData(deal, uwData, financingData) : null;

  // Build phase timeline - ~75 min per phase
  const phaseMinutes = [135, 75, 60, 75, 45]; // DD, UW, Fin, Legal, Closing
  let cumulativeMinutes = 0;

  function buildPhase(phaseKey, phaseIdx, agentNames, dataForDownstream, verdict, riskScore) {
    const phaseStart = isoTimestamp(startTime, cumulativeMinutes);
    cumulativeMinutes += phaseMinutes[phaseIdx];
    const phaseEnd = isoTimestamp(startTime, cumulativeMinutes);

    const isTarget = phaseIdx === targetPhaseIdx;
    const isCompleted = phaseIdx < targetPhaseIdx || (phaseIdx === targetPhaseIdx && !isPartial);
    const isInProgress = isTarget && isPartial;
    const isPending = phaseIdx > targetPhaseIdx;

    if (isPending) {
      const agentStatuses = {};
      agentNames.forEach(a => { agentStatuses[a] = 'PENDING'; });
      return {
        status: 'PENDING',
        startedAt: null,
        completedAt: null,
        verdict: null,
        agentStatuses: agentStatuses,
        redFlagCount: 0,
        dataGapCount: 0,
        riskScore: 0,
        dataForDownstream: {}
      };
    }

    if (isInProgress) {
      // Simulate partial completion: half agents done, rest running/pending
      const agentStatuses = {};
      const halfIdx = Math.ceil(agentNames.length / 2);
      agentNames.forEach((a, i) => {
        if (i < halfIdx) agentStatuses[a] = 'COMPLETED';
        else if (i === halfIdx) agentStatuses[a] = 'RUNNING';
        else agentStatuses[a] = 'PENDING';
      });

      return {
        status: 'RUNNING',
        startedAt: phaseStart,
        completedAt: null,
        verdict: null,
        agentStatuses: agentStatuses,
        redFlagCount: 0,
        dataGapCount: 0,
        riskScore: 0,
        dataForDownstream: {}
      };
    }

    // Completed phase
    const agentStatuses = {};
    agentNames.forEach(a => { agentStatuses[a] = 'COMPLETED'; });

    return {
      status: 'COMPLETE',
      startedAt: phaseStart,
      completedAt: phaseEnd,
      verdict: verdict,
      agentStatuses: agentStatuses,
      redFlagCount: phaseKey === 'dueDiligence' ? 2 : 0,
      dataGapCount: phaseKey === 'dueDiligence' ? 1 : 0,
      riskScore: riskScore,
      dataForDownstream: dataForDownstream || {}
    };
  }

  const phases = {};

  cumulativeMinutes = 0;
  phases.dueDiligence = buildPhase('dueDiligence', 0, PHASE_AGENTS.dd, ddData, 'CONDITIONAL', 78);
  phases.underwriting = buildPhase('underwriting', 1, PHASE_AGENTS.uw, uwData, 'PASS', 82);
  phases.financing = buildPhase('financing', 2, PHASE_AGENTS.financing, financingData, 'PASS', 88);
  phases.legal = buildPhase('legal', 3, PHASE_AGENTS.legal, legalData, 'PASS', 92);
  phases.closing = buildPhase('closing', 4, PHASE_AGENTS.closing, closingData, 'GO', 95);

  // Calculate overall progress
  const completedPhases = Object.values(phases).filter(p => p.status === 'COMPLETE').length;
  const runningPhases = Object.values(phases).filter(p => p.status === 'RUNNING').length;
  const overallProgress = Math.round((completedPhases / 5) * 100 + (runningPhases > 0 ? 10 : 0));
  const allComplete = completedPhases === 5;
  const lastUpdatedAt = allComplete
    ? isoTimestamp(startTime, cumulativeMinutes)
    : isoTimestamp(startTime, Math.max(0, cumulativeMinutes));
  const currentPhaseEntry = Object.entries(phases).find(([, phase]) => phase.status === 'RUNNING');

  const checkpoint = {
    dealId: dealId,
    dealName: dealName,
    property: {
      name: deal.dealName || 'Synthetic Property',
      address: [deal.property.address, deal.property.city, deal.property.state, deal.property.zip].filter(Boolean).join(', '),
      units: units,
      yearBuilt: deal.property.yearBuilt || 1998,
      type: deal.property.propertyType || 'multifamily',
      class: 'B'
    },
    strategy: strategy,
    status: allComplete ? 'COMPLETE' : (runningPhases > 0 ? 'RUNNING' : 'PENDING'),
    currentPhase: currentPhaseEntry ? currentPhaseEntry[0] : null,
    overallProgress: allComplete ? 100 : overallProgress,
    overallVerdict: allComplete ? 'CONDITIONAL' : null,
    startedAt: isoTimestamp(startTime, 0),
    lastUpdatedAt,
    completedAt: allComplete ? isoTimestamp(startTime, cumulativeMinutes) : null,
    traceId: `${dealId}-${Date.now()}`,
    phases: phases,
    events: []
  };

  return checkpoint;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
function main() {
  // Load deal config
  if (!fs.existsSync(dealPath)) {
    console.error(`Deal config not found: ${dealPath}`);
    process.exit(1);
  }
  const deal = JSON.parse(fs.readFileSync(dealPath, 'utf8'));
  console.log(`Loaded deal config: ${deal.dealName || deal.dealId || 'unknown'}`);
  console.log(`Phase target: ${phaseFlag}, Status: ${statusFlag}`);

  // Generate checkpoint
  const checkpoint = buildCheckpoint(deal);

  // Determine output path
  const outputPathArg = getArg('--output', null);
  const outputFile = outputPathArg
    ? path.resolve(BASE_DIR, outputPathArg)
    : path.join(BASE_DIR, 'data', 'status', `${checkpoint.dealId}.json`);

  // Ensure output directory exists
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputFile, JSON.stringify(checkpoint, null, 2));
  console.log(`\nCheckpoint written to: ${outputFile}`);
  console.log(`  Deal: ${checkpoint.dealName}`);
  console.log(`  Status: ${checkpoint.status}`);
  console.log(`  Progress: ${checkpoint.overallProgress}%`);
  console.log(`  Phases completed: ${Object.values(checkpoint.phases).filter(p => phaseRuntimeStatus(p.status) === 'COMPLETE').length}/5`);
  console.log(`  Overall verdict: ${checkpoint.overallVerdict || 'N/A'}`);
}

main();
