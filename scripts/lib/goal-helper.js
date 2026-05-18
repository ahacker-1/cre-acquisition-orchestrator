const { createWorkflowRunPlan, DEFAULT_WORKFLOW_ID } = require('./workflow-catalog');

const GOAL_RULES = [
  {
    workflowId: 'quick-deal-screen',
    keywords: ['quick', 'fast', 'screen', 'go/no-go', 'worth pursuing', 'pursuit', 'decide', 'triage'],
  },
  {
    workflowId: 'underwriting-refresh',
    keywords: ['underwriting', 'refresh', 'model', 'memo', 'ic memo', 'returns', 'rent roll', 'latest'],
  },
  {
    workflowId: 'financing-package',
    keywords: ['financing', 'lender', 'debt', 'loan', 'quote', 'term sheet', 'package'],
  },
  {
    workflowId: 'legal-psa-review',
    keywords: ['legal', 'psa', 'title', 'survey', 'contract', 'insurance', 'environmental', 'blocker'],
  },
];

function titleize(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function phaseKeyToRegistryKey(phaseKey) {
  return String(phaseKey || '').replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function normalizeGoal(goal, fallback) {
  const text = typeof goal === 'string' ? goal.trim() : '';
  return text || fallback || 'Help me build an IC-ready acquisition package';
}

function chooseWorkflowId(goal, catalog) {
  const text = normalizeGoal(goal, '').toLowerCase();
  const workflows = Array.isArray(catalog?.workflows) ? catalog.workflows : [];
  for (const rule of GOAL_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      if (workflows.some((workflow) => workflow.id === rule.workflowId)) return rule.workflowId;
    }
  }
  return catalog?.defaultWorkflowId || DEFAULT_WORKFLOW_ID;
}

function findWorkflow(catalog, workflowId) {
  const workflows = Array.isArray(catalog?.workflows) ? catalog.workflows : [];
  const resolvedId = workflowId || catalog?.defaultWorkflowId || DEFAULT_WORKFLOW_ID;
  return workflows.find((workflow) => workflow.id === resolvedId) || workflows.find((workflow) => workflow.id === DEFAULT_WORKFLOW_ID) || workflows[0];
}

function registryAgentFor(registry, phaseKey, agentName) {
  const registryKey = phaseKeyToRegistryKey(phaseKey);
  return registry?.agents?.[registryKey]?.[agentName] || registry?.agents?.[phaseKey]?.[agentName] || null;
}

function agentReason(agentName, phaseLabel, outputs) {
  const name = String(agentName || '').toLowerCase();
  if (name.includes('rent')) return 'Checks rent roll, unit mix, and lease signals before the rest of the swarm relies on revenue.';
  if (name.includes('opex')) return 'Normalizes operating expenses so underwriting is not built on noisy T-12 data.';
  if (name.includes('model')) return 'Builds the economic base case the IC package and lender story depend on.';
  if (name.includes('scenario')) return 'Stress-tests upside/downside cases so the recommendation is not single-point fragile.';
  if (name.includes('memo') || name.includes('ic')) return 'Turns specialist workpapers into an investment committee narrative.';
  if (name.includes('lender')) return 'Creates lender outreach context and debt-market options.';
  if (name.includes('quote')) return 'Compares quotes, proceeds, covenants, and debt-service pressure.';
  if (name.includes('psa') || name.includes('title') || name.includes('legal')) return 'Surfaces legal, title, PSA, and closing blockers before they surprise the operator.';
  if (name.includes('closing') || name.includes('funds')) return 'Prepares the closing checklist and funds-flow handoff.';
  const outputText = Array.isArray(outputs) && outputs.length > 0 ? outputs.slice(0, 2).join(', ') : `${phaseLabel} workpaper`;
  return `Produces ${outputText} for the ${phaseLabel} swarm.`;
}

function buildAgentPlan({ workflow, registry, phaseMetadata }) {
  const plan = createWorkflowRunPlan(workflow, phaseMetadata);
  const phaseLookup = new Map(phaseMetadata.map((phase) => [phase.key, phase]));
  const agentPlan = [];
  for (const selection of plan.phaseSelections.values()) {
    const phase = phaseLookup.get(selection.phaseKey);
    const phaseLabel = phase?.label || titleize(selection.phaseKey);
    for (const agentName of selection.agents) {
      const registryAgent = registryAgentFor(registry, selection.phaseKey, agentName) || {};
      const inputs = Array.isArray(registryAgent.inputs) ? registryAgent.inputs : [];
      const outputs = Array.isArray(registryAgent.outputs) ? registryAgent.outputs : [];
      agentPlan.push({
        phaseKey: selection.phaseKey,
        phaseSlug: phase?.slug || phaseKeyToRegistryKey(selection.phaseKey),
        phaseLabel,
        agentName,
        displayName: titleize(agentName),
        critical: registryAgent.critical === true,
        dependencies: Array.isArray(registryAgent.dependencies) ? registryAgent.dependencies : [],
        inputs,
        outputs,
        reason: agentReason(agentName, phaseLabel, outputs),
      });
    }
  }
  return agentPlan.sort((a, b) => Number(b.critical) - Number(a.critical) || a.phaseLabel.localeCompare(b.phaseLabel));
}

function sourceCoverageGaps(sourceCoverage, workflow) {
  const required = Array.isArray(workflow?.requiredSourceFields) ? workflow.requiredSourceFields : [];
  const approved = Number(sourceCoverage?.approvedFieldCount || 0);
  const requiredCount = Number(sourceCoverage?.requiredApprovedFieldCount || required.length || 0);
  const missing = Math.max(0, requiredCount - approved);
  if (missing === 0) return [];
  const fieldList = required.slice(0, 4).join(', ');
  return [
    `Approve ${missing} more source-backed input${missing === 1 ? '' : 's'}${fieldList ? ` (${fieldList})` : ''} before relying on this swarm for external decisions.`,
  ];
}

function buildHandoffs(agentPlan) {
  const phaseOrder = [];
  for (const agent of agentPlan) {
    if (!phaseOrder.some((phase) => phase.phaseKey === agent.phaseKey)) {
      phaseOrder.push({ phaseKey: agent.phaseKey, label: agent.phaseLabel });
    }
  }
  return phaseOrder.slice(0, -1).map((phase, index) => ({
    from: phase.label,
    to: phaseOrder[index + 1].label,
    status: 'planned',
    detail: `${phase.label} agents hand evidence to ${phaseOrder[index + 1].label} for the next decision layer.`,
  }));
}

function suggestSwarmGoal({ goal, catalog, registry, phaseMetadata, dealSummary = {} }) {
  if (!catalog || !registry || !Array.isArray(phaseMetadata)) {
    throw new Error('suggestSwarmGoal requires catalog, registry, and phaseMetadata');
  }
  const workflowId = chooseWorkflowId(goal, catalog);
  const workflow = findWorkflow(catalog, workflowId);
  if (!workflow) throw new Error('No workflows available for swarm goal suggestion');
  const agentPlan = buildAgentPlan({ workflow, registry, phaseMetadata });
  const goalText = normalizeGoal(goal, workflow.operatorGoal);
  const dataGaps = sourceCoverageGaps(dealSummary.sourceCoverage, workflow);
  const scenario = workflow.recommendedScenario || 'core-plus';
  const blockerCount = dataGaps.length;
  return {
    version: 1,
    source: 'deterministic-goal-helper',
    goal: goalText,
    workflowId: workflow.id,
    workflowName: workflow.name || workflow.id,
    workflowSummary: workflow.summary || '',
    operatorGoal: workflow.operatorGoal || goalText,
    explanation: `${workflow.name || workflow.id} is the best-fit swarm because its operator goal is: ${workflow.operatorGoal || workflow.summary || 'advance this acquisition decision.'}`,
    runtimeProvider: 'simulation',
    requiresConfirmation: true,
    readiness: blockerCount > 0 ? 'blocked' : 'ready',
    dataGaps,
    agentPlan,
    handoffs: buildHandoffs(agentPlan),
    nextAction: blockerCount > 0
      ? {
          label: 'Unblock source-backed inputs',
          detail: dataGaps[0],
          target: 'documents',
        }
      : {
          label: `Launch ${workflow.name || workflow.id}`,
          detail: 'The recommended swarm has enough approved source coverage for a deterministic review.',
          target: 'advanced',
        },
    launchRequest: {
      dealId: dealSummary.dealId || null,
      workflowId: workflow.id,
      scenario,
      speed: 'fast',
      mode: 'fast',
      runtimeProvider: 'simulation',
      requireSourceBackedInputs: true,
      reset: true,
    },
  };
}

module.exports = {
  suggestSwarmGoal,
};
