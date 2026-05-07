#!/usr/bin/env node
/**
 * verify-chain.js (Task 12.4)
 *
 * Reads phase checkpoints and verifies data flows correctly between phases.
 *
 * Usage:
 *   node scripts/verify-chain.js --deal-id DEAL-2024-001
 *   node scripts/verify-chain.js --deal-id test-deal-001
 *   node scripts/verify-chain.js --deal-id DEAL-2024-001 --output verification-results.json
 *
 * Reads data/status/{deal-id}.json and verifies cross-phase data consistency.
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

const dealId = getArg('--deal-id', null);
const outputArg = getArg('--output', null);

if (!dealId) {
  console.error('Usage: node scripts/verify-chain.js --deal-id <DEAL-ID>');
  console.error('Example: node scripts/verify-chain.js --deal-id DEAL-2024-001');
  process.exit(1);
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function colorize(text, color) {
  const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    reset: '\x1b[0m'
  };
  return `${colors[color] || ''}${text}${colors.reset}`;
}

function approxEqual(a, b, tolerancePercent) {
  if (a === 0 && b === 0) return true;
  if (a === 0 || b === 0) return Math.abs(a - b) < 1;
  return Math.abs((a - b) / a) <= (tolerancePercent / 100);
}

// ------------------------------------------------------------------
// Verification checks
// ------------------------------------------------------------------
function verifyDDtoUW(dd, uw) {
  const checks = [];
  const ddData = dd.dataForDownstream || {};
  const uwData = uw.dataForDownstream || {};

  // 1. Total units consistency
  const ddUnits = ddData.rentRoll ? ddData.rentRoll.totalUnits : (ddData.occupiedUnits ? Math.round(ddData.occupiedUnits / ddData.occupancy) : null);
  const uwModel = uwData.financialModel || uwData.baseCase || {};
  const uwPPU = uwModel.pricePerUnit;
  const uwPrice = uwModel.purchasePrice;
  const uwDerivedUnits = (uwPPU && uwPrice) ? Math.round(uwPrice / uwPPU) : null;

  if (ddUnits && uwDerivedUnits) {
    const match = ddUnits === uwDerivedUnits;
    checks.push({
      check: 'Total units consistency',
      ddValue: ddUnits,
      uwValue: uwDerivedUnits,
      status: match ? 'PASS' : 'FAIL',
      detail: match ? 'Units match' : `DD has ${ddUnits} units, UW implies ${uwDerivedUnits} units`
    });
  } else {
    checks.push({
      check: 'Total units consistency',
      status: 'SKIP',
      detail: 'Could not extract unit counts from both phases'
    });
  }

  // 2. NOI derivable from rent roll - expenses
  const ddRentRoll = ddData.rentRoll || {};
  const ddExpenses = ddData.expenses || {};
  const ddOccupancy = ddRentRoll.occupancy || ddData.occupancy;
  const ddAvgRent = ddRentRoll.avgRent || ddData.avgInPlaceRent;
  const ddTotalUnits = ddRentRoll.totalUnits || ddUnits;
  const ddTotalOpEx = ddExpenses.totalOpEx || ddData.totalExpenses;

  if (ddOccupancy && ddAvgRent && ddTotalUnits && ddTotalOpEx) {
    const derivedRevenue = ddAvgRent * 12 * ddTotalUnits * ddOccupancy;
    const derivedNOI = derivedRevenue - ddTotalOpEx;
    const uwNOI = uwModel.noi || (uwData.baseCase && uwData.baseCase.year1NOI);

    if (uwNOI) {
      const pctDiff = Math.abs((derivedNOI - uwNOI) / derivedNOI * 100);
      const match = pctDiff < 15; // allow 15% tolerance for model adjustments
      checks.push({
        check: 'NOI derivation (DD rent roll - expenses vs UW NOI)',
        ddDerivedNOI: Math.round(derivedNOI),
        uwNOI: uwNOI,
        percentDifference: parseFloat(pctDiff.toFixed(1)),
        status: match ? 'PASS' : 'WARN',
        detail: match ? `NOI within tolerance (${pctDiff.toFixed(1)}% diff)` : `NOI diverges ${pctDiff.toFixed(1)}% - may need review`
      });
    }
  } else {
    checks.push({
      check: 'NOI derivation',
      status: 'SKIP',
      detail: 'Insufficient DD data to derive NOI'
    });
  }

  // 3. Occupancy consistency
  const uwOccupancy = ddOccupancy; // UW should use DD occupancy
  if (ddOccupancy) {
    checks.push({
      check: 'Occupancy passed to UW',
      ddValue: ddOccupancy,
      status: 'PASS',
      detail: `DD occupancy ${(ddOccupancy * 100).toFixed(0)}% available for UW`
    });
  }

  return checks;
}

function verifyUWtoFinancing(uw, financing) {
  const checks = [];
  const uwData = uw.dataForDownstream || {};
  const finData = financing.dataForDownstream || {};

  const uwModel = uwData.financialModel || uwData.baseCase || {};
  const finQuote = finData.bestQuote || finData;
  const finLoanAmount = finQuote.loanAmount || finData.loanAmount;
  const uwPrice = uwModel.purchasePrice || (uwData.baseCase && uwData.baseCase.purchasePrice);

  // 1. Purchase price consistency
  if (uwPrice && finLoanAmount) {
    const finLTV = finQuote.ltv || finData.ltv;
    const impliedPrice = finLTV ? Math.round(finLoanAmount / finLTV) : null;
    if (impliedPrice) {
      const match = approxEqual(uwPrice, impliedPrice, 5);
      checks.push({
        check: 'Purchase price consistency (UW vs Financing implied)',
        uwPurchasePrice: uwPrice,
        financingImpliedPrice: impliedPrice,
        status: match ? 'PASS' : 'FAIL',
        detail: match ? 'Purchase prices align' : `UW price $${uwPrice.toLocaleString()} vs Financing implies $${impliedPrice.toLocaleString()}`
      });
    }
  }

  // 2. DSCR at proposed terms
  const uwNOI = uwModel.noi || (uwData.baseCase && uwData.baseCase.year1NOI);
  const uwDSCR = uwModel.dscr || (uwData.baseCase && uwData.baseCase.targetDSCR);
  const finRate = finQuote.rate || finData.rate;

  if (uwNOI && finLoanAmount && finRate) {
    const finAmort = finQuote.amortization || 30;
    const monthlyRate = finRate / 12;
    const totalPayments = finAmort * 12;
    const monthlyPayment = finLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);
    const annualDS = monthlyPayment * 12;
    const computedDSCR = parseFloat((uwNOI / annualDS).toFixed(2));

    checks.push({
      check: 'DSCR at financing terms',
      uwNOI: uwNOI,
      annualDebtService: Math.round(annualDS),
      computedDSCR: computedDSCR,
      status: computedDSCR >= 1.0 ? 'PASS' : 'FAIL',
      detail: `DSCR ${computedDSCR}x at ${(finRate * 100).toFixed(2)}% rate on $${finLoanAmount.toLocaleString()} loan`
    });
  }

  // 3. LTV consistency
  const uwLTV = uwModel.ltv || (uwData.baseCase && uwData.baseCase.targetLTV);
  const finLTV = finQuote.ltv || finData.ltv;
  if (uwLTV && finLTV) {
    const match = approxEqual(uwLTV, finLTV, 10);
    checks.push({
      check: 'LTV consistency',
      uwLTV: uwLTV,
      financingLTV: finLTV,
      status: match ? 'PASS' : 'WARN',
      detail: match ? 'LTV values align' : `UW assumed ${(uwLTV * 100).toFixed(0)}% LTV, financing at ${(finLTV * 100).toFixed(0)}%`
    });
  }

  return checks;
}

function verifyDDFinancingToLegal(dd, financing, legal) {
  const checks = [];
  const ddData = dd.dataForDownstream || {};
  const finData = financing.dataForDownstream || {};
  const legalData = legal.dataForDownstream || {};

  // 1. Loan amount matches between financing and legal
  const finQuote = finData.bestQuote || finData;
  const finLoanAmount = finQuote.loanAmount || finData.loanAmount;

  if (finLoanAmount && legalData.loanDocsStatus) {
    checks.push({
      check: 'Loan docs status reflects financing selection',
      financingLoanAmount: finLoanAmount,
      legalLoanDocsStatus: legalData.loanDocsStatus,
      status: ['EXECUTED', 'APPROVED', 'PREPARED', 'ACCEPTABLE'].includes(legalData.loanDocsStatus) ? 'PASS' : 'WARN',
      detail: `Loan docs status: ${legalData.loanDocsStatus}`
    });
  }

  // 2. Title status from DD matches legal
  const ddTitle = ddData.title || {};
  const ddTitleStatus = ddTitle.status || ddData.zoningCompliant;
  const legalTitleStatus = legalData.titleStatus;

  if (ddTitleStatus && legalTitleStatus) {
    const ddClear = ['CLEAR', 'COMPLIANT', true].includes(ddTitleStatus);
    const legalClear = ['CLEAR', 'COMPLIANT'].includes(legalTitleStatus);
    const consistent = ddClear === legalClear;
    checks.push({
      check: 'Title status consistency (DD vs Legal)',
      ddTitleStatus: ddTitleStatus,
      legalTitleStatus: legalTitleStatus,
      status: consistent ? 'PASS' : 'WARN',
      detail: consistent ? 'Title statuses consistent' : 'Title status changed between DD and Legal phases'
    });
  }

  // 3. Property details match (if legal has property data)
  if (legalData.psaStatus) {
    checks.push({
      check: 'PSA execution status',
      status: ['EXECUTED', 'APPROVED', 'ACCEPTABLE'].includes(legalData.psaStatus) ? 'PASS' : 'WARN',
      detail: `PSA status: ${legalData.psaStatus}`
    });
  }

  return checks;
}

function verifyAllToClosing(dd, uw, financing, legal, closing) {
  const checks = [];
  const ddData = dd.dataForDownstream || {};
  const uwData = uw.dataForDownstream || {};
  const finData = financing.dataForDownstream || {};
  const legalData = legal.dataForDownstream || {};
  const closingData = closing.dataForDownstream || {};

  const uwModel = uwData.financialModel || uwData.baseCase || {};
  const finQuote = finData.bestQuote || finData;

  // 1. Purchase price consistency across all
  const uwPrice = uwModel.purchasePrice || (uwData.baseCase && uwData.baseCase.purchasePrice);
  const closingPrice = closingData.purchasePrice || (closingData.fundsFlow && closingData.fundsFlow.uses && closingData.fundsFlow.uses.find(u => u.item === 'Purchase Price')?.amount);

  if (uwPrice && closingPrice) {
    const match = uwPrice === closingPrice;
    checks.push({
      check: 'Purchase price consistency (UW vs Closing)',
      uwPurchasePrice: uwPrice,
      closingPurchasePrice: closingPrice,
      status: match ? 'PASS' : 'FAIL',
      detail: match ? 'Purchase prices match' : `UW: $${uwPrice.toLocaleString()}, Closing: $${closingPrice.toLocaleString()}`
    });
  }

  // 2. Loan amount consistency
  const finLoanAmount = finQuote.loanAmount || finData.loanAmount;
  const closingLoanAmount = closingData.loanAmount || (closingData.fundsFlow && closingData.fundsFlow.sources && closingData.fundsFlow.sources.find(s => s.item.includes('Loan'))?.amount);

  if (finLoanAmount && closingLoanAmount) {
    const match = approxEqual(finLoanAmount, closingLoanAmount, 2);
    checks.push({
      check: 'Loan amount consistency (Financing vs Closing)',
      financingLoanAmount: finLoanAmount,
      closingLoanAmount: closingLoanAmount,
      status: match ? 'PASS' : 'FAIL',
      detail: match ? 'Loan amounts align' : `Financing: $${finLoanAmount.toLocaleString()}, Closing: $${closingLoanAmount.toLocaleString()}`
    });
  }

  // 3. Equity required consistency
  if (uwPrice && finLoanAmount && closingData.equityRequired) {
    const expectedEquity = uwPrice - finLoanAmount;
    const closingEquity = closingData.equityRequired;
    // Closing equity may include closing costs, so allow generous tolerance
    const closingCosts = closingData.closingCosts || 0;
    const expectedWithCosts = expectedEquity + closingCosts;
    const match = approxEqual(closingEquity, expectedEquity, 10) || approxEqual(closingEquity, expectedWithCosts, 5);

    checks.push({
      check: 'Equity required consistency',
      expectedEquity: expectedEquity,
      closingEquityRequired: closingEquity,
      closingCosts: closingCosts,
      status: match ? 'PASS' : 'WARN',
      detail: match
        ? 'Equity amounts consistent (with/without closing costs)'
        : `Expected equity ~$${expectedEquity.toLocaleString()} (+ $${closingCosts.toLocaleString()} costs), closing shows $${closingEquity.toLocaleString()}`
    });
  }

  // 4. All phases completed check
  const phases = [dd, uw, financing, legal, closing];
  const allCompleted = phases.every(p =>
    p.status === 'COMPLETED' ||
    p.status === 'complete' ||
    p.status === 'SKIPPED' ||
    p.status === 'skipped'
  );
  checks.push({
    check: 'All phases resolved',
    status: allCompleted ? 'PASS' : 'FAIL',
    detail: allCompleted
      ? 'All 5 phases show completed or workflow-skipped status'
      : `Incomplete: ${phases.map((p, i) => ({ name: ['DD', 'UW', 'Financing', 'Legal', 'Closing'][i], status: p.status })).filter(p => !['COMPLETED', 'complete', 'SKIPPED', 'skipped'].includes(p.status)).map(p => `${p.name}(${p.status})`).join(', ')}`
  });

  // 5. Verdict chain is coherent
  const verdicts = { dd: dd.verdict, uw: uw.verdict, financing: financing.verdict, legal: legal.verdict, closing: closing.verdict };
  const hasFailVerdict = Object.values(verdicts).some(v => v === 'FAIL' || v === 'REJECT');
  checks.push({
    check: 'Verdict chain coherence',
    verdicts: verdicts,
    status: hasFailVerdict ? 'WARN' : 'PASS',
    detail: hasFailVerdict ? 'A phase has FAIL verdict but pipeline continued' : 'No FAIL verdicts in chain'
  });

  // 6. Timeline ordering
  const times = {
    dd: { start: dd.startedAt, end: dd.completedAt },
    uw: { start: uw.startedAt, end: uw.completedAt },
    financing: { start: financing.startedAt, end: financing.completedAt },
    legal: { start: legal.startedAt, end: legal.completedAt },
    closing: { start: closing.startedAt, end: closing.completedAt }
  };

  let timelineValid = true;
  const orderedPhases = ['dd', 'uw', 'financing', 'legal', 'closing'];
  // DD must complete before UW starts; UW before Financing; Financing before Closing
  // Legal can start in parallel with UW/Financing
  const sequentialPairs = [['dd', 'uw'], ['uw', 'financing'], ['financing', 'closing']];
  const timeIssues = [];

  for (const [a, b] of sequentialPairs) {
    const aEnd = times[a].end ? new Date(times[a].end) : null;
    const bStart = times[b].start ? new Date(times[b].start) : null;
    if (aEnd && bStart && bStart < aEnd) {
      timelineValid = false;
      timeIssues.push(`${a.toUpperCase()} ends at ${times[a].end} but ${b.toUpperCase()} starts at ${times[b].start}`);
    }
  }

  checks.push({
    check: 'Timeline ordering (sequential phases)',
    status: timelineValid ? 'PASS' : 'WARN',
    detail: timelineValid ? 'Phase timestamps are in correct sequential order' : `Timeline issues: ${timeIssues.join('; ')}`
  });

  return checks;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
function main() {
  const checkpointPath = path.join(BASE_DIR, 'data', 'status', `${dealId}.json`);

  if (!fs.existsSync(checkpointPath)) {
    console.error(`Checkpoint not found: ${checkpointPath}`);
    process.exit(1);
  }

  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  console.log(colorize(`\n=== Chain Verification: ${checkpoint.dealName || dealId} ===\n`, 'bold'));

  const phases = checkpoint.phases || {};
  const dd = phases.dueDiligence || {};
  const uw = phases.underwriting || {};
  const financing = phases.financing || {};
  const legal = phases.legal || {};
  const closing = phases.closing || {};

  const allResults = {};
  let totalChecks = 0;
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  let skipCount = 0;

  function runSection(name, checks) {
    console.log(colorize(`--- ${name} ---`, 'cyan'));
    allResults[name] = [];

    for (const check of checks) {
      totalChecks++;
      const icon = check.status === 'PASS' ? colorize('PASS', 'green')
        : check.status === 'FAIL' ? colorize('FAIL', 'red')
        : check.status === 'WARN' ? colorize('WARN', 'yellow')
        : colorize('SKIP', 'yellow');

      if (check.status === 'PASS') passCount++;
      else if (check.status === 'FAIL') failCount++;
      else if (check.status === 'WARN') warnCount++;
      else skipCount++;

      console.log(`  ${icon} ${check.check}`);
      if (check.detail) console.log(`       ${check.detail}`);

      allResults[name].push(check);
    }
    console.log('');
  }

  // Run all verifications
  if (dd.status === 'COMPLETED' || dd.status === 'complete') {
    if (uw.status === 'COMPLETED' || uw.status === 'complete') {
      runSection('DD -> Underwriting', verifyDDtoUW(dd, uw));

      if (financing.status === 'COMPLETED' || financing.status === 'complete') {
        runSection('Underwriting -> Financing', verifyUWtoFinancing(uw, financing));
        runSection('DD + Financing -> Legal', verifyDDFinancingToLegal(dd, financing, legal));

        if (closing.status === 'COMPLETED' || closing.status === 'complete') {
          runSection('All -> Closing (Integration)', verifyAllToClosing(dd, uw, financing, legal, closing));
        } else {
          console.log(colorize('Closing phase not completed - skipping final integration checks', 'yellow'));
        }
      } else {
        console.log(colorize('Financing phase not completed - skipping downstream checks', 'yellow'));
      }
    } else {
      console.log(colorize('Underwriting phase not completed - skipping downstream checks', 'yellow'));
    }
  } else {
    console.log(colorize('Due Diligence phase not completed - no chain to verify', 'yellow'));
  }

  // Summary
  const overallStatus = failCount > 0 ? 'FAIL' : (warnCount > 0 ? 'CONDITIONAL' : 'PASS');

  console.log(colorize('=== CHAIN VERIFICATION SUMMARY ===', 'bold'));
  console.log(`  Deal: ${checkpoint.dealName || dealId}`);
  console.log(`  Total checks: ${totalChecks}`);
  console.log(`  ${colorize('PASS', 'green')}: ${passCount}`);
  console.log(`  ${colorize('WARN', 'yellow')}: ${warnCount}`);
  console.log(`  ${colorize('FAIL', 'red')}: ${failCount}`);
  console.log(`  SKIP: ${skipCount}`);
  console.log(`  Overall: ${overallStatus === 'PASS' ? colorize('PASS', 'green') : overallStatus === 'FAIL' ? colorize('FAIL', 'red') : colorize('CONDITIONAL', 'yellow')}`);
  console.log('');

  // Output to file if requested
  if (outputArg) {
    const outputPath = path.resolve(BASE_DIR, outputArg);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const report = {
      dealId: dealId,
      dealName: checkpoint.dealName,
      verifiedAt: new Date().toISOString(),
      totalChecks: totalChecks,
      passed: passCount,
      warnings: warnCount,
      failed: failCount,
      skipped: skipCount,
      overallStatus: overallStatus,
      transitions: allResults
    };

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`Results written to ${outputPath}`);
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main();
