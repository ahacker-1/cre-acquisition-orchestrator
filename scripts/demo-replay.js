#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  function getArg(flag, fallback = null) {
    const index = args.indexOf(flag);
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
  }
  return {
    dealPath: getArg('--deal', 'config/deal.json'),
    scenario: getArg('--scenario', 'core-plus'),
    seed: getArg('--seed', '42')
  };
}

function normalizeForDeterministicHash(value) {
  const volatileKeys = new Set([
    'startedAt',
    'lastUpdatedAt',
    'completedAt',
    'timestamp',
    'phaseId',
    'durationMs',
    'traceId',
    'runId',
    'resumeInstructions',
    'createdAt',
    'updatedAt'
  ]);

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForDeterministicHash(item));
  }

  if (value && typeof value === 'object') {
    const normalized = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        if (volatileKeys.has(key)) return;
        normalized[key] = normalizeForDeterministicHash(value[key]);
      });
    return normalized;
  }

  return value;
}

function hashCheckpoint(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const normalized = normalizeForDeterministicHash(raw);
  const payload = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function runOrchestrate(dealPath, scenario, seed) {
  const result = spawnSync(
    'node',
    [
      path.join(BASE_DIR, 'scripts', 'orchestrate.js'),
      '--deal',
      path.resolve(BASE_DIR, dealPath),
      '--scenario',
      scenario,
      '--seed',
      String(seed)
    ],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) {
    throw new Error(`orchestrate.js failed with exit code ${result.status}`);
  }
}

function main() {
  const args = parseArgs();
  const dealConfig = require(path.resolve(BASE_DIR, args.dealPath));
  const checkpointPath = path.join(BASE_DIR, 'data', 'status', `${dealConfig.dealId}.json`);

  console.log('[demo-replay] First deterministic run');
  runOrchestrate(args.dealPath, args.scenario, args.seed);
  const firstHash = hashCheckpoint(checkpointPath);

  console.log('[demo-replay] Second deterministic run (same seed)');
  runOrchestrate(args.dealPath, args.scenario, args.seed);
  const secondHash = hashCheckpoint(checkpointPath);

  console.log(`[demo-replay] Hash 1: ${firstHash}`);
  console.log(`[demo-replay] Hash 2: ${secondHash}`);
  if (firstHash === secondHash) {
    console.log('[demo-replay] Determinism check PASSED');
  } else {
    console.log('[demo-replay] Determinism check FAILED');
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`[demo-replay] Failed: ${error.message}`);
  process.exit(1);
}
