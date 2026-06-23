#!/usr/bin/env node
const assert = require('node:assert/strict');
const { suggestSwarmGoal } = require('./lib/goal-helper');
const catalog = require('../config/workflows.json');
const registry = require('../config/agent-registry.json');
const { PHASES } = require('./lib/runtime-core');

function assertAgentPlan(plan) {
  assert.ok(Array.isArray(plan.agentPlan), 'agentPlan must be an array');
  assert.ok(plan.agentPlan.length > 0, 'agentPlan must include selected agents');
  for (const item of plan.agentPlan) {
    assert.ok(item.phaseKey, 'agentPlan item missing phaseKey');
    assert.ok(item.phaseLabel, 'agentPlan item missing phaseLabel');
    assert.ok(item.agentName, 'agentPlan item missing agentName');
    assert.ok(item.displayName, 'agentPlan item missing displayName');
    assert.ok(item.reason, 'agentPlan item missing reason');
    assert.ok(Array.isArray(item.inputs), 'agentPlan item missing inputs array');
    assert.ok(Array.isArray(item.outputs), 'agentPlan item missing outputs array');
  }
}

{
  const plan = suggestSwarmGoal({
    goal: 'Help me quickly decide whether this acquisition is worth pursuing',
    catalog,
    registry,
    phaseMetadata: PHASES,
    dealSummary: {
      dealId: 'DEAL-GOAL-001',
      sourceCoverage: {
        approvedFieldCount: 0,
        requiredApprovedFieldCount: 3,
      },
    },
  });

  assert.equal(plan.workflowId, 'quick-deal-screen');
  assert.equal(plan.workflowName, 'Quick Deal Screen');
  assert.equal(plan.runtimeProvider, 'codex');
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(plan.launchRequest.workflowId, 'quick-deal-screen');
  assert.equal(plan.launchRequest.scenario, 'core-plus');
  assert.equal(plan.launchRequest.runtimeProvider, 'codex');
  assert.equal(plan.launchRequest.requireSourceBackedInputs, true);
  assert.match(plan.explanation, /go\/no-go|screen|pursu|deeper/i);
  assert.ok(plan.dataGaps.length > 0, 'missing source coverage should produce data gaps');
  assertAgentPlan(plan);
}

{
  const plan = suggestSwarmGoal({
    goal: 'Refresh underwriting and write an IC memo using the latest rent roll',
    catalog,
    registry,
    phaseMetadata: PHASES,
    dealSummary: {
      dealId: 'DEAL-GOAL-002',
      sourceCoverage: {
        approvedFieldCount: 2,
        requiredApprovedFieldCount: 2,
      },
    },
  });

  assert.equal(plan.workflowId, 'underwriting-refresh');
  assert.ok(plan.agentPlan.some((agent) => agent.agentName === 'financial-model-builder'));
  assert.ok(plan.agentPlan.some((agent) => agent.agentName === 'ic-memo-writer'));
  assert.equal(plan.launchRequest.scenario, 'value-add');
  assert.deepEqual(plan.dataGaps, []);
}

{
  const plan = suggestSwarmGoal({
    goal: 'Prepare a financing package and lender comparison',
    catalog,
    registry,
    phaseMetadata: PHASES,
    dealSummary: {
      dealId: 'DEAL-GOAL-003',
      sourceCoverage: {
        approvedFieldCount: 3,
        requiredApprovedFieldCount: 3,
      },
    },
  });

  assert.equal(plan.workflowId, 'financing-package');
  assert.ok(plan.agentPlan.some((agent) => agent.agentName === 'lender-outreach'));
  assert.ok(plan.agentPlan.some((agent) => agent.agentName === 'quote-comparator'));
}

{
  const plan = suggestSwarmGoal({
    goal: 'Do something magical with tax credits and zoning appeals',
    catalog,
    registry,
    phaseMetadata: PHASES,
    dealSummary: {
      dealId: 'DEAL-GOAL-004',
      sourceCoverage: {
        approvedFieldCount: 0,
        requiredApprovedFieldCount: 4,
      },
    },
  });

  assert.ok(catalog.workflows.some((workflow) => workflow.id === plan.workflowId));
  const workflow = catalog.workflows.find((entry) => entry.id === plan.workflowId);
  for (const agent of plan.agentPlan) {
    const phase = workflow.phases.find((entry) => entry.phaseKey === agent.phaseKey);
    assert.ok(phase, `unknown phase in recommendation: ${agent.phaseKey}`);
    assert.ok(
      phase.agents.includes('*') || phase.agents.includes(agent.agentName),
      `agent ${agent.agentName} is not selected by workflow ${plan.workflowId}`,
    );
  }
  assert.ok(plan.dataGaps.length > 0, 'ambiguous goals with missing coverage should produce data gaps');
}

console.log('[goal-helper-test] PASS');
