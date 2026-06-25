const {
  nowIso,
  safeNumber,
  safeString,
  round,
  randBetween,
  scenarioAdjustments,
  buildFlag,
  buildDataGap
} = require('./runtime-core');
const { buildScenarioMatrix, buildTenYearProForma } = require('./workpaper-renderer');

function generateDueDiligenceData(deal, scenario, rng) {
  const adj = scenarioAdjustments(scenario);
  const units = safeNumber(deal?.property?.totalUnits, 180);
  const occupancy = Math.max(
    0.55,
    Math.min(0.98, safeNumber(deal?.financials?.inPlaceOccupancy, 0.92) + adj.occupancyShift)
  );
  const askingPrice = safeNumber(deal?.financials?.askingPrice, 28000000);
  const pricePerUnit = askingPrice / Math.max(units, 1);
  const trRevenue = safeNumber(deal?.financials?.trailingT12Revenue, units * 12 * 1500 * occupancy);
  const trExpenses = safeNumber(
    deal?.financials?.trailingT12Expenses,
    trRevenue * (0.42 + adj.expenseInflationShift)
  );
  const avgInPlaceRent = trRevenue / Math.max(units * 12 * occupancy, 1);
  const avgMarketRent = avgInPlaceRent * randBetween(rng, 1.04, 1.14);
  const lossToLease = (avgMarketRent - avgInPlaceRent) * units * occupancy * 12;
  const lossToLeasePct = (avgMarketRent - avgInPlaceRent) / Math.max(avgMarketRent, 1);

  const riskScore = Math.max(
    45,
    Math.min(
      95,
      round(86 - (1 - occupancy) * 90 - adj.capRateShiftBps * 0.08 + randBetween(rng, -4, 4), 0)
    )
  );
  const redFlags = [];
  const dataGaps = [];
  if (occupancy < 0.85) {
    redFlags.push(
      buildFlag(
        'dd-occupancy',
        'HIGH',
        'OPERATIONS',
        `Occupancy at ${round(occupancy * 100, 1)}% is below threshold`,
        'Could suppress early cash flow and debt sizing',
        'rent-roll-analyst'
      )
    );
  }
  if (adj.environmentalRisk === 'high') {
    redFlags.push(
      buildFlag(
        'dd-environment',
        'CRITICAL',
        'ENVIRONMENTAL',
        'Environmental phase indicates elevated remediation risk',
        'May require holdback and close delay',
        'environmental-review'
      )
    );
  }
  if (randBetween(rng, 0, 1) > 0.66) {
    dataGaps.push(
      buildDataGap(
        'dd-missing-unit-audits',
        'Unit-level audit documents missing for sample set',
        'rent-roll-analyst'
      )
    );
  }

  const marketDetail = {
    msaPopulation: Math.round(randBetween(rng, 1200000, 5400000)),
    populationGrowth: round(0.022 + adj.rentGrowthShift + randBetween(rng, -0.003, 0.006), 4),
    populationGrowthRank: 'Top quartile growth market',
    jobGrowth: round(0.019 + adj.rentGrowthShift + randBetween(rng, -0.004, 0.006), 4),
    unemployment: round(randBetween(rng, 0.032, 0.058), 4),
    marketVacancy: round(randBetween(rng, 0.045, 0.085), 4),
    marketPPU: round(pricePerUnit * randBetween(rng, 1.08, 1.24), 0),
    marketCapRateRange: `${round(5.0 + adj.capRateShiftBps / 100, 1)}% - ${round(
      6.4 + adj.capRateShiftBps / 100,
      1
    )}%`,
    supplyDelivered2025: Math.round(randBetween(rng, 500, 2600)),
    supplyForecast2026: `${Math.round(randBetween(rng, 900, 3400))} units`,
    absorptionNote:
      occupancy > 0.9
        ? 'Absorption remains healthy across comparable assets.'
        : 'Absorption soft in new supply pockets.',
    marketCycle: adj.capRateShiftBps > 50 ? 'Late cycle repricing' : 'Stable expansion',
    concessionRate: round(randBetween(rng, 0.02, 0.08), 3),
    concessionNote: 'Concessions concentrated in newest competitive product.',
    rentGrowthTrailing: round(0.029 + adj.rentGrowthShift, 4),
    rentGrowthForecast2026: `${round(2.3 + adj.rentGrowthShift * 100, 1)}% to ${round(
      3.9 + adj.rentGrowthShift * 100,
      1
    )}%`,
    rentGrowthLongTerm: round(0.028 + adj.rentGrowthShift, 4),
    sb38Note:
      adj.legalComplexity === 'high'
        ? 'Permit processing times elevated.'
        : 'No material permitting bottleneck.'
  };

  const capRateRange = {
    low: round(0.05 + adj.capRateShiftBps / 10000, 4),
    mid: round(0.056 + adj.capRateShiftBps / 10000, 4),
    high: round(0.065 + adj.capRateShiftBps / 10000, 4)
  };

  return {
    propertyName: safeString(deal?.dealName, `${deal?.dealId || 'Deal'} Property`),
    yearBuilt: safeNumber(deal?.property?.yearBuilt, 1998),
    construction: safeNumber(deal?.property?.yearBuilt, 1998) < 1990 ? 'Legacy Frame' : 'Updated Frame',
    currentOwner: safeString(deal?.seller?.entity, 'Seller Entity'),
    occupancy: round(occupancy, 4),
    zoningCompliant: true,
    zoning: 'MF-24',
    unitMix: Array.isArray(deal?.property?.unitMix?.types) ? deal.property.unitMix.types : [],
    avgInPlaceRent: round(avgInPlaceRent, 0),
    avgMarketRent: round(avgMarketRent, 0),
    lossToLease: round(lossToLease, 0),
    lossToLeasePct: round(lossToLeasePct, 4),
    pricePerUnit: round(pricePerUnit, 0),
    marketPPU: marketDetail.marketPPU,
    populationGrowth: marketDetail.populationGrowth,
    supplyPipeline: adj.capRateShiftBps > 50 ? 'Elevated near-term supply pressure' : 'Moderate supply pipeline',
    jurisdiction: adj.legalComplexity === 'high' ? 'Complex jurisdiction' : 'Favorable jurisdiction',
    rentControl: false,
    renovationBudget: safeNumber(deal?.financials?.renovationBudget, units * 4500),
    renovationPerUnit: round(
      safeNumber(deal?.financials?.renovationBudget, units * 4500) / Math.max(units, 1),
      0
    ),
    marketVacancy: marketDetail.marketVacancy,
    supplyDelivered2025: marketDetail.supplyDelivered2025,
    supplyForecast2026: marketDetail.supplyForecast2026,
    absorptionNote: marketDetail.absorptionNote,
    marketCycle: marketDetail.marketCycle,
    rentGrowthTrailing: marketDetail.rentGrowthTrailing,
    rentGrowthForecast: round(0.031 + adj.rentGrowthShift, 4),
    environmentalRisk: adj.environmentalRisk === 'high' ? 'Elevated' : 'Manageable',
    floodZone: adj.environmentalRisk === 'high' ? 'AE' : 'X',
    opexBenchmark: `${round((trExpenses / Math.max(trRevenue, 1)) * 100, 1)}% expense ratio`,
    opexBreakdown: [
      { category: 'Taxes', amount: round(trExpenses * 0.31, 0), pct: 0.31 },
      { category: 'Insurance', amount: round(trExpenses * 0.08, 0), pct: 0.08 },
      { category: 'Utilities', amount: round(trExpenses * 0.13, 0), pct: 0.13 },
      { category: 'Repairs', amount: round(trExpenses * 0.16, 0), pct: 0.16 },
      { category: 'Payroll', amount: round(trExpenses * 0.17, 0), pct: 0.17 },
      { category: 'Other', amount: round(trExpenses * 0.15, 0), pct: 0.15 }
    ],
    rentRoll: {
      totalUnits: units,
      occupancy: round(occupancy, 4),
      avgRent: round(avgInPlaceRent, 0),
      avgMarketRent: round(avgMarketRent, 0),
      lossToLease: round(lossToLease, 0),
      lossToLeasePercent: round(lossToLeasePct, 4)
    },
    expenses: {
      totalOpEx: round(trExpenses, 0),
      opExPerUnit: round(trExpenses / Math.max(units, 1), 0),
      opExRatio: round(trExpenses / Math.max(trRevenue, 1), 4),
      adjustedExpenses: {
        taxes: round(trExpenses * 0.31, 0),
        insurance: round(trExpenses * 0.08, 0),
        utilities: round(trExpenses * 0.13, 0),
        repairs: round(trExpenses * 0.16, 0),
        management: round(trExpenses * 0.09, 0),
        payroll: round(trExpenses * 0.17, 0),
        admin: round(trExpenses * 0.03, 0),
        marketing: round(trExpenses * 0.02, 0),
        contractServices: round(trExpenses * 0.01, 0),
        other: round(trExpenses * 0.01, 0)
      }
    },
    physical: {
      condition: safeNumber(deal?.property?.yearBuilt, 1998) < 1990 ? 'FAIR' : 'GOOD',
      conditionScore: safeNumber(deal?.property?.yearBuilt, 1998) < 1990 ? 68 : 82,
      capExTotal5Year: round(safeNumber(deal?.financials?.renovationBudget, units * 4500) * 1.2, 0)
    },
    title: {
      status: adj.legalComplexity === 'high' ? 'ISSUES' : 'CLEAR',
      zoningCompliance: 'COMPLIANT'
    },
    market: {
      submarket: `${safeString(deal?.property?.city, 'Metro')} Submarket`,
      capRateRange,
      populationGrowth: marketDetail.populationGrowth,
      rentGrowthTrailing12: marketDetail.rentGrowthTrailing,
      rentGrowthProjected: round(0.033 + adj.rentGrowthShift, 4)
    },
    tenants: {
      creditSummary: occupancy < 0.85 ? 'Mixed credit profile' : 'Stable tenant profile',
      concentrationRisk: occupancy < 0.8 ? 'MEDIUM' : 'LOW',
      delinquencyRate: round(randBetween(rng, 0.03, occupancy < 0.8 ? 0.1 : 0.06), 4)
    },
    environmental: {
      phase1Status: adj.environmentalRisk === 'high' ? 'FURTHER_ACTION' : 'CLEAN',
      floodZone: adj.environmentalRisk === 'high' ? 'AE' : 'X',
      regulatoryCompliance: adj.environmentalRisk === 'high' ? 'CONDITIONAL' : 'COMPLIANT'
    },
    marketDetail,
    riskScore,
    redFlagCount: redFlags.length,
    dataGapCount: dataGaps.length,
    redFlags,
    dataGaps,
    agentFindings: {
      'rent-roll-analyst': { status: 'COMPLETE', finding: `Validated ${units} units and rent strata.` },
      'opex-analyst': {
        status: 'COMPLETE',
        finding: `Expense ratio at ${round((trExpenses / Math.max(trRevenue, 1)) * 100, 1)}%.`
      },
      'physical-inspection': {
        status: 'COMPLETE',
        finding: 'Capex schedule drafted across five-year horizon.'
      },
      'legal-title-review': {
        status: 'COMPLETE',
        finding:
          adj.legalComplexity === 'high'
            ? 'Title issues require cure plan.'
            : 'Title clear with standard exceptions.'
      },
      'market-study': {
        status: 'COMPLETE',
        finding: `Market cap range ${capRateRange.low}-${capRateRange.high}.`
      },
      'tenant-credit': {
        status: 'COMPLETE',
        finding: 'Tenant delinquency and retention benchmarks evaluated.'
      },
      'environmental-review': {
        status: 'COMPLETE',
        finding:
          adj.environmentalRisk === 'high'
            ? 'Environmental follow-up required.'
            : 'No material environmental constraints.'
      }
    }
  };
}

const investmentThresholds = require('../../config/thresholds.json');

const SCENARIO_TO_STRATEGY = {
  core: 'core',
  'core-plus': 'core-plus',
  'value-add': 'value-add',
  distressed: 'opportunistic',
  opportunistic: 'opportunistic'
};

function generateUnderwritingData(deal, dd, scenario, rng) {
  const adj = scenarioAdjustments(scenario);
  const purchasePrice = safeNumber(deal?.financials?.askingPrice, 28000000);
  const renovationBudget = safeNumber(deal?.financials?.renovationBudget, safeNumber(dd?.renovationBudget, 0));
  const closingCosts = safeNumber(deal?.financials?.estimatedClosingCosts, purchasePrice * 0.02);
  const totalBasis = purchasePrice + renovationBudget + closingCosts;
  const units = safeNumber(deal?.property?.totalUnits, safeNumber(dd?.rentRoll?.totalUnits, 180));
  const year1Revenue = safeNumber(deal?.financials?.trailingT12Revenue, safeNumber(dd?.avgInPlaceRent, 1400) * units * safeNumber(dd?.occupancy, 0.92) * 12);
  const year1Expenses = safeNumber(deal?.financials?.trailingT12Expenses, safeNumber(dd?.expenses?.totalOpEx, year1Revenue * 0.42));
  const year1NOI = safeNumber(deal?.financials?.currentNOI, year1Revenue - year1Expenses);
  const stabilizedNOI = safeNumber(deal?.financials?.proFormaNOI, year1NOI * (1.03 + adj.rentGrowthShift));
  const baseLTV = safeNumber(deal?.financing?.targetLTV, 0.7);
  const debtRequest = purchasePrice * baseLTV;
  const rate = safeNumber(deal?.financing?.estimatedRate, 0.0625) + adj.lenderSpreadShiftBps / 10000;
  const amort = safeNumber(deal?.financing?.amortization, 30);
  const monthlyRate = rate / 12;
  const payments = amort * 12;
  const monthlyPmt =
    monthlyRate === 0
      ? debtRequest / payments
      : (debtRequest * monthlyRate * (1 + monthlyRate) ** payments) / ((1 + monthlyRate) ** payments - 1);
  const annualDebtService = monthlyPmt * 12;
  const dscr = year1NOI / Math.max(annualDebtService, 1);
  const equityRequired = totalBasis - debtRequest;
  const cashOnCash = (year1NOI - annualDebtService) / Math.max(equityRequired, 1);
  const holdYears = Math.max(3, safeNumber(deal?.targetHoldPeriod, 5));
  const exitCap = Math.max(0.045, safeNumber(dd?.goingInCapRate, 0.06) + 0.005 + adj.capRateShiftBps / 10000);
  const generatedProForma = buildTenYearProForma(deal);
  const scenarios = buildScenarioMatrix(deal);
  const baseScenario =
    scenarios.find((s) => s.scenario === 'RENT_BASE_VACANCY_BASE_EXIT_BASE') || scenarios[0];
  const exitNOI = safeNumber(generatedProForma[5]?.noi, stabilizedNOI * (1 + 0.024) ** holdYears);
  const exitValue = exitNOI / exitCap;
  const netSale = exitValue * 0.975 - debtRequest * 0.88;
  const totalCash = (year1NOI - annualDebtService) * holdYears + netSale;
  const equityMultiple = safeNumber(baseScenario?.equityMultiple, (totalCash + equityRequired) / Math.max(equityRequired, 1));
  const leveragedIRR = safeNumber(baseScenario?.irr, Math.pow(Math.max(0.01, equityMultiple), 1 / holdYears) - 1);
  const sortedIrr = scenarios.map((s) => s.irr).sort((a, b) => a - b);
  const passCount = scenarios.filter((s) => s.pass).length;
  const passRate = passCount / scenarios.length;

  const redFlags = [];
  const dataGaps = [];
  if (dscr < 1.2) {
    redFlags.push(
      buildFlag(
        'uw-dscr',
        'HIGH',
        'UNDERWRITING',
        `Base DSCR ${round(dscr, 2)}x is below preferred cushion`,
        'Can reduce lender proceeds and increase risk',
        'financial-model-builder'
      )
    );
  }
  if (passRate < 0.6) {
    redFlags.push(
      buildFlag(
        'uw-pass-rate',
        'HIGH',
        'SENSITIVITY',
        `Scenario pass-rate ${round(passRate * 100, 1)}% below target`,
        'Increases downside loss probability',
        'scenario-analyst'
      )
    );
  }
  // P-V3: emit a determinable over-leverage flag so a real, detectable risk
  // (high LTV / negative leverage) surfaces in the red-flag set instead of being
  // silently absorbed into the verdict.
  const maxConditionalLtv = safeNumber(investmentThresholds?.primaryCriteria?.ltv?.maxConditional, 0.8);
  if (baseLTV >= maxConditionalLtv) {
    redFlags.push(
      buildFlag(
        'uw-leverage',
        'HIGH',
        'FINANCING',
        `Going-in leverage at ${round(baseLTV * 100, 1)}% LTV exceeds the ${round(maxConditionalLtv * 100, 0)}% conservative ceiling`,
        'Elevated LTV reduces downside cushion and can signal negative leverage',
        'financial-model-builder'
      )
    );
  }
  if (randBetween(rng, 0, 1) > 0.7) {
    dataGaps.push(
      buildDataGap(
        'uw-rent-history',
        'Historical monthly rent trend missing for two periods',
        'financial-model-builder'
      )
    );
  }
  const riskScore = Math.max(
    45,
    Math.min(96, round(88 + passRate * 8 - redFlags.length * 7 + randBetween(rng, -3, 3), 0))
  );

  // P-V1: Threshold-driven IC verdict. Key go/no-go off the DETERMINABLE,
  // trustworthy metrics (DSCR, LTV, occupancy, going-in cap, risk score, HIGH
  // red flags) and config/thresholds.json — NOT the model-dependent leveraged
  // IRR (a wide-tolerance modeled estimate that must never be the sole gate).
  const strategyKey =
    SCENARIO_TO_STRATEGY[safeString(scenario?.name, 'value-add')] || 'value-add';
  const strat =
    investmentThresholds.strategyThresholds[strategyKey] ||
    investmentThresholds.strategyThresholds['value-add'];
  const goingInCapRate = year1NOI / Math.max(purchasePrice, 1);
  const verdictOccupancy = Math.max(
    0,
    Math.min(1, safeNumber(deal?.financials?.inPlaceOccupancy, safeNumber(dd?.occupancy, 0.9)))
  );
  const hasBridgeStructure =
    Boolean(deal?.financing?.bridge) ||
    safeString(deal?.financing?.loanType, '').toLowerCase().includes('bridge');
  const highRedFlagCount = redFlags.filter(
    (flag) => flag && (flag.severity === 'HIGH' || flag.severity === 'CRITICAL')
  ).length;
  const hasDealbreaker =
    dscr < 0.8 ||
    baseLTV >= 1.0 ||
    (verdictOccupancy < 0.7 && !hasBridgeStructure);
  // A clean PASS requires DSCR clearing BOTH the strategy minimum and the global
  // "strong DSCR" bar (primaryCriteria.dscr.pass). DSCR between the dealbreaker
  // floor and this bar is marginal → CONDITIONAL, not a go.
  const passDscr = Math.max(
    safeNumber(strat.minDSCR, 1.2),
    safeNumber(investmentThresholds?.primaryCriteria?.dscr?.pass, 1.25)
  );
  const meetsPass =
    dscr >= passDscr &&
    highRedFlagCount <= safeNumber(strat.maxHighRisks, 1) &&
    goingInCapRate >= safeNumber(investmentThresholds?.secondaryCriteria?.capRate?.marginal, 0.045) &&
    riskScore >= safeNumber(strat.minRiskScore, 60);
  const verdict = hasDealbreaker ? 'FAIL' : meetsPass ? 'PASS' : 'CONDITIONAL';

  return {
    baseCase: {
      purchasePrice: round(purchasePrice, 0),
      totalBasis: round(totalBasis, 0),
      goingInCapRate: round(year1NOI / Math.max(purchasePrice, 1), 4),
      stabilizedCapRate: round(stabilizedNOI / Math.max(totalBasis, 1), 4),
      year1NOI: round(year1NOI, 0),
      stabilizedNOI: round(stabilizedNOI, 0),
      leveragedIRR: round(leveragedIRR, 4),
      equityMultiple: round(equityMultiple, 3),
      cashOnCash: round(cashOnCash, 4),
      equityRequired: round(equityRequired, 0),
      debtRequest: round(debtRequest, 0),
      targetLTV: round(baseLTV, 4),
      targetDSCR: round(dscr, 3)
    },
    scenarioSummary: {
      baseIRR: round(leveragedIRR, 4),
      worstIRR: sortedIrr[0],
      bestIRR: sortedIrr[sortedIrr.length - 1],
      medianIRR: sortedIrr[Math.floor(sortedIrr.length / 2)],
      passRate: round(passRate, 4),
      dscrRange: {
        min: round(Math.min(...scenarios.map((s) => s.dscr)), 3),
        max: round(Math.max(...scenarios.map((s) => s.dscr)), 3)
      }
    },
    debtSizing: {
      requestedLoanAmount: round(debtRequest, 0),
      maxLTV: round(baseLTV, 4),
      constrainingMetric: dscr < 1.25 ? 'DSCR' : 'LTV',
      interestRate: round(rate, 5),
      term: safeNumber(deal?.financing?.loanTerm, 10),
      amortization: amort,
      ioPeriod: safeNumber(deal?.financing?.ioPeriod, 0)
    },
    capExBudget: {
      total5Year: round(safeNumber(dd?.physical?.capExTotal5Year, renovationBudget), 0),
      yearlySchedule: [
        round(renovationBudget * 0.4, 0),
        round(renovationBudget * 0.22, 0),
        round(renovationBudget * 0.16, 0),
        round(renovationBudget * 0.12, 0),
        round(renovationBudget * 0.1, 0)
      ],
      immediateNeeds: round(renovationBudget * 0.34, 0)
    },
    proForma: generatedProForma.map((row) => ({
      year: row.year,
      revenue: round(row.revenue, 0),
      expenses: round(row.expenses, 0),
      noi: round(row.noi, 0),
      debtService: round(row.debtService, 0),
      dscr: round(row.dscr, 3),
      cashFlow: round(row.cashFlow, 0)
    })),
    proFormaAssumptions: `Revenue growth ${(3 + adj.rentGrowthShift * 100).toFixed(
      1
    )}%, expense growth ${(2.4 + adj.expenseInflationShift * 100).toFixed(
      1
    )}%, exit cap ${(exitCap * 100).toFixed(2)}%.`,
    returnMetrics: [
      {
        metric: 'Leveraged IRR',
        value: `${round(leveragedIRR * 100, 1)}%`,
        target: `${round(safeNumber(deal?.targetIRR, 0.14) * 100, 1)}%`
      },
      {
        metric: 'Equity Multiple',
        value: `${round(equityMultiple, 2)}x`,
        target: `${round(safeNumber(deal?.targetEquityMultiple, 1.8), 2)}x`
      },
      {
        metric: 'Cash-on-Cash',
        value: `${round(cashOnCash * 100, 1)}%`,
        target: `${round(safeNumber(deal?.targetCashOnCash, 0.07) * 100, 1)}%`
      }
    ],
    exitAnalysis: {
      holdYears,
      exitCapRate: round(exitCap, 4),
      exitNOI: round(exitNOI, 0),
      grossExitValue: round(exitValue, 0),
      netSaleProceeds: round(netSale, 0)
    },
    scenarioMatrix: scenarios,
    icMemoPath: `data/reports/${deal.dealId}/ic-memo.md`,
    modelPath: `data/phase-outputs/${deal.dealId}/underwriting-output.json`,
    scenarioMatrixPath: `data/phase-outputs/${deal.dealId}/underwriting-scenarios.json`,
    verdict,
    conditions:
      dscr < 1.25
        ? ['Consider lower proceeds or add reserve cushion']
        : ['Maintain leasing velocity assumptions'],
    riskScore,
    redFlagCount: redFlags.length,
    dataGapCount: dataGaps.length,
    redFlags,
    dataGaps,
    agentFindings: {
      'financial-model-builder': { status: 'COMPLETE', finding: 'Base-case model calibrated and validated.' },
      'scenario-analyst': {
        status: 'COMPLETE',
        finding: `${passCount}/27 sensitivity scenarios pass constraints.`
      },
      'ic-memo-writer': {
        status: 'COMPLETE',
        finding: 'Investment memo with conditions and downside protections drafted.'
      }
    }
  };
}

function generateFinancingData(deal, uw, scenario, rng) {
  const adj = scenarioAdjustments(scenario);
  const base = uw.baseCase || {};
  const rate =
    safeNumber(uw?.debtSizing?.interestRate, safeNumber(deal?.financing?.estimatedRate, 0.062)) +
    adj.lenderSpreadShiftBps / 10000;
  const ltv = safeNumber(base.targetLTV, safeNumber(deal?.financing?.targetLTV, 0.7));
  const loanAmount = safeNumber(
    uw?.debtSizing?.requestedLoanAmount,
    safeNumber(base.purchasePrice, 0) * ltv
  );
  const amort = safeNumber(
    uw?.debtSizing?.amortization,
    safeNumber(deal?.financing?.amortization, 30)
  );
  const term = safeNumber(uw?.debtSizing?.term, safeNumber(deal?.financing?.loanTerm, 10));
  const ioMonths =
    safeNumber(uw?.debtSizing?.ioPeriod, safeNumber(deal?.financing?.ioPeriod, 0)) * 12;

  const monthlyRate = rate / 12;
  const payments = amort * 12;
  const monthlyPmt =
    monthlyRate === 0
      ? loanAmount / payments
      : (loanAmount * monthlyRate * (1 + monthlyRate) ** payments) /
        ((1 + monthlyRate) ** payments - 1);
  const annualDebtServiceAmort = monthlyPmt * 12;
  const annualDebtServiceIO = loanAmount * rate;
  const year1NOI = safeNumber(base.year1NOI, 0);
  const dscrIO = year1NOI / Math.max(annualDebtServiceIO, 1);
  const dscrAmort = year1NOI / Math.max(annualDebtServiceAmort, 1);

  const candidates = [
    {
      lender: 'Freddie Mac',
      category: 'agency',
      spread: -0.0012,
      recourse: 'non-recourse',
      io: 24
    },
    {
      lender: 'Fannie Mae',
      category: 'agency',
      spread: -0.0009,
      recourse: 'non-recourse',
      io: 18
    },
    {
      lender: 'Regional Bank Group',
      category: 'bank',
      spread: 0.0014,
      recourse: 'partial',
      io: 12
    },
    {
      lender: 'Bridgeline Capital',
      category: 'bridge',
      spread: 0.0078,
      recourse: 'full',
      io: 36
    },
    {
      lender: 'Harbor CMBS',
      category: 'cmbs',
      spread: 0.0025,
      recourse: 'non-recourse',
      io: 0
    }
  ];

  const lenderComparison = candidates.map((l, i) => ({
    rank: i + 1,
    lender: l.lender,
    category: l.category,
    ltv: `${round((ltv + randBetween(rng, -0.03, 0.02)) * 100, 1)}%`,
    ltvValue: round(ltv + randBetween(rng, -0.03, 0.02), 4),
    rate: `${round((rate + l.spread + randBetween(rng, -0.001, 0.0015)) * 100, 3)}%`,
    rateValue: round(rate + l.spread + randBetween(rng, -0.001, 0.0015), 5),
    term: `${term}y`,
    io: `${l.io}m`,
    dscrIO: `${round(dscrIO + randBetween(rng, -0.08, 0.08), 2)}x`,
    dscrIOValue: round(dscrIO + randBetween(rng, -0.08, 0.08), 3),
    status: 'REVIEWED'
  }));
  lenderComparison.sort((a, b) => a.rateValue - b.rateValue || b.ltvValue - a.ltvValue);
  lenderComparison.forEach((l, i) => {
    l.rank = i + 1;
    l.status = i === 0 ? 'SELECTED' : l.dscrIOValue < 1.1 ? 'DISQUALIFIED' : 'REVIEWED';
  });
  const selected = lenderComparison.find((l) => l.status === 'SELECTED') || lenderComparison[0];

  const redFlags = [];
  const dataGaps = [];
  if (dscrAmort < 1.15) {
    redFlags.push(
      buildFlag(
        'fin-dscr',
        'HIGH',
        'FINANCING',
        `Amortizing DSCR ${round(dscrAmort, 2)}x is tight`,
        'Could reduce certainty of execution',
        'quote-comparator'
      )
    );
  }
  if (adj.lenderSpreadShiftBps > 70) {
    redFlags.push(
      buildFlag(
        'fin-spreads',
        'MEDIUM',
        'MARKET',
        'Credit spreads elevated in current debt market',
        'Can compress proceeds and returns',
        'lender-outreach'
      )
    );
  }
  if (randBetween(rng, 0, 1) > 0.74) {
    dataGaps.push(
      buildDataGap(
        'fin-docs',
        'Final third-party report requested by lead lender',
        'lender-outreach'
      )
    );
  }
  const riskScore = Math.max(
    40,
    Math.min(96, round(86 - redFlags.length * 8 + randBetween(rng, -3, 3), 0))
  );

  return {
    selectedLender: selected.lender,
    selectedLenderFull: `${selected.lender} (${selected.category.toUpperCase()})`,
    loanAmount: round(loanAmount, 0),
    ltv: round(ltv, 4),
    rate: round(rate, 5),
    rateType: 'Fixed',
    term,
    amortization: amort,
    interestOnlyMonths: ioMonths,
    annualDebtServiceIO: round(annualDebtServiceIO, 0),
    annualDebtServiceAmort: round(annualDebtServiceAmort, 0),
    dscrIO: round(dscrIO, 3),
    dscrAmort: round(dscrAmort, 3),
    dscrCovenant: 1.2,
    prepayment: 'Yield maintenance',
    recourse: selected.category === 'bank' ? 'Partial recourse' : 'Non-recourse',
    reserves: {
      taxMonthly: round((safeNumber(deal?.financials?.trailingT12Expenses, 0) * 0.31) / 12, 0),
      insuranceMonthly: round(
        (safeNumber(deal?.financials?.trailingT12Expenses, 0) * 0.08) / 12,
        0
      ),
      capexMonthly: round(safeNumber(uw?.capExBudget?.total5Year, 0) / 60, 0),
      renovationEscrow: round(safeNumber(deal?.financials?.renovationBudget, 0) * 0.35, 0)
    },
    lenderComparison,
    quotesReceived: lenderComparison.length,
    bestQuote: {
      lenderName: selected.lender,
      category: selected.category,
      interestRate: selected.rateValue,
      ltv: selected.ltvValue,
      loanAmount: round(loanAmount * (selected.ltvValue / Math.max(ltv, 0.01)), 0),
      dscr: selected.dscrIOValue
    },
    riskScore,
    redFlagCount: redFlags.length,
    dataGapCount: dataGaps.length,
    redFlags,
    dataGaps,
    agentFindings: {
      'lender-outreach': {
        status: 'COMPLETE',
        finding: `Collected ${lenderComparison.length} lender indications.`
      },
      'quote-comparator': {
        status: 'COMPLETE',
        finding: `Selected ${selected.lender} based on weighted ranking.`
      },
      'term-sheet-builder': {
        status: 'COMPLETE',
        finding: 'Term sheet generated with covenant and timeline package.'
      }
    }
  };
}

function generateLegalData(deal, dd, fin, scenario, rng) {
  const adj = scenarioAdjustments(scenario);
  const totalUnits = Math.round(safeNumber(deal?.property?.totalUnits, 120) * 0.9);
  const received = Math.round(
    totalUnits * randBetween(rng, adj.legalComplexity === 'high' ? 0.68 : 0.82, 0.95)
  );
  const returnRate = received / Math.max(totalUnits, 1);
  const discrepancies = Math.round(
    randBetween(
      rng,
      adj.legalComplexity === 'high' ? 9 : 2,
      adj.legalComplexity === 'high' ? 22 : 9
    )
  );

  const redFlags = [];
  const dataGaps = [];
  if (returnRate < 0.8) {
    redFlags.push(
      buildFlag(
        'legal-estoppel',
        'HIGH',
        'LEGAL',
        `Estoppel return rate ${round(returnRate * 100, 1)}% below target`,
        'Can delay lender sign-off',
        'estoppel-tracker'
      )
    );
  }
  if (adj.legalComplexity === 'high') {
    redFlags.push(
      buildFlag(
        'legal-title',
        'CRITICAL',
        'TITLE',
        'Outstanding title curative items remain',
        'Could block closing until cured',
        'title-survey-reviewer'
      )
    );
  }
  if (randBetween(rng, 0, 1) > 0.76) {
    dataGaps.push(
      buildDataGap(
        'legal-entity-docs',
        'One seller entity certificate still pending notarization',
        'transfer-doc-preparer'
      )
    );
  }
  const riskScore = Math.max(
    35,
    Math.min(96, round(84 - redFlags.length * 10 + randBetween(rng, -3, 4), 0))
  );

  const policies = [
    { type: 'General Liability', annual: round(randBetween(rng, 160000, 280000), 0) },
    { type: 'Property', annual: round(randBetween(rng, 190000, 330000), 0) },
    { type: 'Umbrella', annual: round(randBetween(rng, 70000, 140000), 0) }
  ];
  const totalAnnualPremium = policies.reduce((sum, p) => sum + safeNumber(p.annual, 0), 0);

  return {
    agentFindings: {
      'psa-reviewer': { status: 'COMPLETE', finding: 'PSA reviewed and deadlines calendared.' },
      'loan-doc-reviewer': {
        status: 'COMPLETE',
        finding: 'Loan docs align with selected financing terms.'
      },
      'title-survey-reviewer': {
        status: 'COMPLETE',
        finding:
          adj.legalComplexity === 'high'
            ? 'Two title curatives pending.'
            : 'Title and survey package clear.'
      },
      'estoppel-tracker': {
        status: 'COMPLETE',
        finding: `${received}/${totalUnits} estoppels collected.`,
        total: totalUnits,
        received,
        returnRate: round(returnRate, 4),
        minimumRequired: 0.8,
        discrepancies,
        discrepancyNote:
          discrepancies > 0
            ? 'Discrepancies concentrated in concessions and lease dates.'
            : ''
      },
      'insurance-coordinator': {
        status: 'COMPLETE',
        finding: 'Primary insurance coverages bound.',
        policies,
        totalAnnualPremium,
        perUnit: round(totalAnnualPremium / Math.max(safeNumber(deal?.property?.totalUnits, 1), 1), 0)
      },
      'transfer-doc-preparer': {
        status: 'COMPLETE',
        finding:
          dataGaps.length > 0
            ? 'Transfer package drafted pending one entity certificate.'
            : 'Transfer package complete for signature routing.',
        documents: [
          'Deed',
          'Bill of Sale',
          'Assignment of Leases',
          'Tenant Notices',
          'FIRPTA Certificate'
        ]
      }
    },
    psaStatus: { reviewStatus: 'REVIEWED' },
    titleStatus: { status: adj.legalComplexity === 'high' ? 'EXCEPTIONS_NOTED' : 'CLEAR' },
    estoppelStatus: { returnRate: round(returnRate, 4) },
    insuranceStatus: { overallStatus: 'ALL_BOUND' },
    transferDocStatus: { overallReadiness: dataGaps.length > 0 ? 'DRAFT' : 'READY' },
    closingChecklistStatus: {
      preClosingItems: { completed: dataGaps.length > 0 ? 16 : 18, total: 18 },
      closingDayItems: { completed: 9, total: 11 },
      postClosingItems: { identified: 4, total: 6 },
      criticalPathItems: dataGaps.length > 0 ? ['Entity authorization package'] : ['Rate lock confirmation']
    },
    riskScore,
    redFlagCount: redFlags.length,
    dataGapCount: dataGaps.length,
    redFlags,
    dataGaps
  };
}

function generateClosingData(deal, dd, uw, fin, legal, scenario, rng) {
  const purchasePrice = safeNumber(
    uw?.baseCase?.purchasePrice,
    safeNumber(deal?.financials?.askingPrice, 0)
  );
  const loanAmount = safeNumber(
    fin?.loanAmount,
    purchasePrice * safeNumber(deal?.financing?.targetLTV, 0.7)
  );
  const closingCosts = safeNumber(deal?.financials?.estimatedClosingCosts, purchasePrice * 0.02);
  const equityRequired = Math.max(0, purchasePrice - loanAmount + closingCosts);

  const preClosingStatus = {
    completedCount: legal?.transferDocStatus?.overallReadiness === 'READY' ? 6 : 5,
    total: 6,
    pendingItems:
      legal?.transferDocStatus?.overallReadiness === 'READY'
        ? []
        : ['Entity authorization package completion']
  };

  const sources = [
    { item: 'Senior Loan Proceeds', amount: loanAmount },
    { item: 'Buyer Equity', amount: equityRequired },
    {
      item: 'Security Deposit Credit',
      amount: round(safeNumber(deal?.property?.totalUnits, 0) * randBetween(rng, 400, 900), 0)
    }
  ];
  const uses = [
    { item: 'Purchase Price', amount: purchasePrice },
    { item: 'Closing Costs', amount: closingCosts },
    { item: 'Tax Proration', amount: round(purchasePrice * randBetween(rng, 0.00045, 0.0012), 0) },
    {
      item: 'Insurance Proration',
      amount: round(purchasePrice * randBetween(rng, 0.0002, 0.0006), 0)
    }
  ];
  const totalSources = sources.reduce((sum, row) => sum + safeNumber(row.amount, 0), 0);
  const totalUses = uses.reduce((sum, row) => sum + safeNumber(row.amount, 0), 0);
  if (totalSources !== totalUses) {
    uses.push({
      item: totalSources > totalUses ? 'Buyer Return at Close' : 'Additional Equity True-Up',
      amount: Math.abs(totalSources - totalUses)
    });
  }
  const finalUses = uses.reduce((sum, row) => sum + safeNumber(row.amount, 0), 0);
  const closingDate = safeString(deal?.timeline?.closingDate, 'TBD');
  const buyerReturnAtClose = uses.find((row) => row.item === 'Buyer Return at Close')?.amount || 0;
  const additionalEquityTrueUp = uses.find((row) => row.item === 'Additional Equity True-Up')?.amount || 0;
  const wireSchedule = [
    {
      wireId: 'WIRE-001',
      source: 'Senior Loan Proceeds',
      beneficiary: 'Acquisition Closing Desk',
      amount: loanAmount,
      direction: 'INBOUND',
      dueDate: closingDate,
      status: 'READY',
      control: 'Lender funding authorization matched to final settlement statement.'
    },
    {
      wireId: 'WIRE-002',
      source: 'Buyer Equity',
      beneficiary: 'Acquisition Closing Desk',
      amount: equityRequired + additionalEquityTrueUp,
      direction: 'INBOUND',
      dueDate: closingDate,
      status: 'READY',
      control: 'Dual approval required after independent call-back of escrow wire instructions.'
    }
  ];
  if (buyerReturnAtClose > 0) {
    wireSchedule.push({
      wireId: 'WIRE-003',
      source: 'Closing Statement True-Up',
      beneficiary: 'Buyer Treasury',
      amount: buyerReturnAtClose,
      direction: 'OUTBOUND',
      dueDate: closingDate,
      status: 'HOLD_FOR_FINAL_STATEMENT',
      control: 'Release only after title company confirms balanced final funds flow.'
    });
  }

  const redFlags = [];
  const dataGaps = [];
  if (preClosingStatus.pendingItems.length > 0) {
    redFlags.push(
      buildFlag(
        'closing-pending',
        'HIGH',
        'CLOSING',
        `${preClosingStatus.pendingItems.length} pre-closing items remain`,
        'Could delay close date',
        'closing-coordinator'
      )
    );
  }
  if (randBetween(rng, 0, 1) > 0.76) {
    dataGaps.push(
      buildDataGap(
        'closing-notices',
        'Tenant notice packet final approval pending',
        'transfer-doc-preparer'
      )
    );
  }
  const riskScore = Math.max(
    30,
    Math.min(96, round(90 - redFlags.length * 12 + randBetween(rng, -2, 3), 0))
  );

  return {
    scenarioVerdict: safeString(scenario?.expectedVerdict, ''),
    preClosingStatus,
    closingAgent: 'Acquisition Closing Desk',
    purchasePrice,
    loanAmount,
    equityRequired,
    closingCosts,
    prorations: [
      { lineItem: 'Tax Proration', amount: uses.find((u) => u.item === 'Tax Proration')?.amount || 0 },
      {
        lineItem: 'Insurance Proration',
        amount: uses.find((u) => u.item === 'Insurance Proration')?.amount || 0
      }
    ],
    fundsFlow: {
      sources,
      uses,
      totalSources,
      totalUses: finalUses,
      balanced: round(totalSources, 0) === round(finalUses, 0)
    },
    wireSchedule,
    keyMerits: [
      'Funding stack reconciled and balanced',
      'Legal and financing requirements aligned',
      'Execution timeline ready for close'
    ],
    keyRisks: redFlags.map((flag) => flag.message),
    conditions: preClosingStatus.pendingItems.map((item, idx) => ({
      id: `closing-condition-${idx + 1}`,
      description: item,
      severity: 'HIGH',
      owner: 'closing-coordinator',
      status: 'OPEN'
    })),
    riskScore,
    redFlagCount: redFlags.length,
    dataGapCount: dataGaps.length,
    redFlags,
    dataGaps,
    agentFindings: {
      'closing-coordinator': {
        status: 'COMPLETE',
        finding:
          preClosingStatus.pendingItems.length > 0
            ? `${preClosingStatus.pendingItems.length} closing items remain open.`
            : 'Closing checklist is complete.'
      },
      'funds-flow-manager': {
        status: 'COMPLETE',
        finding: round(totalSources, 0) === round(finalUses, 0)
          ? 'Sources and uses are balanced.'
          : 'Sources and uses require true-up.'
      }
    }
  };
}

function generatePhaseData(phaseKey, deal, context, scenario, rng) {
  if (phaseKey === 'dueDiligence') return generateDueDiligenceData(deal, scenario, rng);
  if (phaseKey === 'underwriting')
    return generateUnderwritingData(deal, context.dueDiligence, scenario, rng);
  if (phaseKey === 'financing')
    return generateFinancingData(deal, context.underwriting, scenario, rng);
  if (phaseKey === 'legal')
    return generateLegalData(deal, context.dueDiligence, context.financing, scenario, rng);
  if (phaseKey === 'closing')
    return generateClosingData(
      deal,
      context.dueDiligence,
      context.underwriting,
      context.financing,
      context.legal,
      scenario,
      rng
    );
  throw new Error(`Unknown phase key: ${phaseKey}`);
}

function determinePhaseVerdict(phaseKey, data) {
  if (phaseKey === 'dueDiligence') return data.redFlagCount > 2 ? 'CONDITIONAL' : 'PASS';
  if (phaseKey === 'underwriting') return data.verdict || 'PASS';
  if (phaseKey === 'financing') return data.redFlagCount > 0 ? 'CONDITIONAL' : 'PASS';
  if (phaseKey === 'legal') return data.redFlagCount > 0 ? 'CONDITIONAL' : 'PASS';
  if (safeString(data.scenarioVerdict, '') === 'FAIL') return 'FAIL';
  if (safeString(data.scenarioVerdict, '') === 'PROCEED_WITH_MITIGATIONS') return 'PROCEED_WITH_MITIGATIONS';
  if (safeString(data.scenarioVerdict, '') === 'CONDITIONAL') return 'CONDITIONAL';
  return Array.isArray(data.conditions) && data.conditions.length > 0 ? 'CONDITIONAL' : 'PASS';
}

function summarizeFindingsForPhase(phaseKey, data) {
  if (phaseKey === 'dueDiligence') {
    return [
      `Occupancy ${round(safeNumber(data.occupancy, 0) * 100, 1)}%`,
      `Loss-to-lease ${round(safeNumber(data.lossToLeasePct, 0) * 100, 1)}%`,
      `${safeNumber(data.redFlagCount, 0)} red flags`
    ];
  }
  if (phaseKey === 'underwriting') {
    return [
      `Leveraged IRR ${round(safeNumber(data.baseCase?.leveragedIRR, 0) * 100, 1)}%`,
      `Scenario pass-rate ${round(safeNumber(data.scenarioSummary?.passRate, 0) * 100, 1)}%`,
      `DSCR ${round(safeNumber(data.baseCase?.targetDSCR, 0), 2)}x`
    ];
  }
  if (phaseKey === 'financing') {
    return [
      `Selected lender ${safeString(data.selectedLender, 'N/A')}`,
      `Rate ${round(safeNumber(data.rate, 0) * 100, 3)}%`,
      `${safeNumber(data.quotesReceived, 0)} quotes`
    ];
  }
  if (phaseKey === 'legal') {
    return [
      `Estoppel return ${round(safeNumber(data.estoppelStatus?.returnRate, 0) * 100, 1)}%`,
      `Title status ${safeString(data.titleStatus?.status, 'UNKNOWN')}`,
      `${safeNumber(data.redFlagCount, 0)} red flags`
    ];
  }
  return [
    `Pre-close items ${safeNumber(data.preClosingStatus?.completedCount, 0)}/${safeNumber(
      data.preClosingStatus?.total,
      0
    )}`,
    `Funds flow balanced: ${data.fundsFlow?.balanced ? 'yes' : 'no'}`,
    `${safeNumber(data.redFlagCount, 0)} red flags`
  ];
}

function buildPhaseCompletionEvent(
  dealId,
  phaseKey,
  status,
  verdict,
  startedAt,
  metrics,
  redFlags = [],
  dataGaps = [],
  traceId = ''
) {
  return {
    type: 'PHASE_COMPLETION',
    dealId,
    phase: phaseKey,
    phaseId: `${dealId}-${phaseKey}-${Date.now()}`,
    status,
    verdict,
    durationMs: Math.max(0, Date.now() - new Date(startedAt).getTime()),
    dataGapCount: dataGaps.length,
    redFlagCount: redFlags.length,
    criticalFlags: redFlags.filter((f) => f.severity === 'CRITICAL'),
    metrics,
    timestamp: nowIso(),
    traceId
  };
}

module.exports = {
  generatePhaseData,
  determinePhaseVerdict,
  summarizeFindingsForPhase,
  buildPhaseCompletionEvent
};
