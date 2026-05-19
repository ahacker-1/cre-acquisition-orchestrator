#!/usr/bin/env node
const path = require('path');
const {
  nowIso,
  writeJson,
  appendLog,
  validateAgentCheckpoint
} = require('./lib/runtime-core');
const { renderAgentWorkpaper } = require('./lib/workpaper-renderer');

function makeAgentCheckpoint({
  agentName,
  phaseKey,
  dealId,
  status,
  progress,
  startedAt,
  completedAt,
  summary,
  findings,
  metrics,
  verdict,
  dataGaps,
  redFlags,
  errors
}) {
  return {
    agentName,
    phase: phaseKey,
    dealId,
    status,
    progress,
    startedAt,
    completedAt,
    lastUpdatedAt: nowIso(),
    resumePoint: status === 'FAILED' ? 'rerun-agent' : null,
    outputs: {
      summary,
      findings,
      metrics,
      verdict
    },
    dataGaps,
    errors: errors || [],
    redFlags,
    childAgents: []
  };
}

function persistAgentCheckpoint(baseDir, agentCheckpoint, agentStatusDir) {
  validateAgentCheckpoint(baseDir, agentCheckpoint);
  const outputPath = path.join(agentStatusDir, `${agentCheckpoint.agentName}.json`);
  writeJson(outputPath, agentCheckpoint);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeAgent({
  baseDir,
  dealId,
  phaseKey,
  phaseLabel,
  agentName,
  agentStatusDir,
  logFile,
  agentFinding,
  phaseData,
  deal,
  storyEngine,
  failAgent,
  agentDelayMs = 0
}) {
  const startedAt = nowIso();
  appendLog(logFile, agentName, 'ACTION', `Started ${agentName} for ${phaseKey}`);
  if (storyEngine) {
    storyEngine.emit('agent_started', {
      phase: phaseKey,
      phaseLabel: phaseLabel || phaseKey,
      agent: agentName,
      title: `${agentName} started`,
      status: 'RUNNING'
    });
    storyEngine.emitAgentMessage({
      phase: phaseKey,
      phaseLabel: phaseLabel || phaseKey,
      fromAgent: `${phaseKey}-orchestrator`,
      toAgent: agentName,
      messageType: 'task_assignment',
      title: `${phaseLabel || phaseKey} assigned ${agentName}`,
      summary: `${agentName} is reviewing assigned inputs for ${phaseLabel || phaseKey}.`,
      importance: 'normal',
      requiresHuman: false,
      tags: ['simulation', 'task-assignment']
    });
  }

  const runningCheckpoint = makeAgentCheckpoint({
    agentName,
    phaseKey,
    dealId,
    status: 'RUNNING',
    progress: 0.35,
    startedAt,
    completedAt: null,
    summary: `Running ${agentName}`,
    findings: [],
    metrics: {},
    verdict: null,
    dataGaps: [],
    redFlags: [],
    errors: []
  });
  persistAgentCheckpoint(baseDir, runningCheckpoint, agentStatusDir);

  if (agentDelayMs > 0) {
    await sleep(agentDelayMs);
  }

  if (failAgent && failAgent === agentName) {
    const failedCheckpoint = makeAgentCheckpoint({
      agentName,
      phaseKey,
      dealId,
      status: 'FAILED',
      progress: 1,
      startedAt,
      completedAt: nowIso(),
      summary: `${agentName} failed via injection`,
      findings: [],
      metrics: {},
      verdict: 'FAIL',
      dataGaps: [],
      redFlags: [],
      errors: [
        {
          message: `Injected failure for agent ${agentName}`,
          timestamp: nowIso(),
          recoverable: true
        }
      ]
    });
    persistAgentCheckpoint(baseDir, failedCheckpoint, agentStatusDir);
    appendLog(
      logFile,
      agentName,
      'ERROR',
      `Injected failure triggered for ${agentName}. Resume with --resume to continue.`
    );
    if (storyEngine) {
      storyEngine.emit('agent_failed', {
        phase: phaseKey,
        phaseLabel: phaseLabel || phaseKey,
        agent: agentName,
        title: `${agentName} failed`,
        error: `Injected failure for ${agentName}`
      });
      storyEngine.emitAgentDependency({
        phase: phaseKey,
        phaseLabel: phaseLabel || phaseKey,
        fromAgent: agentName,
        toAgent: `${phaseKey}-orchestrator`,
        messageType: 'blocker',
        title: `${agentName} blocked ${phaseLabel || phaseKey}`,
        summary: `Injected failure for ${agentName}`,
        dependencyType: 'agent_failure',
        importance: 'critical',
        requiresHuman: true,
        impact: ['Run marked FAILED', 'Resume required from failed phase'],
        tags: ['simulation', 'blocker']
      });
    }
    const err = new Error(`Injected failure for ${agentName}`);
    err.code = 'INJECTED_FAILURE';
    throw err;
  }

  const detail = agentFinding || {
    status: 'COMPLETE',
    finding: `${agentName} completed analysis with no material exceptions.`
  };

  const extractedRedFlags = Array.isArray(phaseData?.redFlags)
    ? phaseData.redFlags.filter((f) => f.owner === agentName)
    : [];
  const extractedGaps = Array.isArray(phaseData?.dataGaps)
    ? phaseData.dataGaps.filter((g) => g.owner === agentName)
    : [];

  appendLog(
    logFile,
    agentName,
    'FINDING',
    typeof detail.finding === 'string' ? detail.finding : `${agentName} emitted findings`
  );
  if (extractedGaps.length > 0) {
    extractedGaps.forEach((gap) => {
      appendLog(logFile, agentName, 'DATA_GAP', gap.message || `${agentName} reported a data gap`);
    });
  }

  const completeCheckpoint = makeAgentCheckpoint({
    agentName,
    phaseKey,
    dealId,
    status: 'COMPLETE',
    progress: 1,
    startedAt,
    completedAt: nowIso(),
    summary:
      typeof detail.finding === 'string'
        ? detail.finding
        : `${agentName} completed with structured output`,
    findings: [typeof detail.finding === 'string' ? detail.finding : 'Completed'],
    metrics: {
      confidence: typeof detail.confidence === 'number' ? detail.confidence : 0.85
    },
    verdict: detail.status === 'CONDITIONAL' ? 'CONDITIONAL' : 'PASS',
    dataGaps: extractedGaps,
    redFlags: extractedRedFlags,
    errors: []
  });
  persistAgentCheckpoint(baseDir, completeCheckpoint, agentStatusDir);
  appendLog(logFile, agentName, 'COMPLETE', `${agentName} completed`);
  if (storyEngine) {
    storyEngine.emit('agent_completed', {
      phase: phaseKey,
      phaseLabel: phaseLabel || phaseKey,
      agent: agentName,
      title: `${agentName} completed`,
      verdict: completeCheckpoint.outputs.verdict,
      redFlagCount: extractedRedFlags.length,
      dataGapCount: extractedGaps.length,
      summary: completeCheckpoint.outputs.summary
    });

    const workpaper = storyEngine.createDocument({
      phase: phaseKey,
      agent: agentName,
      title: `${agentName} Workpaper`,
      docType: 'workpaper',
      summary: completeCheckpoint.outputs.summary,
      content: renderAgentWorkpaper({
        deal,
        dealId,
        agentName,
        phaseKey,
        phaseLabel,
        startedAt,
        completedAt: completeCheckpoint.completedAt,
        verdict: completeCheckpoint.outputs.verdict || 'PASS',
        summary: completeCheckpoint.outputs.summary,
        findings: completeCheckpoint.outputs.findings,
        redFlags: extractedRedFlags,
        dataGaps: extractedGaps,
        phaseData
      }),
      mime: 'text/markdown',
      extension: 'md',
      tags: ['agent', 'workpaper']
    });
    storyEngine.emitAgentHandoff({
      phase: phaseKey,
      phaseLabel: phaseLabel || phaseKey,
      fromAgent: agentName,
      toAgent: `${phaseKey}-orchestrator`,
      messageType: 'workpaper_ready',
      title: `${agentName} handed workpaper to ${phaseLabel || phaseKey}`,
      summary: completeCheckpoint.outputs.summary,
      artifactRefs: [workpaper],
      importance: extractedRedFlags.length > 0 || extractedGaps.length > 0 ? 'high' : 'normal',
      requiresHuman: extractedGaps.length > 0,
      confidence: completeCheckpoint.outputs.metrics.confidence,
      impact: [
        `${extractedRedFlags.length} red flags`,
        `${extractedGaps.length} data gaps`
      ],
      tags: ['simulation', 'agent-handoff', 'workpaper']
    });
    storyEngine.emitAgentReview({
      phase: phaseKey,
      phaseLabel: phaseLabel || phaseKey,
      fromAgent: agentName,
      toAgent: `${phaseKey}-orchestrator`,
      messageType: 'self_review',
      title: `${agentName} completed self-review`,
      summary: `Verdict ${completeCheckpoint.outputs.verdict}; confidence ${completeCheckpoint.outputs.metrics.confidence}.`,
      importance: 'normal',
      requiresHuman: extractedGaps.length > 0,
      confidence: completeCheckpoint.outputs.metrics.confidence,
      tags: ['simulation', 'self-review']
    });
  }

  return completeCheckpoint;
}

module.exports = {
  executeAgent
};
