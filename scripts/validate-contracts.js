#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { validateFile, readJson } = require('./lib/schema-validator');
const { PHASES } = require('./lib/runtime-core');
const { getWorkflowById, createWorkflowRunPlan } = require('./lib/workflow-catalog');
const { resolveCodexRunArtifactPath } = require('./lib/codex-manifest-paths');
const { assertWithinBase } = require('./lib/safe-paths');

const BASE_DIR = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  function getArg(flag, fallback = null) {
    const index = args.indexOf(flag);
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
  }
  return {
    dealId: getArg('--deal-id', null),
    dealPath: path.resolve(BASE_DIR, getArg('--deal', 'config/deal.json')),
    codexRunId: getArg('--codex-run-id', null)
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function resolveRepoArtifactPath(relPath, label) {
  if (typeof relPath !== 'string' || relPath.trim().length === 0) {
    throw new Error(`${label} is missing`);
  }
  return assertWithinBase(BASE_DIR, path.resolve(BASE_DIR, relPath), label);
}

function validateUnderwritingArtifacts(phaseOutput) {
  const errors = [];
  let scenarioMatrixPath = null;
  let icMemoPath = null;

  try {
    scenarioMatrixPath = resolveRepoArtifactPath(phaseOutput.scenarioMatrixPath, 'underwriting scenarioMatrixPath');
  } catch (error) {
    errors.push(error.message);
  }
  try {
    icMemoPath = resolveRepoArtifactPath(phaseOutput.icMemoPath, 'underwriting icMemoPath');
  } catch (error) {
    errors.push(error.message);
  }

  if (scenarioMatrixPath) {
    if (!fs.existsSync(scenarioMatrixPath)) {
      errors.push(`missing underwriting scenario matrix: ${scenarioMatrixPath}`);
    } else {
      const scenarios = readJson(scenarioMatrixPath);
      if (!Array.isArray(scenarios)) {
        errors.push('underwriting scenario matrix artifact must be an array');
      } else if (scenarios.length !== 27) {
        errors.push(`underwriting scenario matrix artifact expected 27 rows, received ${scenarios.length}`);
      }
      if (Array.isArray(phaseOutput.scenarioMatrix) && scenarios.length !== phaseOutput.scenarioMatrix.length) {
        errors.push('underwriting scenario matrix artifact row count does not match phase output');
      }
    }
  }

  if (icMemoPath) {
    if (!fs.existsSync(icMemoPath)) {
      errors.push(`missing underwriting IC memo: ${icMemoPath}`);
    } else {
      const memo = fs.readFileSync(icMemoPath, 'utf8');
      if (!memo.includes('# IC Memo')) errors.push('underwriting IC memo artifact missing IC Memo heading');
      if (!memo.includes('## Recommendation')) errors.push('underwriting IC memo artifact missing recommendation section');
    }
  }

  return {
    item: 'phase-underwriting-artifacts',
    valid: errors.length === 0,
    errors
  };
}

function validateClosingArtifacts(phaseOutput) {
  const errors = [];
  const wires = Array.isArray(phaseOutput.wireSchedule) ? phaseOutput.wireSchedule : [];
  const sources = Array.isArray(phaseOutput.fundsFlow?.sources) ? phaseOutput.fundsFlow.sources : [];

  function sourceAmount(name) {
    return sources.find((source) => source.item === name)?.amount;
  }

  function wireAmount(name) {
    return wires.find((wire) => wire.source === name)?.amount;
  }

  if (wires.length < 2) {
    errors.push('closing wire schedule must include at least senior loan and buyer equity wires');
  }

  ['Senior Loan Proceeds', 'Buyer Equity'].forEach((sourceName) => {
    const expected = sourceAmount(sourceName);
    const actual = wireAmount(sourceName);
    if (typeof expected !== 'number') {
      errors.push(`closing funds flow missing source: ${sourceName}`);
    } else if (typeof actual !== 'number') {
      errors.push(`closing wire schedule missing wire for source: ${sourceName}`);
    } else if (Math.round(expected) !== Math.round(actual)) {
      errors.push(`closing wire schedule ${sourceName} amount ${actual} does not match funds flow source ${expected}`);
    }
  });

  wires.forEach((wire, index) => {
    if (!wire.control || String(wire.control).trim().length < 10) {
      errors.push(`closing wire ${index + 1} missing control detail`);
    }
    if (!wire.dueDate || String(wire.dueDate).trim().length === 0) {
      errors.push(`closing wire ${index + 1} missing dueDate`);
    }
  });

  return {
    item: 'phase-closing-artifacts',
    valid: errors.length === 0,
    errors
  };
}

function validateCodexRun(runId) {
  const errors = [];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId) || runId.includes('..')) {
    errors.push('run id must be a safe slug');
    return { item: `codex-run-${runId}`, valid: false, errors };
  }

  const runDir = path.join(BASE_DIR, 'data', 'codex-runs', runId);
  const manifestPath = path.join(runDir, 'manifest.json');
  const summaryPath = path.join(runDir, 'summary.md');
  if (!fs.existsSync(manifestPath)) errors.push(`missing manifest: ${manifestPath}`);
  if (!fs.existsSync(summaryPath)) errors.push(`missing summary: ${summaryPath}`);
  if (errors.length > 0) return { item: `codex-run-${runId}`, valid: false, errors };

  const manifest = readJson(manifestPath);
  const manifestSchemaPath = path.join(BASE_DIR, 'schemas', 'codex', 'run-manifest.schema.json');
  const manifestSchema = validateFile(manifestSchemaPath, manifest, 'codexRunManifest');
  if (!manifestSchema.valid) {
    errors.push(...manifestSchema.errors.map((error) => `manifest schema: ${error}`));
  }

  if (manifest.runId !== runId) errors.push(`manifest runId mismatch: ${manifest.runId}`);
  if (!manifest.dealId) errors.push('manifest.dealId is required');
  if (!['COMPLETE', 'FAILED', 'DRY_RUN'].includes(manifest.status)) {
    errors.push(`manifest.status is invalid: ${manifest.status}`);
  }
  if (manifest.codexLoginStatus && !String(manifest.codexLoginStatus).includes('Logged in')) {
    errors.push(`unexpected codexLoginStatus: ${manifest.codexLoginStatus}`);
  }
  if (!Array.isArray(manifest.selectedAgents) || manifest.selectedAgents.length === 0) {
    errors.push('manifest.selectedAgents must include at least one agent');
  }
  if (!Array.isArray(manifest.results) || manifest.results.length === 0) {
    errors.push('manifest.results must include at least one result');
  } else {
    manifest.results.forEach((result, index) => {
      if (!result.agentName) errors.push(`result ${index} missing agentName`);
      if (!result.phaseLabel) errors.push(`result ${index} missing phaseLabel`);
      if (!['PASS', 'FAIL', 'DRY_RUN'].includes(result.status)) {
        errors.push(`result ${index} has invalid status: ${result.status}`);
      }
      for (const key of ['promptPath', 'logPath']) {
        if (result[key]) {
          try {
            resolveCodexRunArtifactPath(BASE_DIR, runDir, result[key], `result ${index} ${key}`);
          } catch (error) {
            errors.push(error.message);
          }
        }
      }
      if (result.status === 'PASS') {
        let outputPath = null;
        if (result.outputPath) {
          try {
            outputPath = resolveCodexRunArtifactPath(BASE_DIR, runDir, result.outputPath, `result ${index} outputPath`);
          } catch (error) {
            errors.push(error.message);
          }
        }
        if (!outputPath || !fs.existsSync(outputPath)) {
          errors.push(`result ${index} missing output file: ${result.outputPath || 'none'}`);
        }
      }
    });
  }

  if (manifest.dealId) {
    const storyBase = path.join(BASE_DIR, 'data', 'status', manifest.dealId, `run-${runId}`);
    const storyManifestPath = `${storyBase}-manifest.json`;
    const eventsPath = `${storyBase}-events.ndjson`;
    const documentsPath = `${storyBase}-documents.json`;
    if (!fs.existsSync(storyManifestPath)) errors.push(`missing dashboard run manifest: ${storyManifestPath}`);
    if (!fs.existsSync(eventsPath)) errors.push(`missing dashboard run events: ${eventsPath}`);
    if (!fs.existsSync(documentsPath)) errors.push(`missing dashboard run documents: ${documentsPath}`);

    if (fs.existsSync(storyManifestPath)) {
      const storyManifest = readJson(storyManifestPath);
      if (storyManifest.runtimeProvider !== 'codex') errors.push('dashboard run manifest runtimeProvider must be codex');
      if (storyManifest.codexRunDir !== path.relative(BASE_DIR, runDir).replace(/\\/g, '/')) {
        errors.push('dashboard run manifest codexRunDir does not point to the Codex run directory');
      }
    }

    if (fs.existsSync(eventsPath)) {
      const lines = fs
        .readFileSync(eventsPath, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
      if (lines.length === 0) errors.push('dashboard run events file is empty');
      const events = lines.map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          errors.push(`dashboard run event ${index + 1} is invalid JSON: ${error.message}`);
          return null;
        }
      }).filter(Boolean);
      if (!events.some((event) => event.kind === 'run_completed')) {
        errors.push('dashboard run events must include run_completed');
      }
    }

    if (fs.existsSync(documentsPath)) {
      const documents = readJson(documentsPath);
      const documentList = Array.isArray(documents.documents) ? documents.documents : [];
      if (documentList.length === 0) {
        errors.push('dashboard run documents must include at least one artifact');
      }
      if (
        manifest.results?.some((result) => result.status === 'PASS') &&
        !documentList.some((document) => document.docType === 'codex-agent-memo')
      ) {
        errors.push('dashboard run documents must include Codex agent memos for successful runs');
      }
      if (!documentList.some((document) => document.docType === 'codex-run-summary')) {
        errors.push('dashboard run documents must include the Codex run summary');
      }
    }
  }

  return {
    item: `codex-run-${runId}`,
    valid: errors.length === 0,
    errors
  };
}

function main() {
  const args = parseArgs();
  let dealId = args.dealId;
  if (!dealId && fs.existsSync(args.dealPath)) {
    const deal = readJson(args.dealPath);
    dealId = deal.dealId || null;
  }
  if (!dealId && !args.codexRunId) {
    fail('Usage: node scripts/validate-contracts.js --deal-id <DEAL-ID> [--codex-run-id <RUN-ID>]');
  }

  const results = [];
  if (dealId) {
    const checkpointPath = path.join(BASE_DIR, 'data', 'status', `${dealId}.json`);
    if (!fs.existsSync(checkpointPath)) {
      if (!args.codexRunId) {
        fail(`Checkpoint not found: ${checkpointPath}\nRun npm run demo first, then rerun npm run validate.`);
      }
      console.warn(`[validate] Skipping checkpoint validation because no checkpoint was found for ${dealId}.`);
    } else {
      const masterSchema = path.join(BASE_DIR, 'schemas/checkpoint/master-checkpoint.schema.json');
      const checkpoint = readJson(checkpointPath);
      results.push({
        item: 'master-checkpoint',
        ...validateFile(masterSchema, checkpoint, 'masterCheckpoint')
      });

  PHASES.forEach((phase) => {
    const phaseOutputPath = path.join(BASE_DIR, 'data', 'phase-outputs', dealId, `${phase.slug}-output.json`);
    if (!fs.existsSync(phaseOutputPath)) return;
    const schemaPath = path.join(
      BASE_DIR,
      'schemas',
      'phases',
      `${phase.slug}-data.schema.json`
    );
    const phaseOutput = readJson(phaseOutputPath);
    results.push({
      item: `phase-${phase.slug}`,
      ...validateFile(schemaPath, phaseOutput, phase.key)
    });
    if (phase.key === 'underwriting') {
      results.push(validateUnderwritingArtifacts(phaseOutput));
    }
    if (phase.key === 'closing') {
      results.push(validateClosingArtifacts(phaseOutput));
    }
  });

  if (checkpoint.workflowId) {
    const workflow = getWorkflowById(BASE_DIR, checkpoint.workflowId);
    const workflowPlan = createWorkflowRunPlan(workflow, PHASES);
    const errors = [];

    PHASES.forEach((phase) => {
      const phaseState = checkpoint.phases?.[phase.key] || {};
      const selection = workflowPlan.phaseSelections.get(phase.key);
      const phaseOutputPath = path.join(BASE_DIR, 'data', 'phase-outputs', dealId, `${phase.slug}-output.json`);
      const agentStatuses = phaseState.agentStatuses || {};

      if (!selection) {
        if (phaseState.status !== 'SKIPPED') {
          errors.push(`${phase.key} expected SKIPPED, received ${phaseState.status}`);
        }
        if (fs.existsSync(phaseOutputPath)) {
          errors.push(`${phase.key} is skipped but still has phase output: ${phaseOutputPath}`);
        }
        phase.agents.forEach((agentName) => {
          if (agentStatuses[agentName] !== 'SKIPPED') {
            errors.push(`${agentName} expected SKIPPED, received ${agentStatuses[agentName] || 'missing'}`);
          }
        });
        return;
      }

      const selected = new Set(selection.agents);
      if (phaseState.status !== 'COMPLETE') {
        errors.push(`${phase.key} expected COMPLETE, received ${phaseState.status}`);
      }
      selected.forEach((agentName) => {
        if (agentStatuses[agentName] !== 'COMPLETE') {
          errors.push(`${agentName} expected COMPLETE, received ${agentStatuses[agentName] || 'missing'}`);
        }
      });
      phase.agents
        .filter((agentName) => !selected.has(agentName))
        .forEach((agentName) => {
          if (agentStatuses[agentName] !== 'SKIPPED') {
            errors.push(`${agentName} expected SKIPPED, received ${agentStatuses[agentName] || 'missing'}`);
          }
        });
    });

    results.push({
      item: `workflow-${checkpoint.workflowId}`,
      valid: errors.length === 0,
      errors
    });
  }

      const agentsDir = path.join(BASE_DIR, 'data', 'status', dealId, 'agents');
      if (fs.existsSync(agentsDir)) {
        const files = fs.readdirSync(agentsDir).filter((name) => name.endsWith('.json'));
        files.forEach((name) => {
          const filePath = path.join(agentsDir, name);
          const schemaPath = path.join(
            BASE_DIR,
            'schemas',
            'checkpoint',
            'agent-checkpoint.schema.json'
          );
          results.push({
            item: `agent-${name}`,
            ...validateFile(schemaPath, readJson(filePath), 'agentCheckpoint')
          });
        });
      }
    }
  }

  if (args.codexRunId) {
    results.push(validateCodexRun(args.codexRunId));
  }

  let failed = 0;
  results.forEach((result) => {
    if (result.valid) {
      console.log(`PASS ${result.item}`);
    } else {
      failed += 1;
      console.log(`FAIL ${result.item}`);
      result.errors.forEach((error) => console.log(`  - ${error}`));
    }
  });

  if (failed > 0) {
    console.error(`Contract validation failed (${failed} failures).`);
    process.exit(1);
  }

  console.log(`Contract validation complete (${results.length} checks).`);
}

main();
