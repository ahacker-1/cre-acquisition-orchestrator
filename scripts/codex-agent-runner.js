#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  PHASES,
  phaseFromArg,
  readScenarioConfig,
  nowIso,
  ensureDir
} = require('./lib/runtime-core');
const { getWorkflowById, createWorkflowRunPlan } = require('./lib/workflow-catalog');
const { getCodexStatus, runStreaming, runSync } = require('./lib/codex-cli');
const { StoryEngine } = require('./lib/story-engine');

const BASE_DIR = path.resolve(__dirname, '..');
const SAFE_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function requireSafeRunId(runId) {
  const value = String(runId || '').trim();
  if (!SAFE_RUN_ID_PATTERN.test(value) || value.includes('..')) {
    throw new Error('Invalid --run-id. Use 1-128 letters, numbers, dots, underscores, or hyphens. Do not use path separators or "..".');
  }
  return value;
}

function parseArgs() {
  const args = process.argv.slice(2);
  function getArg(flag, fallback = null) {
    for (let index = args.length - 2; index >= 0; index -= 1) {
      if (args[index] === flag && args[index + 1]) return args[index + 1];
    }
    return fallback;
  }
  function getAll(flag) {
    const values = [];
    args.forEach((arg, index) => {
      if (arg === flag && args[index + 1]) values.push(args[index + 1]);
    });
    return values;
  }
  const inputSnapshotArg = getArg('--input-snapshot', null);
  return {
    dealPath: path.resolve(BASE_DIR, getArg('--deal', 'config/deal.json')),
    inputSnapshotPath: inputSnapshotArg ? path.resolve(BASE_DIR, inputSnapshotArg) : null,
    workflowId: getArg('--workflow', 'quick-deal-screen'),
    scenarioName: getArg('--scenario', null),
    phaseKey: phaseFromArg(getArg('--phase', null)),
    agentNames: getAll('--agent'),
    maxAgents: Number(getArg('--max-agents', '0')) || 0,
    concurrency: Math.max(1, Number(getArg('--concurrency', '2')) || 2),
    runId: requireSafeRunId(getArg('--run-id', `codex-${Date.now()}`)),
    model: getArg('--model', null),
    sandbox: getArg('--sandbox', 'read-only'),
    dryRun: args.includes('--dry-run'),
    search: args.includes('--search')
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function toRepoPath(filePath) {
  return path.relative(BASE_DIR, filePath).replace(/\\/g, '/');
}

function resolveAgentMeta(registry, phaseMeta, agentName) {
  const phaseRegistry = registry.agents?.[phaseMeta.slug] || {};
  const meta = phaseRegistry[agentName];
  if (!meta) throw new Error(`Agent ${agentName} was not found in config/agent-registry.json`);
  return meta;
}

function resolvePhaseOrchestrator(registry, phaseMeta) {
  const key = `${phaseMeta.slug}-orchestrator`;
  return registry.orchestrators?.[key] || null;
}

function uniqueExistingRepoPaths(filePaths) {
  const seen = new Set();
  return filePaths
    .filter(Boolean)
    .map((filePath) => String(filePath).replace(/\\/g, '/'))
    .filter((filePath) => {
      if (seen.has(filePath)) return false;
      seen.add(filePath);
      return fs.existsSync(path.join(BASE_DIR, filePath));
    });
}

function selectTasks(options, registry, workflow) {
  const plan = createWorkflowRunPlan(workflow, PHASES);
  const selectedAgentSet = new Set(options.agentNames);
  const tasks = [];

  for (const phaseMeta of PHASES) {
    if (options.phaseKey && phaseMeta.key !== options.phaseKey) continue;
    const selection = plan.phaseSelections.get(phaseMeta.key);
    if (!selection) continue;

    for (const agentName of selection.agents) {
      if (selectedAgentSet.size > 0 && !selectedAgentSet.has(agentName)) continue;
      const agentMeta = resolveAgentMeta(registry, phaseMeta, agentName);
      tasks.push({
        phaseMeta,
        agentName,
        agentMeta,
        agentPromptPath: path.join(BASE_DIR, agentMeta.file),
        phasePromptPath: resolvePhaseOrchestrator(registry, phaseMeta)
      });
    }
  }

  return options.maxAgents > 0 ? tasks.slice(0, options.maxAgents) : tasks;
}

function summarizeInputSnapshot(inputSnapshot) {
  if (!inputSnapshot || typeof inputSnapshot !== 'object') return null;
  const readiness = inputSnapshot.readiness || {};
  const coverage = readiness.sourceCoverage || {};
  return {
    sourceDocumentCount: coverage.sourceDocumentCount,
    appliedDocumentCount: coverage.appliedDocumentCount,
    pendingExtractionCount: coverage.pendingExtractionCount,
    blockerCount: Array.isArray(readiness.blockers) ? readiness.blockers.length : 0,
    warningCount: Array.isArray(readiness.warnings) ? readiness.warnings.length : 0
  };
}

function extractAgentVerdict(outputPath) {
  try {
    const raw = fs.readFileSync(outputPath, 'utf8');
    const match = raw.match(/## Agent Verdict\s+([\s\S]*?)(?=\n## |$)/i);
    const section = (match ? match[1] : raw)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 500);
    const verdictMatch = section.match(/\b(PASS|CONDITIONAL|FAIL)\b/i);
    return {
      verdict: verdictMatch ? verdictMatch[1].toUpperCase() : 'UNKNOWN',
      summary: section
    };
  } catch {
    return { verdict: 'UNKNOWN', summary: '' };
  }
}

function buildPrompt({
  task,
  deal,
  dealPath,
  inputSnapshotPath,
  inputSnapshot,
  registry,
  scenarioName,
  workflow,
  scenarioConfig
}) {
  const runtimeFiles = [
    `data/status/${deal.dealId}.json`,
    `data/phase-outputs/${deal.dealId}/due-diligence-output.json`,
    `data/phase-outputs/${deal.dealId}/underwriting-output.json`,
    `data/phase-outputs/${deal.dealId}/financing-output.json`,
    `data/phase-outputs/${deal.dealId}/legal-output.json`,
    `data/phase-outputs/${deal.dealId}/closing-output.json`,
    `data/reports/${deal.dealId}/final-report.md`
  ].filter((filePath) => fs.existsSync(path.join(BASE_DIR, filePath)));

  const sharedSkillFiles = Object.values(registry.skills || {});
  const inputSnapshotRepoPath =
    inputSnapshotPath && fs.existsSync(inputSnapshotPath) ? toRepoPath(inputSnapshotPath) : null;
  const promptFiles = uniqueExistingRepoPaths([
    task.phasePromptPath,
    task.agentMeta.file,
    toRepoPath(dealPath),
    inputSnapshotRepoPath,
    'config/thresholds.json',
    'config/agent-registry.json',
    ...sharedSkillFiles,
    'skills/self-review-protocol.md',
    'templates/agent-checkpoint.json',
    'templates/report-template.md',
    ...runtimeFiles
  ]);

  return [
    `You are the ${task.agentName} specialist in the CRE Acquisition Orchestrator.`,
    '',
    'Run inside Codex CLI as a local, read-only specialist agent. Use the repository files as your source of truth.',
    '',
    'Context:',
    `- Deal: ${deal.dealName || deal.dealId} (${deal.dealId})`,
    `- Workflow: ${workflow.name || workflow.id}`,
    `- Phase: ${task.phaseMeta.label}`,
    `- Scenario: ${scenarioName}`,
    `- Investment strategy: ${deal.investmentStrategy || 'not specified'}`,
    `- Scenario config assumptions: ${JSON.stringify(scenarioConfig.assumptions || {})}`,
    `- Dashboard input snapshot: ${inputSnapshotRepoPath || 'not provided'}`,
    `- Source-backed launch summary: ${JSON.stringify(summarizeInputSnapshot(inputSnapshot) || {})}`,
    '',
    'Read these local files before answering:',
    ...promptFiles.map((filePath) => `- ${filePath}`),
    '',
    'Operating rules:',
    '- Do not edit files.',
    '- Do not create commits.',
    '- Use local repo files first. If web search is unavailable, mark outside facts as data gaps.',
    '- Treat the dashboard input snapshot as the approved launch package and call out any mismatch with the deal file.',
    '- Do not invent source documents. If a required document is missing, call that out.',
    '- Keep the output useful to a CRE acquisition operator reviewing whether to proceed.',
    '',
    'Return Markdown with exactly these sections:',
    '## Agent Verdict',
    'PASS, CONDITIONAL, or FAIL with one paragraph of rationale.',
    '## Key Findings',
    '3 to 7 bullets grounded in local deal data and the agent prompt.',
    '## Red Flags',
    'Bullets with severity labels, or "None".',
    '## Data Gaps',
    'Bullets for missing information, or "None".',
    '## Recommended Follow Up',
    'Concrete next actions for the acquisition team.'
  ].join('\n');
}

function writeSummary(runDir, manifest) {
  const lines = [];
  lines.push(`# Codex Agent Run - ${manifest.runId}`);
  lines.push('');
  lines.push(`- Started: ${manifest.startedAt}`);
  lines.push(`- Completed: ${manifest.completedAt || 'incomplete'}`);
  lines.push(`- Workflow: ${manifest.workflowName}`);
  lines.push(`- Scenario: ${manifest.scenarioName}`);
  lines.push(`- Status: ${manifest.status}`);
  lines.push(`- Agents: ${manifest.results.length}`);
  lines.push('');
  lines.push('## Results');
  manifest.results.forEach((result) => {
    lines.push(`- ${result.status}: ${result.phaseLabel} / ${result.agentName} -> ${result.outputPath || result.error || 'no output'}`);
  });
  const summaryPath = path.join(runDir, 'summary.md');
  fs.writeFileSync(summaryPath, `${lines.join('\n')}\n`);
  return summaryPath;
}

function codexRootSupports(flag) {
  const result = runSync('codex', ['--help'], { cwd: BASE_DIR });
  return result.status === 0 && `${result.stdout || ''}${result.stderr || ''}`.includes(flag);
}

async function runAgentTask({
  options,
  task,
  deal,
  inputSnapshot,
  story,
  registry,
  workflow,
  scenarioName,
  scenarioConfig,
  runDir
}) {
  const phaseDir = path.join(runDir, task.phaseMeta.slug);
  ensureDir(phaseDir);
  const outputPath = path.join(phaseDir, `${task.agentName}.md`);
  const promptPath = path.join(phaseDir, `${task.agentName}.prompt.md`);
  const logPath = path.join(phaseDir, `${task.agentName}.log`);
  const prompt = buildPrompt({
    task,
    deal,
    dealPath: options.dealPath,
    inputSnapshotPath: options.inputSnapshotPath,
    inputSnapshot,
    registry,
    scenarioName,
    workflow,
    scenarioConfig
  });
  fs.writeFileSync(promptPath, prompt);
  story.emit('agent_started', {
    phase: task.phaseMeta.slug,
    phaseLabel: task.phaseMeta.label,
    agent: task.agentName,
    title: `${task.agentName} started`,
    promptPath: toRepoPath(promptPath)
  });

  if (options.dryRun) {
    story.emit('agent_planned', {
      phase: task.phaseMeta.slug,
      phaseLabel: task.phaseMeta.label,
      agent: task.agentName,
      title: `${task.agentName} prompt prepared`,
      promptPath: toRepoPath(promptPath)
    });
    return {
      status: 'DRY_RUN',
      phase: task.phaseMeta.key,
      phaseLabel: task.phaseMeta.label,
      agentName: task.agentName,
      promptPath: toRepoPath(promptPath),
      outputPath: toRepoPath(outputPath)
    };
  }

  const codexArgs = [];
  if (options.search && codexRootSupports('--search')) {
    codexArgs.push('--search');
  } else if (options.search) {
    console.warn('[codex-run] This Codex CLI does not expose --search. Continuing without web search.');
  }
  codexArgs.push(
    'exec',
    '--cd',
    BASE_DIR,
    '--sandbox',
    options.sandbox,
    '--skip-git-repo-check',
    '--output-last-message',
    outputPath
  );
  if (options.model) codexArgs.push('-m', options.model);
  codexArgs.push('-');

  console.log(`[codex-run] Starting ${task.phaseMeta.label} / ${task.agentName}`);
  const result = await runStreaming('codex', codexArgs, {
    cwd: BASE_DIR,
    input: prompt,
    logFile: logPath
  });

  const ok = result.code === 0 && fs.existsSync(outputPath);
  console.log(`[codex-run] ${ok ? 'Complete' : 'Failed'} ${task.phaseMeta.label} / ${task.agentName}`);
  if (ok) {
    const extracted = extractAgentVerdict(outputPath);
    story.registerExternalDocument({
      phase: task.phaseMeta.slug,
      agent: task.agentName,
      title: `${task.agentName} Codex memo`,
      docType: 'codex-agent-memo',
      absolutePath: outputPath,
      summary: extracted.summary || `Codex output for ${task.phaseMeta.label} / ${task.agentName}`,
      tags: ['codex', task.phaseMeta.slug, task.agentName]
    });
    story.emit('agent_completed', {
      phase: task.phaseMeta.slug,
      phaseLabel: task.phaseMeta.label,
      agent: task.agentName,
      title: `${task.agentName} completed`,
      status: 'PASS',
      verdict: extracted.verdict,
      summary: extracted.summary,
      outputPath: toRepoPath(outputPath)
    });
  } else {
    story.emit('agent_failed', {
      phase: task.phaseMeta.slug,
      phaseLabel: task.phaseMeta.label,
      agent: task.agentName,
      title: `${task.agentName} failed`,
      status: 'FAIL',
      exitCode: result.code,
      error: (result.stderr || result.stdout || 'Codex did not produce an output file').slice(0, 2000)
    });
  }
  return {
    status: ok ? 'PASS' : 'FAIL',
    phase: task.phaseMeta.key,
    phaseLabel: task.phaseMeta.label,
    agentName: task.agentName,
    promptPath: toRepoPath(promptPath),
    outputPath: ok ? toRepoPath(outputPath) : null,
    logPath: toRepoPath(logPath),
    exitCode: result.code,
    error: ok ? null : (result.stderr || result.stdout || 'Codex did not produce an output file').slice(0, 2000)
  };
}

async function runQueue(tasks, concurrency, worker) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function loop() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(tasks[currentIndex]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => loop());
  await Promise.all(workers);
  return results;
}

async function main() {
  const options = parseArgs();
  const status = getCodexStatus(BASE_DIR);
  if (!status.installed) {
    throw new Error('Codex CLI is not installed. Run: npm install -g @openai/codex');
  }
  if (!status.loggedIn) {
    throw new Error('Codex CLI is not logged in. Run: codex login');
  }

  const deal = readJson(options.dealPath);
  const inputSnapshot = readJsonIfExists(options.inputSnapshotPath);
  const registry = readJson(path.join(BASE_DIR, 'config', 'agent-registry.json'));
  const workflow = getWorkflowById(BASE_DIR, options.workflowId);
  const scenarioName = options.scenarioName || workflow.recommendedScenario || 'core-plus';
  const scenarioConfig = readScenarioConfig(BASE_DIR, scenarioName);
  const tasks = selectTasks(options, registry, workflow);

  if (tasks.length === 0) {
    throw new Error('No agents selected. Check --workflow, --phase, and --agent filters.');
  }

  const runDir = path.join(BASE_DIR, 'data', 'codex-runs', options.runId);
  ensureDir(runDir);
  const story = new StoryEngine({ baseDir: BASE_DIR, dealId: deal.dealId, runId: options.runId });
  story.persistManifest({
    runtimeProvider: 'codex',
    codexVersion: status.version,
    codexLoginStatus: status.loginStatus,
    workflowId: workflow.id,
    workflowName: workflow.name || workflow.id,
    scenarioName,
    inputSnapshotPath: options.inputSnapshotPath ? toRepoPath(options.inputSnapshotPath) : null,
    codexRunDir: toRepoPath(runDir)
  });
  story.emitMilestone(
    'Codex run started',
    `${workflow.name || workflow.id} launched with ${tasks.length} agent${tasks.length === 1 ? '' : 's'}`,
    'info'
  );
  if (options.inputSnapshotPath && fs.existsSync(options.inputSnapshotPath)) {
    story.registerExternalDocument({
      phase: 'general',
      agent: 'codex-runner',
      title: 'Codex Launch Input Snapshot',
      docType: 'input-snapshot',
      absolutePath: options.inputSnapshotPath,
      summary: 'Dashboard-approved launch package captured before Codex execution.',
      mime: 'application/json',
      tags: ['codex', 'input-snapshot']
    });
  }

  const manifest = {
    runId: options.runId,
    startedAt: nowIso(),
    completedAt: null,
    status: 'RUNNING',
    codexVersion: status.version,
    codexLoginStatus: status.loginStatus,
    workflowId: workflow.id,
    workflowName: workflow.name || workflow.id,
    scenarioName,
    dealId: deal.dealId,
    dealPath: toRepoPath(options.dealPath),
    inputSnapshotPath: options.inputSnapshotPath ? toRepoPath(options.inputSnapshotPath) : null,
    inputSnapshotSummary: summarizeInputSnapshot(inputSnapshot),
    concurrency: options.concurrency,
    sandbox: options.sandbox,
    search: options.search,
    dryRun: options.dryRun,
    selectedAgents: tasks.map((task) => ({
      phase: task.phaseMeta.key,
      phaseLabel: task.phaseMeta.label,
      agentName: task.agentName,
      promptFile: task.agentMeta.file
    })),
    results: []
  };
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`[codex-run] Run: ${options.runId}`);
  console.log(`[codex-run] Workflow: ${workflow.name || workflow.id}`);
  console.log(`[codex-run] Agents: ${tasks.length}`);
  console.log(`[codex-run] Output: ${toRepoPath(runDir)}`);

  manifest.results = await runQueue(tasks, options.concurrency, (task) =>
    runAgentTask({
      options,
      task,
      deal,
      inputSnapshot,
      story,
      registry,
      workflow,
      scenarioName,
      scenarioConfig,
      runDir
    })
  );
  manifest.completedAt = nowIso();
  manifest.status = manifest.results.some((result) => result.status === 'FAIL') ? 'FAILED' : 'COMPLETE';
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const summaryPath = writeSummary(runDir, manifest);
  story.registerExternalDocument({
    phase: 'general',
    agent: 'codex-runner',
    title: 'Codex Run Summary',
    docType: 'codex-run-summary',
    absolutePath: summaryPath,
    summary: `${workflow.name || workflow.id} completed with status ${manifest.status}.`,
    tags: ['codex', 'summary']
  });
  story.finalize(manifest.status, {
    runtimeProvider: 'codex',
    codexVersion: status.version,
    codexLoginStatus: status.loginStatus,
    workflowId: workflow.id,
    workflowName: workflow.name || workflow.id,
    scenarioName,
    inputSnapshotPath: manifest.inputSnapshotPath,
    codexRunDir: toRepoPath(runDir),
    results: manifest.results
  });

  console.log(`[codex-run] Status: ${manifest.status}`);
  console.log(`[codex-run] Summary: ${toRepoPath(path.join(runDir, 'summary.md'))}`);
  if (manifest.status !== 'COMPLETE') process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[codex-run] Failed: ${error.message}`);
  process.exit(1);
});
