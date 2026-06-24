#!/usr/bin/env node
/**
 * launch-deal.js (Task 13.1)
 *
 * Prepares a deal for pipeline execution. Validates deal config, creates
 * required directories, writes initial checkpoint and deal status,
 * and outputs a legacy agent prompt for manual runtimes.
 *
 * Usage:
 *   node scripts/launch-deal.js
 *   node scripts/launch-deal.js --deal config/deal.json
 *   node scripts/launch-deal.js --deal config/deal.json --phases dd,uw
 *   node scripts/launch-deal.js --deal config/deal.json --resume
 *   node scripts/launch-deal.js --phases all
 *   node scripts/launch-deal.js --phases due-diligence,underwriting,financing
 *
 * Options:
 *   --deal <path>    Path to deal config JSON (default: config/deal.json)
 *   --phases <list>  Comma-separated phases to run: all, or any of:
 *                    dd|due-diligence, uw|underwriting, financing, legal, closing
 *   --resume         Resume from existing checkpoint instead of fresh start
 */

const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------------
// Path resolution
// ------------------------------------------------------------------
const BASE_DIR = path.resolve(__dirname, '..');

// ------------------------------------------------------------------
// CLI argument parsing
// ------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

function hasFlag(flag) {
  return args.includes(flag);
}

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
Usage: node scripts/launch-deal.js [options]

Options:
  --deal <path>    Path to deal config JSON (default: config/deal.json)
  --phases <list>  Comma-separated phases to run (default: all)
                   Valid: dd, due-diligence, uw, underwriting, financing, legal, closing
  --resume         Resume from existing checkpoint
  --help, -h       Show this help message
`);
  process.exit(0);
}

const dealPath = path.resolve(BASE_DIR, getArg('--deal', 'config/deal.json'));
const phasesArg = getArg('--phases', 'all');
const resumeMode = hasFlag('--resume');

// ------------------------------------------------------------------
// Phase definitions
// ------------------------------------------------------------------
const VALID_PHASES = {
  'dd': 'due-diligence',
  'due-diligence': 'due-diligence',
  'uw': 'underwriting',
  'underwriting': 'underwriting',
  'financing': 'financing',
  'legal': 'legal',
  'closing': 'closing'
};

const PHASE_KEYS = {
  'due-diligence': 'dueDiligence',
  'underwriting': 'underwriting',
  'financing': 'financing',
  'legal': 'legal',
  'closing': 'closing'
};

const ALL_PHASES = ['due-diligence', 'underwriting', 'financing', 'legal', 'closing'];

const PHASE_AGENTS = {
  'dueDiligence': ['rent-roll-analyst', 'opex-analyst', 'physical-inspection', 'legal-title-review', 'market-study', 'tenant-credit', 'environmental-review'],
  'underwriting': ['financial-model-builder', 'scenario-analyst', 'ic-memo-writer'],
  'financing': ['lender-outreach', 'quote-comparator', 'term-sheet-builder'],
  'legal': ['psa-reviewer', 'loan-doc-reviewer', 'title-survey-reviewer', 'estoppel-tracker', 'insurance-coordinator', 'transfer-doc-preparer'],
  'closing': ['closing-coordinator', 'funds-flow-manager']
};

// ------------------------------------------------------------------
// Console helpers
// ------------------------------------------------------------------
function colorize(text, color) {
  const c = {
    green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
    cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m', reset: '\x1b[0m'
  };
  return `${c[color] || ''}${text}${c.reset}`;
}

function logStep(icon, message) {
  console.log(`  ${icon} ${message}`);
}

function logError(message) {
  console.error(colorize(`  ERROR: ${message}`, 'red'));
}

function repoRelative(filePath) {
  return path.relative(BASE_DIR, filePath).replace(/\\/g, '/') || '.';
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function workflowForPhases(phases) {
  const phaseSet = new Set(phases);
  if (phases.length === ALL_PHASES.length) return 'full-acquisition-review';
  if (phases.length === 1 && phaseSet.has('underwriting')) return 'underwriting-refresh';
  if (phases.length === 1 && phaseSet.has('legal')) return 'legal-psa-review';
  if (phaseSet.has('due-diligence') && phaseSet.has('underwriting') && phases.length === 2) return 'quick-deal-screen';
  if (phaseSet.has('underwriting') && phaseSet.has('financing') && phases.length === 2) return 'financing-package';
  return 'full-acquisition-review';
}

function buildCodexCommand(dealConfigPath, phases) {
  const workflowId = workflowForPhases(phases);
  const command = [
    'node',
    'scripts/codex-agent-runner.js',
    '--deal',
    repoRelative(dealConfigPath),
    '--workflow',
    workflowId,
    '--concurrency',
    '2',
    '--search'
  ];
  return command.map(shellQuote).join(' ');
}

// ------------------------------------------------------------------
// Validation
// ------------------------------------------------------------------
function validateDealConfig(deal) {
  const errors = [];

  // Required top-level fields
  const requiredTopLevel = ['dealId', 'dealName', 'property', 'financials', 'financing', 'investmentStrategy', 'targetHoldPeriod', 'targetIRR', 'targetEquityMultiple', 'targetCashOnCash', 'seller', 'timeline'];
  for (const field of requiredTopLevel) {
    if (deal[field] === undefined || deal[field] === null || deal[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Required property fields
  if (deal.property) {
    const requiredProperty = ['address', 'city', 'state', 'zip', 'propertyType', 'yearBuilt', 'totalUnits'];
    for (const field of requiredProperty) {
      if (!deal.property[field] && deal.property[field] !== 0) {
        errors.push(`Missing required property field: property.${field}`);
      }
    }
    if (deal.property.unitMix && (!deal.property.unitMix.types || deal.property.unitMix.types.length === 0)) {
      errors.push('property.unitMix.types must have at least one entry');
    }
  }

  // Required financials
  if (deal.financials) {
    if (!deal.financials.askingPrice) errors.push('Missing required field: financials.askingPrice');
    if (deal.financials.currentNOI === null || deal.financials.currentNOI === undefined) errors.push('Missing required field: financials.currentNOI');
    if (deal.financials.inPlaceOccupancy === null || deal.financials.inPlaceOccupancy === undefined) errors.push('Missing required field: financials.inPlaceOccupancy');
  }

  // Required financing
  if (deal.financing) {
    const requiredFinancing = ['targetLTV', 'estimatedRate', 'loanTerm', 'amortization', 'loanType'];
    for (const field of requiredFinancing) {
      if (deal.financing[field] === undefined || deal.financing[field] === null) {
        errors.push(`Missing required financing field: financing.${field}`);
      }
    }
  }

  // Required timeline
  if (deal.timeline) {
    const requiredTimeline = ['psaExecutionDate', 'ddStartDate', 'ddExpirationDate', 'closingDate'];
    for (const field of requiredTimeline) {
      if (!deal.timeline[field]) {
        errors.push(`Missing required timeline field: timeline.${field}`);
      }
    }
  }

  // Required seller
  if (deal.seller && !deal.seller.entity) {
    errors.push('Missing required field: seller.entity');
  }

  // Deal IDs become file and directory names, so keep them portable and traversal-safe.
  if (deal.dealId && (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(deal.dealId) || deal.dealId.includes('..'))) {
    errors.push(`dealId format invalid: "${deal.dealId}" (use 1-120 letters, numbers, dots, underscores, or hyphens)`);
  }

  return errors;
}

function validateAgainstSchema(deal, schemaPath) {
  if (!fs.existsSync(schemaPath)) {
    return { valid: true, skipped: true };
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (e) {
    return { valid: false, skipped: false, error: `Failed to parse schema: ${e.message}` };
  }

  // Basic required field check from schema
  const schemaErrors = [];
  if (schema.required) {
    for (const field of schema.required) {
      if (deal[field] === undefined || deal[field] === null || deal[field] === '') {
        schemaErrors.push(`Schema requires field: ${field}`);
      }
    }
  }

  // Check nested required fields
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.type === 'object' && prop.required && deal[key]) {
        for (const subField of prop.required) {
          const val = deal[key][subField];
          if (val === undefined || val === null || val === '') {
            schemaErrors.push(`Schema requires field: ${key}.${subField}`);
          }
        }
      }
    }
  }

  return {
    valid: schemaErrors.length === 0,
    skipped: false,
    errors: schemaErrors
  };
}

function parsePhases(phasesStr) {
  if (phasesStr === 'all') {
    return ALL_PHASES.slice();
  }

  const requested = phasesStr.split(',').map(p => p.trim().toLowerCase());
  const resolved = [];
  const invalid = [];

  for (const p of requested) {
    if (VALID_PHASES[p]) {
      const canonical = VALID_PHASES[p];
      if (!resolved.includes(canonical)) {
        resolved.push(canonical);
      }
    } else {
      invalid.push(p);
    }
  }

  if (invalid.length > 0) {
    return { error: `Invalid phase names: ${invalid.join(', ')}. Valid: ${Object.keys(VALID_PHASES).join(', ')}` };
  }

  return resolved;
}

// ------------------------------------------------------------------
// Directory and file creation
// ------------------------------------------------------------------
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  }
  return false;
}

function createDirectories(dealId) {
  const dirs = [
    path.join(BASE_DIR, 'data', 'status', dealId),
    path.join(BASE_DIR, 'data', 'status', dealId, 'agents'),
    path.join(BASE_DIR, 'data', 'logs', dealId),
    path.join(BASE_DIR, 'data', 'reports', dealId)
  ];

  const results = [];
  for (const dir of dirs) {
    try {
      const created = ensureDir(dir);
      results.push({ path: dir, created, error: null });
    } catch (err) {
      results.push({ path: dir, created: false, error: err.message });
    }
  }

  return results;
}

function writeInitialCheckpoint(deal, phases) {
  const dealId = deal.dealId;
  const now = new Date().toISOString();

  const phaseEntries = {};
  for (const phase of ALL_PHASES) {
    const phaseKey = PHASE_KEYS[phase];
    const agents = PHASE_AGENTS[phaseKey] || [];
    const agentStatuses = {};
    for (const agent of agents) {
      agentStatuses[agent] = 'PENDING';
    }

    phaseEntries[phaseKey] = {
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

  const checkpoint = {
    dealId: dealId,
    dealName: `${deal.dealName} Acquisition`,
    property: {
      name: deal.dealName,
      address: [deal.property.address, deal.property.city, deal.property.state, deal.property.zip].filter(Boolean).join(', '),
      units: deal.property.totalUnits,
      yearBuilt: deal.property.yearBuilt,
      type: deal.property.propertyType || 'multifamily',
      class: 'B'
    },
    strategy: deal.investmentStrategy,
    status: 'PENDING',
    currentPhase: null,
    overallProgress: 0,
    overallVerdict: null,
    startedAt: now,
    lastUpdatedAt: now,
    completedAt: null,
    traceId: `${dealId}-${Date.now()}`,
    runtimeParameters: {
      phasesToRun: phases.join(','),
      resumeMode: false
    },
    phases: phaseEntries,
    events: []
  };

  const checkpointPath = path.join(BASE_DIR, 'data', 'status', `${dealId}.json`);
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
  return checkpointPath;
}

function writeInitialSessionState(deal, phases) {
  const now = new Date().toISOString();
  const phaseList = phases.map(p => {
    const key = PHASE_KEYS[p];
    const agents = PHASE_AGENTS[key] || [];
    return `| ${p} | PENDING | 0/${agents.length} |`;
  }).join('\n');

  const content = `# Session State - CRE Acquisition Orchestration System

## Active Deal: ${deal.dealId}

**Deal Name:** ${deal.dealName}
**Property:** ${deal.property.address}, ${deal.property.city}, ${deal.property.state} ${deal.property.zip}
**Units:** ${deal.property.totalUnits}
**Asking Price:** $${(deal.financials.askingPrice || 0).toLocaleString()}
**Strategy:** ${deal.investmentStrategy}
**Pipeline Status:** PENDING
**Overall Progress:** 0%
**Started:** ${now}

---

## Phase Status

| Phase | Status | Agents |
|-------|--------|--------|
${phaseList}

---

## Runtime Parameters

- **Phases to Run:** ${phases.join(', ')}
- **Resume Mode:** No

---

*Initialized by launch-deal.js at ${now}*
`;

  const sessionPath = path.join(BASE_DIR, 'data', 'status', 'session-state.md');
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, content);
  return sessionPath;
}

// ------------------------------------------------------------------
// Prompt construction
// ------------------------------------------------------------------
function buildPrompt(deal, phases, resumeMode) {
  const orchestratorPath = path.join(BASE_DIR, 'orchestrators', 'master-orchestrator.md');
  if (!fs.existsSync(orchestratorPath)) {
    throw new Error(`Master orchestrator prompt not found: ${orchestratorPath}`);
  }

  const orchestratorPrompt = fs.readFileSync(orchestratorPath, 'utf8');
  const dealConfig = JSON.stringify(deal, null, 2);

  const runtimeParams = [];
  if (phases.length < ALL_PHASES.length) {
    runtimeParams.push(`phasesToRun=${phases.join(',')}`);
  }
  if (resumeMode) {
    runtimeParams.push('resume=true');
  }

  // Determine if startFromPhase is relevant
  const firstPhase = phases[0];
  if (firstPhase !== 'due-diligence' && !resumeMode) {
    runtimeParams.push(`startFromPhase=${firstPhase}`);
  }

  const runtimeSection = runtimeParams.length > 0
    ? `\n\n---\n\nRUNTIME PARAMETERS:\n${runtimeParams.join('\n')}\n`
    : '';

  const prompt = `${orchestratorPrompt}

---

DEAL CONFIG:
\`\`\`json
${dealConfig}
\`\`\`
${runtimeSection}`;

  return prompt;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
function main() {
  console.log(colorize('\n=== CRE Acquisition - Deal Launcher ===\n', 'bold'));

  // Step 1: Read and validate deal config
  logStep('1.', 'Loading deal configuration...');

  if (!fs.existsSync(dealPath)) {
    logError(`Deal config not found: ${dealPath}`);
    console.log(`\n  Create or specify a deal config file:`);
    console.log(`    node scripts/launch-deal.js --deal path/to/deal.json\n`);
    process.exit(1);
  }

  let deal;
  try {
    const raw = fs.readFileSync(dealPath, 'utf8');
    deal = JSON.parse(raw);
  } catch (err) {
    logError(`Invalid JSON in deal config: ${err.message}`);
    process.exit(1);
  }

  logStep(colorize('OK', 'green'), `Loaded: ${deal.dealName || deal.dealId || 'unknown'} from ${dealPath}`);

  // Step 2: Validate required fields
  logStep('2.', 'Validating deal configuration...');

  const validationErrors = validateDealConfig(deal);
  if (validationErrors.length > 0) {
    logError(`Deal config has ${validationErrors.length} validation error(s):`);
    for (const err of validationErrors) {
      console.log(colorize(`       - ${err}`, 'red'));
    }
    process.exit(1);
  }

  logStep(colorize('OK', 'green'), 'All required fields present');

  // Step 3: Validate against JSON schema (if exists)
  const schemaPath = path.join(BASE_DIR, 'config', 'deal-schema.json');
  logStep('3.', 'Checking JSON schema...');

  const schemaResult = validateAgainstSchema(deal, schemaPath);
  if (schemaResult.skipped) {
    logStep(colorize('SKIP', 'yellow'), 'No deal-schema.json found, skipping schema validation');
  } else if (!schemaResult.valid) {
    if (schemaResult.error) {
      logError(schemaResult.error);
    } else {
      logError(`Schema validation found ${schemaResult.errors.length} error(s):`);
      for (const err of schemaResult.errors) {
        console.log(colorize(`       - ${err}`, 'red'));
      }
    }
    process.exit(1);
  } else {
    logStep(colorize('OK', 'green'), 'Schema validation passed');
  }

  // Step 4: Parse and validate phases
  logStep('4.', 'Resolving phases...');

  const phases = parsePhases(phasesArg);
  if (phases.error) {
    logError(phases.error);
    process.exit(1);
  }

  logStep(colorize('OK', 'green'), `Phases: ${phases.join(', ')}`);

  // Step 5: Check for resume mode
  const dealId = deal.dealId;
  const existingCheckpoint = path.join(BASE_DIR, 'data', 'status', `${dealId}.json`);

  if (resumeMode) {
    logStep('5.', 'Checking for existing checkpoint (resume mode)...');
    if (!fs.existsSync(existingCheckpoint)) {
      logError(`No existing checkpoint found for ${dealId}. Cannot resume.`);
      console.log(`       Expected: ${existingCheckpoint}`);
      process.exit(1);
    }
    logStep(colorize('OK', 'green'), `Found checkpoint: ${existingCheckpoint}`);
  } else {
    logStep('5.', 'Fresh start mode');
  }

  // Step 6: Create directories
  logStep('6.', 'Creating directories...');

  const dirResults = createDirectories(dealId);
  let dirErrors = 0;
  for (const result of dirResults) {
    if (result.error) {
      logError(`Failed to create ${result.path}: ${result.error}`);
      dirErrors++;
    } else {
      const relPath = path.relative(BASE_DIR, result.path);
      const status = result.created ? 'CREATED' : 'EXISTS';
      logStep(colorize(status, result.created ? 'green' : 'dim'), relPath);
    }
  }

  if (dirErrors > 0) {
    logError(`${dirErrors} directory creation failure(s). Aborting.`);
    process.exit(1);
  }

  // Step 7: Write initial checkpoint (fresh start only)
  if (!resumeMode) {
    logStep('7.', 'Writing initial master checkpoint...');
    try {
      const cpPath = writeInitialCheckpoint(deal, phases);
      logStep(colorize('OK', 'green'), `Checkpoint: ${path.relative(BASE_DIR, cpPath)}`);
    } catch (err) {
      logError(`Failed to write checkpoint: ${err.message}`);
      process.exit(1);
    }
  } else {
    logStep('7.', 'Skipping checkpoint write (resume mode)');
  }

  // Step 8: Write initial session state (fresh start only)
  if (!resumeMode) {
    logStep('8.', 'Writing session state...');
    try {
      const ssPath = writeInitialSessionState(deal, phases);
      logStep(colorize('OK', 'green'), `Session state: ${path.relative(BASE_DIR, ssPath)}`);
    } catch (err) {
      logError(`Failed to write session state: ${err.message}`);
      process.exit(1);
    }
  } else {
    logStep('8.', 'Preserving existing session state (resume mode)');
  }

  // Step 9: Build and output the prompt
  logStep('9.', 'Constructing pipeline prompt...');

  let prompt;
  try {
    prompt = buildPrompt(deal, phases, resumeMode);
  } catch (err) {
    logError(`Failed to build prompt: ${err.message}`);
    process.exit(1);
  }

  // Write prompt to a file for easy use
  const promptPath = path.join(BASE_DIR, 'data', 'status', dealId, 'launch-prompt.md');
  try {
    fs.writeFileSync(promptPath, prompt);
    logStep(colorize('OK', 'green'), `Prompt written to: ${path.relative(BASE_DIR, promptPath)}`);
  } catch (err) {
    logError(`Failed to write prompt file: ${err.message}`);
    // Non-fatal: still output to console
  }

  // Summary
  console.log(colorize('\n=== Launch Preparation Complete ===\n', 'bold'));
  console.log(`  Deal:       ${deal.dealName} (${dealId})`);
  console.log(`  Property:   ${deal.property.address}, ${deal.property.city}, ${deal.property.state}`);
  console.log(`  Units:      ${deal.property.totalUnits}`);
  console.log(`  Price:      $${(deal.financials.askingPrice || 0).toLocaleString()}`);
  console.log(`  Strategy:   ${deal.investmentStrategy}`);
  console.log(`  Phases:     ${phases.join(', ')}`);
  console.log(`  Mode:       ${resumeMode ? 'RESUME' : 'FRESH START'}`);
  console.log('');
  console.log(`  Checkpoint: data/status/${dealId}.json`);
  console.log(`  Logs:       data/logs/${dealId}/`);
  console.log(`  Reports:    data/reports/${dealId}/`);
  console.log(`  Prompt:     data/status/${dealId}/launch-prompt.md`);
  console.log('');
  console.log(colorize('  Next step:', 'cyan') + ' Use the generated prompt in your preferred agent runtime, or run Codex directly:');
  console.log('');
  console.log(`    Read data/status/${dealId}/launch-prompt.md`);
  console.log(`    ${buildCodexCommand(dealPath, phases)}`);
  console.log('');

  // Output prompt length info
  console.log(colorize(`  Prompt size: ${(prompt.length / 1024).toFixed(1)} KB (${prompt.split('\n').length} lines)`, 'dim'));
  console.log('');
}

// ------------------------------------------------------------------
// Entry point
// ------------------------------------------------------------------
try {
  main();
} catch (err) {
  console.error(colorize(`\nFATAL: ${err.message}`, 'red'));
  if (err.stack) {
    console.error(colorize(err.stack, 'dim'));
  }
  process.exit(1);
}
