const fs = require('fs');
const path = require('path');

const DEFAULT_WORKFLOW_ID = 'full-acquisition-review';

function readWorkflowCatalog(baseDir) {
  const catalogPath = path.join(baseDir, 'config', 'workflows.json');
  const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const workflows = Array.isArray(raw.workflows) ? raw.workflows : [];
  return {
    version: Number(raw.version || 1),
    defaultWorkflowId: raw.defaultWorkflowId || DEFAULT_WORKFLOW_ID,
    workflows
  };
}

function getWorkflowById(baseDir, workflowId) {
  const catalog = readWorkflowCatalog(baseDir);
  const resolvedId = workflowId || catalog.defaultWorkflowId || DEFAULT_WORKFLOW_ID;
  const workflow = catalog.workflows.find((entry) => entry.id === resolvedId);
  if (!workflow) {
    throw new Error(`Unknown workflow: ${resolvedId}`);
  }
  return workflow;
}

function normalizeAgentSelection(agentSelection, allAgents) {
  if (!Array.isArray(agentSelection) || agentSelection.length === 0) return [...allAgents];
  if (agentSelection.includes('*')) return [...allAgents];
  const allowed = new Set(allAgents);
  const unknownAgents = agentSelection.filter((agentName) => !allowed.has(agentName));
  if (unknownAgents.length > 0) {
    throw new Error(`Workflow references unknown agents: ${unknownAgents.join(', ')}`);
  }
  return [...agentSelection];
}

function createWorkflowRunPlan(workflow, phaseMetadata) {
  const phaseSelections = new Map();
  const rawPhases = Array.isArray(workflow.phases) ? workflow.phases : [];

  for (const phase of rawPhases) {
    if (!phase || typeof phase.phaseKey !== 'string') continue;
    const phaseMeta = phaseMetadata.find((entry) => entry.key === phase.phaseKey);
    if (!phaseMeta) {
      throw new Error(`Workflow ${workflow.id} references unknown phase: ${phase.phaseKey}`);
    }
    phaseSelections.set(phase.phaseKey, {
      phaseKey: phase.phaseKey,
      agents: normalizeAgentSelection(phase.agents, phaseMeta.agents)
    });
  }

  return {
    workflowId: workflow.id,
    workflowName: workflow.name || workflow.id,
    phaseSelections
  };
}

function serializeWorkflowForClient(workflow, phaseMetadata) {
  const plan = createWorkflowRunPlan(workflow, phaseMetadata);
  return {
    id: workflow.id,
    name: workflow.name || workflow.id,
    summary: workflow.summary || '',
    operatorGoal: workflow.operatorGoal || '',
    recommendedScenario: workflow.recommendedScenario || 'core-plus',
    phases: [...plan.phaseSelections.values()].map((selection) => ({
      phaseKey: selection.phaseKey,
      agents: selection.agents
    }))
  };
}

module.exports = {
  DEFAULT_WORKFLOW_ID,
  readWorkflowCatalog,
  getWorkflowById,
  createWorkflowRunPlan,
  serializeWorkflowForClient
};
