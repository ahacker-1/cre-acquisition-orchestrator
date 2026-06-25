#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');
const DEAL_PATH = path.join(BASE_DIR, 'config', 'deal.json');
const DEAL = JSON.parse(fs.readFileSync(DEAL_PATH, 'utf8'));
const DEAL_ID = DEAL.dealId;

function runNodeScript(scriptName, args = [], expectedExit = 0) {
  const scriptPath = path.join(BASE_DIR, 'scripts', scriptName);
  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: BASE_DIR,
    stdio: 'inherit',
  });
  const code = typeof result.status === 'number' ? result.status : 1;
  if (code !== expectedExit) {
    throw new Error(`${scriptName} exited with ${code}, expected ${expectedExit}`);
  }
}

function runNodeScriptCapture(scriptName, args = [], expectedExit = 0) {
  const scriptPath = path.join(BASE_DIR, 'scripts', scriptName);
  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: BASE_DIR,
    encoding: 'utf8',
  });
  const code = typeof result.status === 'number' ? result.status : 1;
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (code !== expectedExit) {
    throw new Error(`${scriptName} exited with ${code}, expected ${expectedExit}\n${output}`);
  }
  return output;
}

function cleanRuntime() {
  const runtimeDirs = ['logs', 'normalized', 'phase-outputs', 'reports', 'status'];
  const ledgerPath = path.join(BASE_DIR, 'data', 'status', 'pipeline-verification-ledger.md');
  const ledger = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : null;
  for (const dir of runtimeDirs) {
    const fullPath = path.join(BASE_DIR, 'data', dir);
    fs.rmSync(fullPath, { recursive: true, force: true });
    fs.mkdirSync(fullPath, { recursive: true });
  }
  if (ledger !== null) {
    fs.writeFileSync(ledgerPath, ledger);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runLaunchDealCommandHintTest() {
  cleanRuntime();
  const output = runNodeScriptCapture('launch-deal.js', ['--deal', DEAL_PATH, '--phases', 'all']);
  const expectedCommand =
    'node scripts/codex-agent-runner.js --deal config/deal.json --workflow full-acquisition-review --concurrency 2 --search';
  assert(
    output.includes(expectedCommand),
    `launch-deal should print the deal-specific live Codex command: ${expectedCommand}`
  );
  assert(
    !output.includes('npm run codex:run'),
    'launch-deal should not point at the generic codex:run script after a deal-specific launch'
  );
  assert(
    fs.existsSync(path.join(BASE_DIR, 'data', 'status', DEAL_ID, 'launch-prompt.md')),
    'launch-deal should still write the generated prompt'
  );
}

function summarizeRun(runId, scenarioName) {
  const checkpointPath = path.join(BASE_DIR, 'data', 'status', `${DEAL_ID}.json`);
  const eventsPath = path.join(BASE_DIR, 'data', 'status', DEAL_ID, `run-${runId}-events.ndjson`);
  const docsPath = path.join(BASE_DIR, 'data', 'status', DEAL_ID, `run-${runId}-documents.json`);

  assert(fs.existsSync(checkpointPath), `Missing checkpoint: ${checkpointPath}`);
  assert(fs.existsSync(eventsPath), `Missing events file: ${eventsPath}`);
  assert(fs.existsSync(docsPath), `Missing documents file: ${docsPath}`);

  const checkpoint = readJson(checkpointPath);
  const events = readNdjson(eventsPath);
  const documentsPayload = readJson(docsPath);
  const documents = Array.isArray(documentsPayload.documents) ? documentsPayload.documents : [];
  const uniquePaths = new Set(documents.map((doc) => doc.path));

  assert(checkpoint.status === 'COMPLETE', `[${scenarioName}] checkpoint status expected COMPLETE`);
  assert(events.length >= 40, `[${scenarioName}] expected at least 40 story events, got ${events.length}`);
  assert(
    events.filter((event) => event.kind === 'decision_made').length >= 5,
    `[${scenarioName}] expected at least 5 decisions`
  );
  assert(
    events.some((event) => event.kind === 'run_completed'),
    `[${scenarioName}] expected run_completed event`
  );
  assert(documents.length >= 30, `[${scenarioName}] expected at least 30 documents, got ${documents.length}`);
  assert(
    uniquePaths.size === documents.length,
    `[${scenarioName}] expected unique artifact paths (${uniquePaths.size}/${documents.length})`
  );
  assert(
    documents.some((doc) => doc.docType === 'final-report'),
    `[${scenarioName}] expected final report artifact`
  );
  assert(
    documents.some((doc) => doc.title === 'Final Acquisition Report'),
    `[${scenarioName}] missing titled final report document`
  );

  return {
    scenario: scenarioName,
    status: checkpoint.status,
    runId,
    events: events.length,
    documents: documents.length,
  };
}

function runScenarioMatrix() {
  const scenarios = [
    { scenario: 'core-plus', seed: 42 },
    { scenario: 'value-add', seed: 777 },
    { scenario: 'distressed', seed: 2026 },
  ];

  const results = [];
  for (const item of scenarios) {
    cleanRuntime();
    const runId = `test-${item.scenario}-${item.seed}`;
    runNodeScript('orchestrate.js', [
      '--deal',
      DEAL_PATH,
      '--scenario',
      item.scenario,
      '--seed',
      String(item.seed),
      '--run-id',
      runId,
      '--agent-delay-ms',
      '10',
    ]);
    runNodeScript('validate-contracts.js', ['--deal-id', DEAL_ID]);
    results.push(summarizeRun(runId, item.scenario));
  }
  return results;
}

function runFailureResumeTest() {
  cleanRuntime();
  const runId = 'test-failure-resume';

  runNodeScript(
    'orchestrate.js',
    [
      '--deal',
      DEAL_PATH,
      '--scenario',
      'value-add',
      '--seed',
      '999',
      '--run-id',
      runId,
      '--fail-agent',
      'estoppel-tracker',
      '--agent-delay-ms',
      '10',
    ],
    1
  );

  const checkpointPath = path.join(BASE_DIR, 'data', 'status', `${DEAL_ID}.json`);
  const checkpointAfterFailure = readJson(checkpointPath);
  assert(
    checkpointAfterFailure.status === 'FAILED',
    'Failure injection should produce FAILED checkpoint status'
  );

  runNodeScript('orchestrate.js', [
    '--deal',
    DEAL_PATH,
    '--scenario',
    'value-add',
    '--seed',
    '999',
    '--run-id',
    runId,
    '--resume',
    '--agent-delay-ms',
    '10',
  ]);

  runNodeScript('validate-contracts.js', ['--deal-id', DEAL_ID]);

  const checkpointAfterResume = readJson(checkpointPath);
  assert(
    checkpointAfterResume.status === 'COMPLETE',
    'Resume flow should complete pipeline'
  );

  const eventsPath = path.join(BASE_DIR, 'data', 'status', DEAL_ID, `run-${runId}-events.ndjson`);
  const events = readNdjson(eventsPath);
  assert(events.some((event) => event.kind === 'agent_failed'), 'Failure test expected agent_failed event');
  assert(events.some((event) => event.kind === 'run_completed'), 'Failure test expected run_completed event');

  return {
    scenario: 'failure-resume',
    status: checkpointAfterResume.status,
    runId,
    events: events.length,
  };
}

function main() {
  console.log('[system-test] Running launch-deal command hint check...');
  runLaunchDealCommandHintTest();

  console.log('[system-test] Running scenario matrix...');
  const matrix = runScenarioMatrix();

  console.log('[system-test] Running failure + resume flow...');
  const failureResume = runFailureResumeTest();

  console.log('[system-test] Results:');
  for (const result of matrix) {
    console.log(
      `  - ${result.scenario}: status=${result.status}, runId=${result.runId}, events=${result.events}, docs=${result.documents}`
    );
  }
  console.log(
    `  - ${failureResume.scenario}: status=${failureResume.status}, runId=${failureResume.runId}, events=${failureResume.events}`
  );
  console.log('[system-test] PASS');
}

try {
  main();
} catch (error) {
  console.error(`[system-test] FAIL: ${error.message}`);
  process.exit(1);
}
