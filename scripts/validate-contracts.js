#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { validateFile, readJson } = require('./lib/schema-validator');
const { PHASES } = require('./lib/runtime-core');
const { getWorkflowById, createWorkflowRunPlan } = require('./lib/workflow-catalog');

const BASE_DIR = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  function getArg(flag, fallback = null) {
    const index = args.indexOf(flag);
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
  }
  return {
    dealId: getArg('--deal-id', null)
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  const { dealId } = parseArgs();
  if (!dealId) fail('Usage: node scripts/validate-contracts.js --deal-id <DEAL-ID>');

  const checkpointPath = path.join(BASE_DIR, 'data', 'status', `${dealId}.json`);
  if (!fs.existsSync(checkpointPath)) fail(`Checkpoint not found: ${checkpointPath}`);

  const results = [];
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
        if (agentStatuses[agentName] !== 'COMPLETED') {
          errors.push(`${agentName} expected COMPLETED, received ${agentStatuses[agentName] || 'missing'}`);
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
