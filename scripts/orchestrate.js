#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  PHASES,
  createRng,
  hashSeed,
  round,
  nowIso,
  readJsonIfExists,
  writeJson,
  appendLog,
  createInitialCheckpoint,
  summarizeProgress,
  ensureRuntimePaths,
  phaseFromArg,
  readRuntimeConfig,
  readScenarioConfig,
  validatePhaseData,
  validateAgentCheckpoint,
  validateMasterCheckpoint,
  validatePhaseCompletionEvent
} = require('./lib/runtime-core');
const { getWorkflowById, createWorkflowRunPlan } = require('./lib/workflow-catalog');
const {
  generatePhaseData,
  determinePhaseVerdict,
  summarizeFindingsForPhase,
  buildPhaseCompletionEvent
} = require('./lib/simulation-data');
const { executeAgent } = require('./agent-executor');
const { StoryEngine } = require('./lib/story-engine');

const BASE_DIR = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  function getArg(flag, fallback = null) {
    const index = args.indexOf(flag);
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
  }
  return {
    dealPath: path.resolve(BASE_DIR, getArg('--deal', 'config/deal.json')),
    scenarioName: getArg('--scenario', null),
    seedArg: getArg('--seed', null),
    runId: getArg('--run-id', null),
    agentDelayMs: Number(getArg('--agent-delay-ms', '0')) || 0,
    resume: args.includes('--resume'),
    fromPhase: phaseFromArg(getArg('--from-phase', null)),
    failAgent: getArg('--fail-agent', null),
    workflowId: getArg('--workflow', null),
    inputSnapshotPath: getArg('--input-snapshot', null)
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function renderPhaseReport(phaseMeta, phaseState) {
  const findings = phaseState?.outputs?.keyFindings || [];
  const redFlags = Array.isArray(phaseState?.dataForDownstream?.redFlags)
    ? phaseState.dataForDownstream.redFlags
    : [];
  const dataGaps = Array.isArray(phaseState?.dataForDownstream?.dataGaps)
    ? phaseState.dataForDownstream.dataGaps
    : [];
  const lines = [];
  lines.push(`# ${phaseMeta.label} Report`);
  lines.push('');
  lines.push(`- Status: ${phaseState.status}`);
  lines.push(`- Verdict: ${phaseState.verdict || 'N/A'}`);
  lines.push(`- Risk Score: ${phaseState.riskScore ?? 'N/A'}`);
  lines.push(`- Red Flags: ${phaseState.redFlagCount ?? 0}`);
  lines.push(`- Data Gaps: ${phaseState.dataGapCount ?? 0}`);
  lines.push('');
  lines.push('## Key Findings');
  if (findings.length === 0) lines.push('- No findings recorded.');
  findings.forEach((finding) => lines.push(`- ${finding}`));
  lines.push('');
  lines.push('## Red Flags');
  if (redFlags.length === 0) lines.push('- None');
  redFlags.forEach((flag) =>
    lines.push(`- [${flag.severity || 'MEDIUM'}] ${flag.message || 'Flag'}`)
  );
  lines.push('');
  lines.push('## Data Gaps');
  if (dataGaps.length === 0) lines.push('- None');
  dataGaps.forEach((gap) => lines.push(`- ${gap.message || 'Data gap'}`));
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function renderFinalReport(checkpoint) {
  const lines = [];
  const phases = checkpoint.phases || {};
  lines.push(`# Final Acquisition Report - ${checkpoint.dealName}`);
  lines.push('');
  lines.push(`- Deal ID: ${checkpoint.dealId}`);
  lines.push(`- Workflow: ${checkpoint.workflowName || checkpoint.workflowId || 'Full Acquisition Review'}`);
  lines.push(`- Scenario: ${checkpoint.scenario}`);
  lines.push(`- Seed: ${checkpoint.seed}`);
  if (checkpoint.inputSnapshot?.sourceCoverage) {
    const coverage = checkpoint.inputSnapshot.sourceCoverage;
    lines.push(`- Source Documents: ${coverage.sourceDocumentCount ?? 0}`);
    lines.push(`- Approved Source Fields: ${coverage.approvedFieldCount ?? 0}/${coverage.requiredApprovedFieldCount ?? 0}`);
  }
  lines.push(`- Overall Status: ${checkpoint.status}`);
  lines.push(`- Overall Progress: ${checkpoint.overallProgress}%`);
  lines.push(`- Start: ${checkpoint.startedAt}`);
  lines.push(`- End: ${checkpoint.completedAt || checkpoint.lastUpdatedAt}`);
  lines.push('');
  if (checkpoint.inputSnapshot?.sourceCoverage) {
    const coverage = checkpoint.inputSnapshot.sourceCoverage;
    lines.push('## Source-Backed Inputs');
    lines.push(`- Snapshot: ${checkpoint.inputSnapshot.path || 'N/A'}`);
    lines.push(`- Applied Documents: ${coverage.appliedDocumentCount ?? 0}/${coverage.sourceDocumentCount ?? 0}`);
    lines.push(`- Approved Fields: ${coverage.approvedFieldCount ?? 0}`);
    lines.push(`- Missing Required Source Fields: ${coverage.missingApprovedFieldCount ?? 0}`);
    lines.push('');
  }
  lines.push('## Phase Outcomes');
  PHASES.forEach((phase) => {
    const state = phases[phase.key] || {};
    lines.push(
      `- ${phase.label}: ${state.status || 'PENDING'} | Verdict: ${state.verdict || 'N/A'} | Risk: ${
        state.riskScore ?? 'N/A'
      } | Red Flags: ${state.redFlagCount ?? 0} | Data Gaps: ${state.dataGapCount ?? 0}`
    );
  });
  lines.push('');
  lines.push('## Recommendation');
  const closingVerdict = phases.closing?.verdict;
  if (closingVerdict === 'GO') {
    lines.push('Proceed with closing package execution.');
  } else if (closingVerdict === 'CONDITIONAL') {
    lines.push('Proceed with conditions and complete pending checklist items.');
  } else if (checkpoint.status === 'FAILED') {
    lines.push('Pipeline halted due to execution failure. Resume required.');
  } else if (checkpoint.status === 'COMPLETE' && phases.closing?.status === 'SKIPPED') {
    lines.push('Scoped workflow completed. Review the package outputs before expanding to a full closing run.');
  } else {
    lines.push('Do not proceed until critical issues are resolved.');
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function makeSkippedAgentCheckpoint({ agentName, phaseKey, dealId, reason }) {
  const timestamp = nowIso();
  return {
    agentName,
    phase: phaseKey,
    dealId,
    status: 'skipped',
    progress: 1,
    startedAt: null,
    completedAt: timestamp,
    lastUpdatedAt: timestamp,
    resumePoint: null,
    outputs: {
      summary: reason,
      findings: [],
      metrics: {},
      verdict: null
    },
    dataGaps: [],
    errors: [],
    redFlags: [],
    childAgents: []
  };
}

function persistSkippedAgentCheckpoint({ baseDir, agentStatusDir, agentName, phaseKey, dealId, reason }) {
  const checkpoint = makeSkippedAgentCheckpoint({ agentName, phaseKey, dealId, reason });
  validateAgentCheckpoint(baseDir, checkpoint);
  writeJson(path.join(agentStatusDir, `${agentName}.json`), checkpoint);
}

function clearDealRuntimeArtifacts(baseDir, dealId) {
  const targets = [
    path.join(baseDir, 'data', 'status', `${dealId}.json`),
    path.join(baseDir, 'data', 'status', dealId),
    path.join(baseDir, 'data', 'logs', dealId),
    path.join(baseDir, 'data', 'phase-outputs', dealId),
    path.join(baseDir, 'data', 'reports', dealId)
  ];
  targets.forEach((target) => fs.rmSync(target, { recursive: true, force: true }));
}

function filterPhaseDataForSelectedAgents(phaseData, selectedAgentSet) {
  const filtered = { ...phaseData };
  if (phaseData.agentFindings && typeof phaseData.agentFindings === 'object') {
    filtered.agentFindings = Object.fromEntries(
      Object.entries(phaseData.agentFindings).filter(([agentName]) => selectedAgentSet.has(agentName))
    );
  }
  if (Array.isArray(phaseData.redFlags)) {
    filtered.redFlags = phaseData.redFlags.filter((flag) => {
      return !flag.owner || selectedAgentSet.has(flag.owner);
    });
    filtered.redFlagCount = filtered.redFlags.length;
  }
  if (Array.isArray(phaseData.dataGaps)) {
    filtered.dataGaps = phaseData.dataGaps.filter((gap) => {
      return !gap.owner || selectedAgentSet.has(gap.owner);
    });
    filtered.dataGapCount = filtered.dataGaps.length;
  }
  return filtered;
}

function markPhaseSkipped({ checkpoint, phaseMeta, phaseState, paths, masterLog, storyEngine, reason }) {
  const timestamp = nowIso();
  phaseState.status = 'SKIPPED';
  phaseState.progress = 1;
  phaseState.startedAt = phaseState.startedAt || timestamp;
  phaseState.completedAt = timestamp;
  phaseState.verdict = null;
  phaseState.findings = 0;
  phaseState.riskScore = 0;
  phaseState.redFlagCount = 0;
  phaseState.dataGapCount = 0;
  phaseState.confidence = 0;
  phaseState.dataForDownstream = {};
  phaseState.outputs = {
    phaseSummary: reason,
    keyFindings: [],
    redFlags: [],
    dataGaps: [],
    phaseVerdict: null
  };
  phaseState.agentStatuses = phaseState.agentStatuses || {};
  phaseMeta.agents.forEach((agentName) => {
    phaseState.agentStatuses[agentName] = 'SKIPPED';
    persistSkippedAgentCheckpoint({
      baseDir: BASE_DIR,
      agentStatusDir: paths.agentStatusDir,
      agentName,
      phaseKey: phaseMeta.key,
      dealId: checkpoint.dealId,
      reason
    });
  });
  appendLog(masterLog, 'orchestrator', 'PHASE', `${phaseMeta.label} skipped: ${reason}`);
  storyEngine.emit('phase_skipped', {
    phase: phaseMeta.slug,
    phaseLabel: phaseMeta.label,
    title: `${phaseMeta.label} skipped`,
    summary: reason
  });
}

async function main() {
  const args = parseArgs();
  let storyEngine = null;
  let storyFinalized = false;
  const runtimeConfig = readRuntimeConfig(BASE_DIR);
  const deal = readJson(args.dealPath);

  if (!deal.dealId) {
    throw new Error(`Deal config missing dealId: ${args.dealPath}`);
  }

  const scenarioName = args.scenarioName || runtimeConfig.defaultScenario || 'core-plus';
  const scenarioConfig = readScenarioConfig(BASE_DIR, scenarioName);
  const defaultSeed = Number(runtimeConfig.defaultSeed || 42);
  const seed =
    args.seedArg !== null
      ? Number(args.seedArg)
      : (defaultSeed + hashSeed(`${deal.dealId}:${scenarioName}`)) % 1000000;
  const rng = createRng(seed);
  const runId =
    typeof args.runId === 'string' && args.runId.trim().length > 0
      ? args.runId.trim()
      : `local-${Date.now()}`;

  if (!args.resume) {
    clearDealRuntimeArtifacts(BASE_DIR, deal.dealId);
  }
  const paths = ensureRuntimePaths(BASE_DIR, deal.dealId);
  const masterLog = path.join(paths.logsDir, 'master.log');
  const checkpointPath = paths.masterCheckpoint;

  let checkpoint;
  if (args.resume) {
    checkpoint = readJsonIfExists(checkpointPath);
    if (!checkpoint) {
      throw new Error(`Cannot resume. Checkpoint not found: ${checkpointPath}`);
    }
    appendLog(masterLog, 'orchestrator', 'INFO', 'Resuming pipeline from checkpoint');
  } else {
    checkpoint = createInitialCheckpoint(deal, scenarioName, seed);
    appendLog(masterLog, 'orchestrator', 'INFO', 'Starting new autonomous simulated run');
  }

  const workflow = getWorkflowById(BASE_DIR, args.workflowId || checkpoint.workflowId || null);
  const workflowRunPlan = createWorkflowRunPlan(workflow, PHASES);

  storyEngine = new StoryEngine({
    baseDir: BASE_DIR,
    dealId: deal.dealId,
    runId
  });

  checkpoint.scenario = scenarioName;
  checkpoint.seed = seed;
  checkpoint.runId = runId;
  checkpoint.workflowId = workflow.id;
  checkpoint.workflowName = workflow.name || workflow.id;
  checkpoint.runtimeProvider = 'simulation';
  if (args.inputSnapshotPath) {
    const snapshotPath = path.resolve(BASE_DIR, args.inputSnapshotPath);
    const inputSnapshot = readJsonIfExists(snapshotPath);
    if (inputSnapshot) {
      checkpoint.inputSnapshot = {
        path: path.relative(BASE_DIR, snapshotPath).replace(/\\/g, '/'),
        capturedAt: inputSnapshot.capturedAt || null,
        workflowId: inputSnapshot.workflowId || workflow.id,
        sourceCoverage: inputSnapshot.readiness?.sourceCoverage || {},
        readiness: {
          status: inputSnapshot.readiness?.status || 'warning',
          blockers: inputSnapshot.readiness?.blockers || [],
          warnings: inputSnapshot.readiness?.warnings || []
        },
        approvedFieldCount: Array.isArray(inputSnapshot.approvedFields?.fields)
          ? inputSnapshot.approvedFields.fields.length
          : 0
      };
    }
  }
  checkpoint.lastUpdatedAt = nowIso();
  checkpoint.resumeInstructions =
    `Run: node scripts/orchestrate.js --deal ${path.relative(BASE_DIR, args.dealPath).replace(/\\/g, '/')} --resume --workflow ${workflow.id} --scenario ${scenarioName} --seed ${seed}`;

  storyEngine.emit('run_started', {
    runId,
    dealName: checkpoint.dealName,
    workflowId: workflow.id,
    workflowName: workflow.name || workflow.id,
    scenario: scenarioName,
    seed,
    mode: args.resume ? 'resume' : 'fresh'
  });
  if (args.inputSnapshotPath && checkpoint.inputSnapshot) {
    storyEngine.registerExternalDocument({
      phase: 'underwriting',
      agent: 'source-backed-inputs',
      title: 'Run Input Snapshot',
      docType: 'input-snapshot',
      absolutePath: path.resolve(BASE_DIR, args.inputSnapshotPath),
      summary: 'Criteria, approved fields, source documents, and launch readiness captured before workflow execution',
      mime: 'application/json',
      tags: ['source-backed-inputs', 'launch-snapshot']
    });
  }
  storyEngine.emitMilestone(
    args.resume ? 'Pipeline Resumed' : 'Pipeline Initiated',
    `${checkpoint.dealName} - ${scenarioName}`,
    'info'
  );

  const phaseIndexByKey = PHASES.reduce((acc, phase, index) => {
    acc[phase.key] = index;
    return acc;
  }, {});
  const startIndex = args.fromPhase ? phaseIndexByKey[args.fromPhase] : 0;

  const phaseContext = {
    dueDiligence: checkpoint.phases?.dueDiligence?.dataForDownstream || null,
    underwriting: checkpoint.phases?.underwriting?.dataForDownstream || null,
    financing: checkpoint.phases?.financing?.dataForDownstream || null,
    legal: checkpoint.phases?.legal?.dataForDownstream || null
  };

  let encounteredFailure = false;
  for (let i = 0; i < PHASES.length; i += 1) {
    const phaseMeta = PHASES[i];
    if (i < startIndex) continue;
    const phaseSelection = workflowRunPlan.phaseSelections.get(phaseMeta.key);
    const selectedAgents = phaseSelection ? phaseSelection.agents : [];
    const selectedAgentSet = new Set(selectedAgents);

    const phaseState = checkpoint.phases[phaseMeta.key];
    if (args.resume && !args.fromPhase && (phaseState.status === 'COMPLETE' || phaseState.status === 'SKIPPED')) {
      appendLog(
        masterLog,
        'orchestrator',
        'INFO',
        `Skipping ${phaseMeta.label} because it is already ${phaseState.status}`
      );
      if (phaseState.dataForDownstream) {
        phaseContext[phaseMeta.key] = phaseState.dataForDownstream;
      }
      continue;
    }

    if (!phaseSelection || selectedAgents.length === 0) {
      markPhaseSkipped({
        checkpoint,
        phaseMeta,
        phaseState,
        paths,
        masterLog,
        storyEngine,
        reason: `${phaseMeta.label} is outside the ${workflow.name || workflow.id} workflow scope.`
      });
      summarizeProgress(checkpoint);
      checkpoint.lastUpdatedAt = nowIso();
      validateMasterCheckpoint(BASE_DIR, checkpoint);
      writeJson(checkpointPath, checkpoint);
      continue;
    }

    checkpoint.currentPhase = phaseMeta.key;
    checkpoint.status = 'RUNNING';
    phaseState.status = 'RUNNING';
    phaseState.startedAt = phaseState.startedAt || nowIso();
    phaseState.progress = 0;
    phaseState.agentStatuses = phaseState.agentStatuses || {};
    phaseMeta.agents.forEach((agentName) => {
      if (!selectedAgentSet.has(agentName)) {
        phaseState.agentStatuses[agentName] = 'SKIPPED';
        persistSkippedAgentCheckpoint({
          baseDir: BASE_DIR,
          agentStatusDir: paths.agentStatusDir,
          agentName,
          phaseKey: phaseMeta.key,
          dealId: deal.dealId,
          reason: `${agentName} is outside the ${workflow.name || workflow.id} workflow scope.`
        });
      } else if (!phaseState.agentStatuses[agentName] || args.fromPhase) {
        phaseState.agentStatuses[agentName] = 'PENDING';
      }
    });
    appendLog(masterLog, 'orchestrator', 'PHASE', `Starting ${phaseMeta.label}`);
    storyEngine.emit('phase_started', {
      phase: phaseMeta.slug,
      phaseLabel: phaseMeta.label,
      totalAgents: selectedAgents.length,
      skippedAgents: phaseMeta.agents.length - selectedAgents.length
    });
    storyEngine.emitMilestone(
      `${phaseMeta.label} Started`,
      `Spawning ${selectedAgents.length} specialist agents`,
      'info'
    );

    const phaseData = filterPhaseDataForSelectedAgents(
      generatePhaseData(phaseMeta.key, deal, phaseContext, scenarioConfig, rng),
      selectedAgentSet
    );
    validatePhaseData(BASE_DIR, phaseMeta.key, phaseData);

    let completedAgents = 0;
    for (const agentName of selectedAgents) {
      try {
        await executeAgent({
          baseDir: BASE_DIR,
          dealId: deal.dealId,
          phaseKey: phaseMeta.key,
          phaseLabel: phaseMeta.label,
          agentName,
          agentStatusDir: paths.agentStatusDir,
          logFile: masterLog,
          agentFinding: phaseData.agentFindings?.[agentName],
          phaseData,
          storyEngine,
          failAgent: args.failAgent,
          agentDelayMs: args.agentDelayMs
        });
        phaseState.agentStatuses[agentName] = 'COMPLETED';
        completedAgents += 1;
        phaseState.progress = round(completedAgents / selectedAgents.length, 3);
        checkpoint.lastUpdatedAt = nowIso();
        summarizeProgress(checkpoint);
        validateMasterCheckpoint(BASE_DIR, checkpoint);
        writeJson(checkpointPath, checkpoint);
      } catch (error) {
        phaseState.agentStatuses[agentName] = 'FAILED';
        phaseState.status = 'FAILED';
        phaseState.progress = round(completedAgents / selectedAgents.length, 3);
        phaseState.completedAt = nowIso();
        phaseState.verdict = 'FAIL';
        phaseState.outputs = {
          phaseSummary: `${phaseMeta.label} failed at agent ${agentName}`,
          keyFindings: [`Failure: ${error.message}`],
          redFlags: [],
          dataGaps: [],
          phaseVerdict: 'FAIL'
        };
        appendLog(masterLog, 'orchestrator', 'ERROR', `${phaseMeta.label} failed: ${error.message}`);
        storyEngine.emit('phase_failed', {
          phase: phaseMeta.slug,
          phaseLabel: phaseMeta.label,
          failedAgent: agentName,
          error: error.message
        });
        storyEngine.emitDecision({
          phase: phaseMeta.key,
          title: `${phaseMeta.label} Halted`,
          rationale: `Agent ${agentName} failed and blocked downstream execution.`,
          inputs: [error.message],
          impact: ['Run marked FAILED', 'Resume required from failed phase']
        });
        storyEngine.emitMilestone(
          `${phaseMeta.label} Blocked`,
          `${agentName} failed - waiting for resume`,
          'danger'
        );
        encounteredFailure = true;
        break;
      }
    }

    if (encounteredFailure) break;

    const verdict = determinePhaseVerdict(phaseMeta.key, phaseData);
    const keyFindings = summarizeFindingsForPhase(phaseMeta.key, phaseData);
    phaseState.status = 'COMPLETE';
    phaseState.progress = 1;
    phaseState.completedAt = nowIso();
    phaseState.verdict = verdict;
    phaseState.findings = keyFindings.length;
    phaseState.riskScore = safeNumber(phaseData.riskScore, 0);
    phaseState.redFlagCount = safeNumber(phaseData.redFlagCount, 0);
    phaseState.dataGapCount = safeNumber(phaseData.dataGapCount, 0);
    phaseState.confidence = round(
      1 -
        Math.min(
          0.5,
          (safeNumber(phaseData.redFlagCount, 0) * 0.12 +
            safeNumber(phaseData.dataGapCount, 0) * 0.06) /
            10
        ),
      3
    );
    phaseState.dataForDownstream = phaseData;
    phaseState.outputs = {
      phaseSummary: `${phaseMeta.label} completed with verdict ${verdict}`,
      keyFindings,
      redFlags: phaseData.redFlags || [],
      dataGaps: phaseData.dataGaps || [],
      phaseVerdict: verdict
    };
    phaseMeta.agents.forEach((agentName) => {
      if (selectedAgentSet.has(agentName) && phaseState.agentStatuses[agentName] !== 'FAILED') {
        phaseState.agentStatuses[agentName] = 'COMPLETED';
      }
    });

    const phaseOutputPath = path.join(paths.phaseOutputDir, `${phaseMeta.slug}-output.json`);
    writeJson(phaseOutputPath, phaseData);

    const phaseReportPath = path.join(paths.reportsDir, `${phaseMeta.slug}-report.md`);
    fs.writeFileSync(phaseReportPath, renderPhaseReport(phaseMeta, phaseState));
    storyEngine.registerExternalDocument({
      phase: phaseMeta.key,
      agent: 'phase-orchestrator',
      title: `${phaseMeta.label} Structured Output`,
      docType: `${phaseMeta.slug}-output`,
      absolutePath: phaseOutputPath,
      summary: `Structured ${phaseMeta.label.toLowerCase()} data for downstream phases`,
      mime: 'application/json',
      tags: ['phase-output']
    });
    storyEngine.registerExternalDocument({
      phase: phaseMeta.key,
      agent: 'phase-orchestrator',
      title: `${phaseMeta.label} Phase Report`,
      docType: `${phaseMeta.slug}-report`,
      absolutePath: phaseReportPath,
      summary: `${phaseMeta.label} narrative report with findings, risks, and gaps`,
      mime: 'text/markdown',
      tags: ['phase-report']
    });

    const metrics = {
      riskScore: phaseState.riskScore,
      redFlagCount: phaseState.redFlagCount,
      dataGapCount: phaseState.dataGapCount
    };
    const phaseEvent = buildPhaseCompletionEvent(
      deal.dealId,
      phaseMeta.key,
      'COMPLETE',
      verdict,
      phaseState.startedAt,
      metrics,
      phaseData.redFlags || [],
      phaseData.dataGaps || [],
      checkpoint.traceId
    );
    validatePhaseCompletionEvent(BASE_DIR, phaseEvent);
    checkpoint.events.push(phaseEvent);
    phaseContext[phaseMeta.key] = phaseData;
    appendLog(masterLog, 'orchestrator', 'PHASE', `${phaseMeta.label} complete with verdict ${verdict}`);
    storyEngine.emit('phase_completed', {
      phase: phaseMeta.slug,
      phaseLabel: phaseMeta.label,
      verdict,
      riskScore: phaseState.riskScore,
      redFlagCount: phaseState.redFlagCount,
      dataGapCount: phaseState.dataGapCount,
      findings: keyFindings.slice(0, 4)
    });
    storyEngine.emitDecision({
      phase: phaseMeta.key,
      title: `${phaseMeta.label} Verdict: ${verdict}`,
      rationale: `${phaseMeta.label} completed with risk score ${phaseState.riskScore}.`,
      inputs: keyFindings,
      impact: [
        `${phaseState.redFlagCount} red flags`,
        `${phaseState.dataGapCount} data gaps`,
        `Downstream phase enabled`
      ]
    });
    storyEngine.emitMilestone(
      `${phaseMeta.label} Complete`,
      `Verdict ${verdict} - Risk ${phaseState.riskScore}`,
      verdict === 'PASS' || verdict === 'GO' ? 'success' : 'warning'
    );

    summarizeProgress(checkpoint);
    checkpoint.lastUpdatedAt = nowIso();
    validateMasterCheckpoint(BASE_DIR, checkpoint);
    writeJson(checkpointPath, checkpoint);
  }

  summarizeProgress(checkpoint);
  if (checkpoint.status === 'COMPLETE') {
    checkpoint.completedAt = nowIso();
    checkpoint.currentPhase = null;
    appendLog(masterLog, 'orchestrator', 'COMPLETE', 'Pipeline completed successfully');
    storyEngine.emitMilestone('Pipeline Complete', 'All phases executed successfully', 'success');
  } else if (encounteredFailure) {
    checkpoint.status = 'FAILED';
    appendLog(masterLog, 'orchestrator', 'ERROR', 'Pipeline halted due to agent failure');
  }

  const finalReportPath = path.join(paths.reportsDir, 'final-report.md');
  fs.writeFileSync(finalReportPath, renderFinalReport(checkpoint));
  storyEngine.registerExternalDocument({
    phase: 'closing',
    agent: 'master-orchestrator',
    title: 'Final Acquisition Report',
    docType: 'final-report',
    absolutePath: finalReportPath,
    summary: 'End-to-end recommendation with phase outcomes and go/no-go guidance',
    mime: 'text/markdown',
    tags: ['final-report']
  });
  checkpoint.lastUpdatedAt = nowIso();
  validateMasterCheckpoint(BASE_DIR, checkpoint);
  writeJson(checkpointPath, checkpoint);
  storyEngine.finalize(checkpoint.status === 'COMPLETE' ? 'COMPLETED' : 'FAILED', {
    checkpointPath: path.relative(BASE_DIR, checkpointPath).replace(/\\/g, '/'),
    finalReportPath: path.relative(BASE_DIR, finalReportPath).replace(/\\/g, '/'),
    scenario: scenarioName,
    workflowId: workflow.id,
    workflowName: workflow.name || workflow.id,
    inputSnapshotPath: checkpoint.inputSnapshot?.path,
    seed
  });
  storyFinalized = true;

  console.log(`Deal: ${deal.dealId}`);
  console.log(`Workflow: ${workflow.name || workflow.id}`);
  console.log(`Scenario: ${scenarioName}`);
  console.log(`Run ID: ${runId}`);
  console.log(`Seed: ${seed}`);
  console.log(`Status: ${checkpoint.status}`);
  console.log(`Checkpoint: ${checkpointPath}`);
  console.log(`Final report: ${finalReportPath}`);
  if (checkpoint.status === 'FAILED') {
    process.exitCode = 1;
  }

  if (!storyFinalized && storyEngine) {
    storyEngine.finalize('FAILED', { reason: 'Run terminated unexpectedly' });
    storyFinalized = true;
  }
}

function safeNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const args = parseArgs();
    const deal = readJson(args.dealPath);
    const runId =
      typeof args.runId === 'string' && args.runId.trim().length > 0
        ? args.runId.trim()
        : `local-${Date.now()}`;
    const fallbackStoryEngine = new StoryEngine({
      baseDir: BASE_DIR,
      dealId: deal.dealId,
      runId
    });
    fallbackStoryEngine.emit('run_error', { message });
    fallbackStoryEngine.finalize('FAILED', { error: message });
  } catch {
    // Do not mask original error if fallback story persistence also fails.
  }
  console.error(`orchestrate.js failed: ${error.message}`);
  process.exit(1);
});
