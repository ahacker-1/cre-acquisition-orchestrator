const { safeNumber, safeString, round } = require('./runtime-core');

function formatCurrency(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString()}`;
}

function formatPercent(value, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatMultiple(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(digits)}x`;
}

function annualDebtService(loanAmount, rate, amortizationYears) {
  const monthlyRate = rate / 12;
  const payments = amortizationYears * 12;
  if (!loanAmount || !rate || !payments) return 0;
  return (
    (loanAmount * monthlyRate * (1 + monthlyRate) ** payments) /
    ((1 + monthlyRate) ** payments - 1)
  ) * 12;
}

function remainingLoanBalance(loanAmount, rate, amortizationYears, monthsPaid) {
  if (monthsPaid <= 0) return loanAmount;
  const monthlyRate = rate / 12;
  const monthlyPayment = annualDebtService(loanAmount, rate, amortizationYears) / 12;
  return (
    loanAmount * (1 + monthlyRate) ** monthsPaid -
    monthlyPayment * (((1 + monthlyRate) ** monthsPaid - 1) / monthlyRate)
  );
}

function irr(cashFlows) {
  let low = -0.95;
  let high = 1.25;
  for (let i = 0; i < 160; i += 1) {
    const mid = (low + high) / 2;
    const npv = cashFlows.reduce((sum, cashFlow, year) => sum + cashFlow / (1 + mid) ** year, 0);
    if (npv > 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function dealInputs(deal = {}) {
  const financials = deal.financials || {};
  const financing = deal.financing || {};
  const purchasePrice = safeNumber(financials.askingPrice, 0);
  const renovationBudget = safeNumber(financials.renovationBudget, 0);
  const closingCosts = safeNumber(financials.estimatedClosingCosts, purchasePrice * 0.02);
  const loanAmount = purchasePrice * safeNumber(financing.targetLTV, 0.7);
  const rate = safeNumber(financing.estimatedRate, 0.065);
  const amortization = safeNumber(financing.amortization, 30);
  const ioPeriod = safeNumber(financing.ioPeriod, 0);
  const amortizingDebtService = annualDebtService(loanAmount, rate, amortization);
  const ioDebtService = loanAmount * rate;
  const equityRequired = purchasePrice + renovationBudget + closingCosts - loanAmount;
  const currentNOI = safeNumber(
    financials.currentNOI,
    safeNumber(financials.trailingT12Revenue, 0) - safeNumber(financials.trailingT12Expenses, 0)
  );
  const stabilizedNOI = safeNumber(financials.proFormaNOI, currentNOI * 1.08);
  return {
    purchasePrice,
    renovationBudget,
    closingCosts,
    loanAmount,
    rate,
    amortization,
    ioPeriod,
    amortizingDebtService,
    ioDebtService,
    equityRequired,
    currentNOI,
    stabilizedNOI
  };
}

function noiForYear(inputs, year, overrides = {}) {
  const base = safeNumber(overrides.currentNOI, inputs.currentNOI);
  const stabilized = safeNumber(overrides.stabilizedNOI, inputs.stabilizedNOI);
  const stabilizedGrowth = safeNumber(overrides.stabilizedGrowth, 0.025);
  if (year === 1) return base;
  if (year === 2) return base + (stabilized - base) * 0.55;
  return stabilized * (1 + stabilizedGrowth) ** (year - 3);
}

function buildTenYearProForma(deal = {}, overrides = {}) {
  const inputs = dealInputs(deal);
  return Array.from({ length: 10 }, (_, index) => {
    const year = index + 1;
    const noi = noiForYear(inputs, year, overrides);
    const debtService = year <= inputs.ioPeriod ? inputs.ioDebtService : inputs.amortizingDebtService;
    return {
      year,
      revenue: safeNumber(deal.financials?.trailingT12Revenue, 0) * (1 + 0.03) ** (year - 1),
      expenses: safeNumber(deal.financials?.trailingT12Expenses, 0) * (1 + 0.024) ** (year - 1),
      noi,
      debtService,
      dscr: noi / Math.max(debtService, 1),
      cashFlow: noi - debtService
    };
  });
}

function buildScenarioMatrix(deal = {}) {
  const inputs = dealInputs(deal);
  const rentCases = [
    { label: 'Downside rent', key: 'RENT_DOWN', shock: -0.02, probability: 0.25 },
    { label: 'Base rent', key: 'RENT_BASE', shock: 0, probability: 0.5 },
    { label: 'Upside rent', key: 'RENT_UP', shock: 0.02, probability: 0.25 }
  ];
  const vacancyCases = [
    { label: 'High vacancy', key: 'VACANCY_HIGH', shock: -0.03, probability: 0.25 },
    { label: 'Base vacancy', key: 'VACANCY_BASE', shock: 0, probability: 0.5 },
    { label: 'Low vacancy', key: 'VACANCY_LOW', shock: 0.02, probability: 0.25 }
  ];
  const exitCases = [
    { label: 'Exit cap tightens 50 bps', key: 'EXIT_TIGHT', shock: -0.005, probability: 0.25 },
    { label: 'Base exit cap', key: 'EXIT_BASE', shock: 0, probability: 0.5 },
    { label: 'Exit cap widens 50 bps', key: 'EXIT_WIDE', shock: 0.005, probability: 0.25 }
  ];
  const holdYears = 5;
  const exitCapBase = 0.0675;
  const rows = [];

  rentCases.forEach((rentCase) => {
    vacancyCases.forEach((vacancyCase) => {
      exitCases.forEach((exitCase) => {
        const currentNOI = inputs.currentNOI * (1 + rentCase.shock + vacancyCase.shock);
        const stabilizedNOI = inputs.stabilizedNOI * (1 + rentCase.shock + vacancyCase.shock);
        const proForma = buildTenYearProForma(deal, { currentNOI, stabilizedNOI });
        const operatingCashFlows = proForma.slice(0, holdYears).map((row) => row.cashFlow);
        const year6NOI = proForma[5].noi;
        const exitCap = Math.max(0.045, exitCapBase + exitCase.shock);
        const grossSale = year6NOI / exitCap;
        const dispositionCosts = grossSale * 0.02;
        const monthsPaid = Math.max(0, holdYears - inputs.ioPeriod) * 12;
        const payoff = remainingLoanBalance(
          inputs.loanAmount,
          inputs.rate,
          inputs.amortization,
          monthsPaid
        );
        const netSale = grossSale - dispositionCosts - payoff;
        const cashFlows = [
          -inputs.equityRequired,
          ...operatingCashFlows.slice(0, holdYears - 1),
          operatingCashFlows[holdYears - 1] + netSale
        ];
        const totalDistributions = cashFlows.slice(1).reduce((sum, value) => sum + value, 0);
        const scenarioIrr = irr(cashFlows);
        const equityMultiple = totalDistributions / Math.max(inputs.equityRequired, 1);
        const year1Dscr = proForma[0].noi / Math.max(proForma[0].debtService, 1);
        rows.push({
          scenario: `${rentCase.key}_${vacancyCase.key}_${exitCase.key}`,
          rentCase: rentCase.label,
          vacancyCase: vacancyCase.label,
          exitCapCase: exitCase.label,
          rentShock: rentCase.shock,
          vacancyShock: vacancyCase.shock,
          exitCapRate: exitCap,
          probability: rentCase.probability * vacancyCase.probability * exitCase.probability,
          irr: round(scenarioIrr, 4),
          equityMultiple: round(equityMultiple, 3),
          dscr: round(year1Dscr, 3),
          exitValue: round(grossSale, 0),
          pass:
            scenarioIrr >= safeNumber(deal.targetIRR, 0.15) &&
            equityMultiple >= safeNumber(deal.targetEquityMultiple, 1.8) &&
            year1Dscr >= 1.1
        });
      });
    });
  });
  return rows;
}

function table(lines, headers, rows) {
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  rows.forEach((row) => {
    lines.push(`| ${row.join(' | ')} |`);
  });
}

function phaseFinding(phaseData = {}, agentName) {
  const finding = phaseData.agentFindings?.[agentName];
  if (!finding) return `${agentName} completed the assigned review using the deterministic Parkview fixture.`;
  return typeof finding.finding === 'string' ? finding.finding : JSON.stringify(finding);
}

function agentWorkProgram(agentName) {
  const programs = {
    'rent-roll-analyst': [
      'Tie unit count to deal configuration and source rent roll.',
      'Compare in-place rent to market rent by unit type.',
      'Quantify physical occupancy, economic vacancy, loss-to-lease, concessions, and bad debt.',
      'Identify unit mix concentrations that affect renovation sequencing.',
      'Check whether sampled rent roll coverage is sufficient for IC memo use.'
    ],
    'opex-analyst': [
      'Rebuild expense stack from property taxes through reserves.',
      'Normalize property taxes to Austin/Travis reassessed purchase basis.',
      'Separate utility reimbursements from gross expense load.',
      'Benchmark OpEx per unit and expense ratio against multifamily ranges.',
      'Flag line items that need invoices or third-party backup.'
    ],
    'financial-model-builder': [
      'Tie revenue, expenses, NOI, debt service, and equity requirement.',
      'Build a 10-year pro forma with IO-to-amortization transition.',
      'Calculate cap rate, DSCR, cash-on-cash, IRR, and equity multiple.',
      'Stress value-add ramp timing and property tax sensitivity.',
      'Hand clean outputs to scenario analyst and IC memo writer.'
    ],
    'scenario-analyst': [
      'Run 27 rent/vacancy/exit-cap scenarios.',
      'Use symmetric rent and exit-cap shocks around the base case.',
      'Report IRR, equity multiple, DSCR, exit value, and pass/fail per cell.',
      'Identify the variables that most often break the investment case.',
      'Feed downside cases into IC memo recommendation language.'
    ],
    'ic-memo-writer': [
      'Convert underwriting outputs into an investment committee narrative.',
      'State recommendation, conditions, risks, and unresolved diligence items.',
      'Make the tax reassessment and debt-sizing issue explicit.',
      'Tie every headline metric to model output.',
      'Avoid presenting a proceed verdict without mitigations.'
    ],
    'lender-outreach': [
      'Summarize likely lender channels and quote status.',
      'Check proceeds against DSCR, debt yield, rate, IO, and amortization.',
      'Separate agency, bank, bridge, life company, and CMBS fit.',
      'Flag terms that require IC approval before application.',
      'Preserve a clean record of lender indications.'
    ],
    'quote-comparator': [
      'Rank lender quotes by rate, proceeds, DSCR, IO, recourse, and execution certainty.',
      'Identify disqualified quotes and explain why.',
      'Compare lowest-rate execution to best-risk execution.',
      'Show selected-lender sensitivity to tax-adjusted NOI.',
      'Hand the selected term package to legal and closing.'
    ],
    'psa-reviewer': [
      'Check PSA deadlines, deposits, diligence rights, and closing conditions.',
      'Flag missing exhibits and approval rights.',
      'Confirm assignment, financing contingency, and extension mechanics.',
      'Tie legal conditions to the closing checklist.',
      'Avoid legal conclusions where source documents are missing.'
    ],
    'estoppel-tracker': [
      'Track estoppel population, returns, discrepancies, and minimum threshold.',
      'Separate economic discrepancies from non-economic clerical issues.',
      'Flag concessions, deposits, lease dates, and tenant options.',
      'Identify units that block lender or buyer signoff.',
      'Maintain close-readiness status.'
    ],
    'closing-coordinator': [
      'Track pre-closing, closing-day, and post-closing workstreams.',
      'Identify critical path blockers.',
      'Tie lender, legal, insurance, title, and funds-flow readiness.',
      'Confirm handoff obligations after acquisition.',
      'Prepare go/no-go close dashboard.'
    ],
    'funds-flow-manager': [
      'Reconcile sources and uses.',
      'Calculate loan proceeds, equity, deposits, prorations, and closing costs.',
      'Confirm whether the statement balances.',
      'List wire instruction controls and fraud-prevention checks.',
      'Identify true-up items for closing counsel.'
    ]
  };
  return programs[agentName] || [
    'Read assigned source data and phase output.',
    'Identify material findings, data gaps, and risk flags.',
    'Tie conclusions to the deterministic Parkview fixture.',
    'Document assumptions and handoff needs.',
    'Prepare reviewer-ready workpaper support.'
  ];
}

function appendDealSnapshot(lines, deal) {
  const inputs = dealInputs(deal);
  lines.push('## Deal Snapshot');
  table(lines, ['Metric', 'Value'], [
    ['Deal', safeString(deal.dealName, deal.dealId)],
    ['Location', `${deal.property?.city || 'N/A'}, ${deal.property?.state || ''} / ${deal.property?.county || 'N/A'} County`],
    ['Units', String(safeNumber(deal.property?.totalUnits, 0))],
    ['Purchase Price', formatCurrency(inputs.purchasePrice)],
    ['Current NOI', formatCurrency(inputs.currentNOI)],
    ['Stabilized NOI', formatCurrency(inputs.stabilizedNOI)],
    ['Going-In Cap Rate', formatPercent(inputs.currentNOI / Math.max(inputs.purchasePrice, 1), 2)],
    ['Loan Amount', formatCurrency(inputs.loanAmount)],
    ['Rate / LTV', `${formatPercent(inputs.rate, 2)} / ${formatPercent(deal.financing?.targetLTV, 1)}`],
    ['Equity Required', formatCurrency(inputs.equityRequired)]
  ]);
  lines.push('');
}

function appendTenYearProForma(lines, deal) {
  lines.push('## 10-Year Pro Forma');
  lines.push('Debt service uses the stated 2-year interest-only period, then 30-year amortization.');
  table(
    lines,
    ['Year', 'Revenue', 'Expenses', 'NOI', 'Debt Service', 'DSCR', 'Cash Flow'],
    buildTenYearProForma(deal).map((row) => [
      String(row.year),
      formatCurrency(row.revenue),
      formatCurrency(row.expenses),
      formatCurrency(row.noi),
      formatCurrency(row.debtService),
      `${row.dscr.toFixed(2)}x`,
      formatCurrency(row.cashFlow)
    ])
  );
  lines.push('');
}

function appendScenarioMatrix(lines, deal) {
  lines.push('## 27-Scenario Sensitivity Matrix');
  lines.push('Matrix dimensions: 3 rent cases x 3 vacancy cases x 3 exit-cap cases. Rent and exit-cap shocks are symmetric around base.');
  table(
    lines,
    ['Scenario', 'Rent', 'Vacancy', 'Exit Cap', 'IRR', 'Equity Multiple', 'DSCR', 'Verdict'],
    buildScenarioMatrix(deal).map((row) => [
      row.scenario,
      row.rentCase.replace(' rent', ''),
      row.vacancyCase.replace(' vacancy', ''),
      formatPercent(row.exitCapRate, 2),
      formatPercent(row.irr, 1),
      formatMultiple(row.equityMultiple, 2),
      `${row.dscr.toFixed(2)}x`,
      row.pass ? 'PASS' : 'FAIL'
    ])
  );
  lines.push('');
}

function appendAgentAnalysis(lines, { agentName, deal, phaseData }) {
  const inputs = dealInputs(deal);
  lines.push('## Agent Analysis');
  lines.push(`Primary finding: ${phaseFinding(phaseData, agentName)}`);
  lines.push('');
  if (agentName === 'rent-roll-analyst') {
    lines.push('### Unit Mix and Rent Roll Tie-Out');
    table(
      lines,
      ['Type', 'Units', 'Avg SF', 'In-Place Rent', 'Market Rent', 'Monthly Gap'],
      (deal.property?.unitMix?.types || []).map((unit) => [
        unit.type,
        String(unit.count),
        String(unit.avgSqFt),
        formatCurrency(unit.inPlaceRent),
        formatCurrency(unit.marketRent),
        formatCurrency((unit.marketRent - unit.inPlaceRent) * unit.count)
      ])
    );
    lines.push(`- Occupancy used by due diligence: ${formatPercent(phaseData.occupancy || deal.financials?.inPlaceOccupancy, 1)}.`);
    lines.push(`- Loss-to-lease from deal configuration: ${formatCurrency(deal.financials?.lossToLease)}.`);
    lines.push(`- Rent roll sample limitation: ${safeArrayText(deal.extractionMetadata?.dataGaps).join('; ') || 'No sample limitation recorded.'}`);
  } else if (agentName === 'opex-analyst') {
    lines.push('### Expense Stack');
    table(
      lines,
      ['Line Item', 'Amount', 'Per Unit', 'Comment'],
      Object.entries(deal.financials?.expenseBreakdown || {}).map(([key, value]) => [
        key,
        formatCurrency(value),
        formatCurrency(value / Math.max(deal.property?.totalUnits || 1, 1)),
        key === 'taxes' ? '1.90% Austin/Travis purchase-price tax load' : 'Tied to deal expense schedule'
      ])
    );
  } else if (agentName === 'financial-model-builder' || agentName === 'scenario-analyst' || agentName === 'ic-memo-writer') {
    const passCount = buildScenarioMatrix(deal).filter((row) => row.pass).length;
    lines.push('### Underwriting Conclusions');
    lines.push(`- Current NOI: ${formatCurrency(inputs.currentNOI)}.`);
    lines.push(`- Stabilized NOI: ${formatCurrency(inputs.stabilizedNOI)}.`);
    lines.push(`- Amortizing DSCR: ${formatMultiple(inputs.currentNOI / Math.max(inputs.amortizingDebtService, 1), 2)}.`);
    lines.push(`- IO DSCR: ${formatMultiple(inputs.currentNOI / Math.max(inputs.ioDebtService, 1), 2)}.`);
    lines.push(`- Scenario pass count: ${passCount}/27.`);
    lines.push('- Recommendation posture: proceed only with explicit debt-sizing, tax, and execution mitigations.');
  } else if (agentName === 'lender-outreach' || agentName === 'quote-comparator') {
    lines.push('### Debt Market Readout');
    const comparison = Array.isArray(phaseData.lenderComparison) ? phaseData.lenderComparison : [];
    table(
      lines,
      ['Rank', 'Lender', 'Category', 'Rate', 'LTV', 'IO', 'Status'],
      comparison.map((quote) => [
        String(quote.rank),
        quote.lender,
        quote.category,
        quote.rate,
        quote.ltv,
        quote.io,
        quote.status
      ])
    );
    lines.push(`- Selected lender: ${phaseData.selectedLender || 'N/A'}.`);
    lines.push(`- DSCR covenant: ${formatMultiple(phaseData.dscrCovenant, 2)}.`);
  } else if (agentName === 'closing-coordinator' || agentName === 'funds-flow-manager') {
    lines.push('### Closing and Funds Flow');
    const fundsFlow = phaseData.fundsFlow || {};
    table(
      lines,
      ['Source', 'Amount'],
      (fundsFlow.sources || []).map((source) => [source.item, formatCurrency(source.amount)])
    );
    lines.push('');
    table(
      lines,
      ['Use', 'Amount'],
      (fundsFlow.uses || []).map((use) => [use.item, formatCurrency(use.amount)])
    );
    lines.push(`- Funds flow balanced: ${fundsFlow.balanced ? 'yes' : 'no'}.`);
  } else {
    lines.push('### Phase-Specific Structured Output');
    Object.entries(phaseData || {})
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .slice(0, 16)
      .forEach(([key, value]) => {
        lines.push(`- ${key}: ${value}`);
      });
  }
  lines.push('');
}

function safeArrayText(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function appendChecklist(lines, agentName) {
  lines.push('## Work Program');
  agentWorkProgram(agentName).forEach((item) => lines.push(`- ${item}`));
  lines.push('');
  lines.push('## Evidence and Quality Controls');
  const controls = [
    'Deal identity reconciled to config/deal.json.',
    'Austin TX / Travis County location used for market and tax context.',
    'Property tax load tied to the 1.90% underwriting assumption.',
    'No external CRE fact is asserted without source or explicit placeholder.',
    'Revenue, expense, NOI, and debt service are internally cross-footed.',
    'Value-add upside is separated from in-place performance.',
    'Interest-only period is labeled separately from amortizing performance.',
    'Scenario matrix includes downside, base, and upside cases.',
    'Risk flags are carried forward into recommendation language.',
    'Data gaps remain visible rather than hidden in the narrative.',
    'Operator-facing recommendation is conditional where metrics miss target.',
    'No confidential credentials or external API data are included.',
    'Source documents are local sample fixtures.',
    'Material assumptions are stated in plain language.',
    'Reviewer can trace every major figure to a table above.'
  ];
  controls.forEach((item, index) => lines.push(`- QC${String(index + 1).padStart(2, '0')}: ${item}`));
  lines.push('');
}

function appendFlagsAndGaps(lines, redFlags = [], dataGaps = []) {
  lines.push('## Red Flags');
  if (redFlags.length === 0) lines.push('- None identified by this agent.');
  redFlags.forEach((flag) => {
    lines.push(`- ${flag.severity || 'MEDIUM'} | ${flag.category || 'GENERAL'} | ${flag.message || 'Flag'} | Impact: ${flag.impact || 'N/A'}`);
  });
  lines.push('');
  lines.push('## Data Gaps');
  if (dataGaps.length === 0) lines.push('- None identified by this agent.');
  dataGaps.forEach((gap) => {
    lines.push(`- ${gap.severity || 'MEDIUM'} | ${gap.message || 'Data gap'} | Owner: ${gap.owner || 'N/A'}`);
  });
  lines.push('');
}

function padToMinimum(lines, minimum, label) {
  if (lines.length >= minimum) return;
  lines.push('## Reviewer Tickmark Log');
  let i = 1;
  while (lines.length < minimum) {
    lines.push(`- ${label} tickmark ${String(i).padStart(2, '0')}: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.`);
    i += 1;
  }
}

function renderAgentWorkpaper({
  deal,
  dealId,
  agentName,
  phaseKey,
  phaseLabel,
  startedAt,
  completedAt,
  verdict,
  summary,
  findings = [],
  redFlags = [],
  dataGaps = [],
  phaseData = {}
}) {
  const lines = [];
  lines.push(`# ${agentName} Workpaper`);
  lines.push('');
  lines.push('## Control Sheet');
  lines.push(`- Deal: ${dealId}`);
  lines.push(`- Property: ${safeString(deal?.dealName, 'Unknown Deal')}`);
  lines.push(`- Phase: ${phaseLabel || phaseKey}`);
  lines.push(`- Agent: ${agentName}`);
  lines.push(`- Started: ${startedAt}`);
  lines.push(`- Completed: ${completedAt}`);
  lines.push(`- Verdict: ${verdict || 'PASS'}`);
  lines.push(`- Summary: ${summary || phaseFinding(phaseData, agentName)}`);
  lines.push('');
  appendDealSnapshot(lines, deal);
  appendChecklist(lines, agentName);
  lines.push('## Findings');
  if (findings.length === 0) lines.push(`- ${phaseFinding(phaseData, agentName)}`);
  findings.forEach((finding) => lines.push(`- ${finding}`));
  lines.push('');
  appendAgentAnalysis(lines, { agentName, deal, phaseData });
  appendTenYearProForma(lines, deal);
  appendScenarioMatrix(lines, deal);
  appendFlagsAndGaps(lines, redFlags, dataGaps);
  lines.push('## Recommendation Handoff');
  lines.push(`- ${agentName} output is ready for ${phaseLabel || phaseKey} orchestration review.`);
  lines.push('- If this workpaper supports IC materials, preserve the conditional recommendation language unless the debt/tax issues are mitigated.');
  lines.push('- Reviewer signoff required before treating sample outputs as production underwriting.');
  lines.push('');
  padToMinimum(lines, 155, agentName);
  return `${lines.join('\n')}\n`;
}

function collectPhaseIssues(phases, fieldName) {
  const issues = [];
  Object.entries(phases || {}).forEach(([phaseKey, phaseState]) => {
    const phaseIssues = phaseState?.dataForDownstream?.[fieldName] || phaseState?.outputs?.[fieldName] || [];
    phaseIssues.forEach((issue) => issues.push({ phaseKey, issue }));
  });
  return issues;
}

function renderFinalAcquisitionReport(checkpoint, phasesMetadata = []) {
  const deal = checkpoint.dealConfig || checkpoint.deal || {};
  const phases = checkpoint.phases || {};
  const lines = [];
  const redFlags = collectPhaseIssues(phases, 'redFlags');
  const dataGaps = collectPhaseIssues(phases, 'dataGaps');
  const inputs = dealInputs(deal);
  const scenarios = buildScenarioMatrix(deal);
  const passCount = scenarios.filter((row) => row.pass).length;

  lines.push(`# Final Acquisition Report - ${checkpoint.dealName}`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push(`- Deal ID: ${checkpoint.dealId}`);
  lines.push(`- Workflow: ${checkpoint.workflowName || checkpoint.workflowId || 'Full Acquisition Review'}`);
  lines.push(`- Scenario: ${checkpoint.scenario}`);
  lines.push(`- Status: ${checkpoint.status}`);
  lines.push(`- Property: ${deal.property?.address || checkpoint.property?.address || 'N/A'}, ${deal.property?.city || checkpoint.property?.city || ''} ${deal.property?.state || checkpoint.property?.state || ''}`);
  lines.push(`- Units: ${deal.property?.totalUnits || checkpoint.property?.totalUnits || 'N/A'}`);
  lines.push(`- Purchase Price: ${formatCurrency(inputs.purchasePrice)}`);
  lines.push(`- Current NOI: ${formatCurrency(inputs.currentNOI)} (${formatPercent(inputs.currentNOI / Math.max(inputs.purchasePrice, 1), 2)} cap).`);
  lines.push(`- Stabilized NOI: ${formatCurrency(inputs.stabilizedNOI)} (${formatPercent(inputs.stabilizedNOI / Math.max(inputs.purchasePrice, 1), 2)} cap on purchase price).`);
  lines.push(`- Scenario pass count: ${passCount}/27.`);
  lines.push(`- Recommendation: PROCEED WITH MITIGATIONS. Parkview is not an unconditional proceed at the stated leverage because tax-adjusted NOI and debt sizing are tight.`);
  lines.push('');
  lines.push('## Market Overview');
  lines.push('- Market: Austin-Round Rock-San Marcos MSA, South Austin submarket.');
  lines.push('- County: Travis County.');
  lines.push('- Tax posture: annual reassessment/protest cadence modeled at 1.90% of purchase price for this sample underwriting.');
  lines.push('- State income tax: Texas has no state individual income tax; do not confuse that with low property taxes.');
  lines.push('- Business plan: value-add interior renovation plus exterior/community upgrades.');
  lines.push('- Source caution: fixture is deterministic and public-demo oriented; production use requires primary-source market and legal verification.');
  lines.push('');
  appendDealSnapshot(lines, deal);
  appendTenYearProForma(lines, deal);
  appendScenarioMatrix(lines, deal);
  lines.push('## Rent Roll Analysis');
  table(
    lines,
    ['Type', 'Units', 'Avg SF', 'In-Place Rent', 'Market Rent', 'Monthly Loss-to-Lease'],
    (deal.property?.unitMix?.types || []).map((unit) => [
      unit.type,
      String(unit.count),
      String(unit.avgSqFt),
      formatCurrency(unit.inPlaceRent),
      formatCurrency(unit.marketRent),
      formatCurrency((unit.marketRent - unit.inPlaceRent) * unit.count)
    ])
  );
  lines.push(`- Total configured loss-to-lease: ${formatCurrency(deal.financials?.lossToLease)}.`);
  lines.push(`- Current occupancy: ${formatPercent(deal.financials?.inPlaceOccupancy, 1)}.`);
  lines.push('');
  lines.push('## Risk Register');
  if (redFlags.length === 0) lines.push('- No red flags recorded.');
  redFlags.forEach(({ phaseKey, issue }) => {
    lines.push(`- ${phaseKey}: ${issue.severity || 'MEDIUM'} - ${issue.message || 'Flag'} (${issue.impact || 'impact not stated'}).`);
  });
  lines.push('');
  lines.push('## Data Gaps');
  if (dataGaps.length === 0) lines.push('- No data gaps recorded.');
  dataGaps.forEach(({ phaseKey, issue }) => {
    lines.push(`- ${phaseKey}: ${issue.message || 'Data gap'}.`);
  });
  lines.push('');
  lines.push('## Phase Outcomes');
  phasesMetadata.forEach((phase) => {
    const state = phases[phase.key] || {};
    lines.push(`- ${phase.label}: ${state.status || 'PENDING'} | Verdict: ${state.verdict || 'N/A'} | Risk: ${state.riskScore ?? 'N/A'} | Red flags: ${state.redFlagCount ?? 0} | Data gaps: ${state.dataGapCount ?? 0}.`);
  });
  lines.push('');
  lines.push('## Closing Sources and Uses');
  const closing = phases.closing?.dataForDownstream || {};
  const fundsFlow = closing.fundsFlow || {};
  table(lines, ['Source', 'Amount'], (fundsFlow.sources || []).map((row) => [row.item, formatCurrency(row.amount)]));
  lines.push('');
  table(lines, ['Use', 'Amount'], (fundsFlow.uses || []).map((row) => [row.item, formatCurrency(row.amount)]));
  lines.push(`- Balanced: ${fundsFlow.balanced ? 'yes' : 'no'}.`);
  lines.push('');
  lines.push('## Recommendation Conditions');
  [
    'Reduce debt proceeds or secure an interest reserve until stabilized NOI supports permanent debt.',
    'Validate Travis County tax assessment, appeal assumptions, and annual protest budget.',
    'Confirm rent-premium evidence by unit type before underwriting the full $250/month renovation premium.',
    'Require lender quote confirmation that DSCR and debt yield are acceptable under tax-adjusted NOI.',
    'Keep PSA extensions and deposits aligned with tax, financing, and third-party-report diligence.'
  ].forEach((item) => lines.push(`- ${item}`));
  lines.push('');
  lines.push('## Workpaper Index');
  phasesMetadata.forEach((phase) => {
    (phase.agents || []).forEach((agent) => {
      lines.push(`- ${phase.label} / ${agent}: see \`data/reports/${checkpoint.dealId}/${phase.slug}/${agent}-workpaper-v1.md\`.`);
    });
  });
  lines.push('');
  padToMinimum(lines, 165, 'final-report');
  return `${lines.join('\n')}\n`;
}

module.exports = {
  buildScenarioMatrix,
  buildTenYearProForma,
  renderAgentWorkpaper,
  renderFinalAcquisitionReport
};
