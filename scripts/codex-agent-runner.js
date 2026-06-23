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

// ---------------------------------------------------------------------------
// W73 - No-secret-logging redaction (pure)
// ---------------------------------------------------------------------------
const SECRET_MASK = '[REDACTED]';

// Each rule is a regex with a replacer that preserves a leading label/prefix
// (so "Authorization: Bearer xyz" becomes "Authorization: [REDACTED]") while
// masking the secret value itself. Ordered most-specific first.
const SECRET_RULES = [
  // Authorization headers: "Authorization: Bearer <token>" or "Authorization: <token>".
  // The negative lookahead keeps redaction idempotent (never re-masks an
  // existing [REDACTED] token, which would otherwise swallow trailing chars).
  {
    pattern: /(authorization\s*[:=]\s*)(?:bearer\s+)?(?!\[REDACTED\])[^\s"',]+/gi,
    replace: (_match, prefix) => `${prefix}${SECRET_MASK}`
  },
  // Bare "Bearer <token>" anywhere
  {
    pattern: /\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._\-+/=]+/gi,
    replace: () => `Bearer ${SECRET_MASK}`
  },
  // OpenAI / ChatGPT style keys: sk-..., sk-proj-..., rk-..., etc. (>= 20 chars of body)
  {
    pattern: /\b(?:sk|rk|pk|ssk)-(?:[A-Za-z0-9_-]*-)?[A-Za-z0-9_-]{20,}/g,
    replace: () => SECRET_MASK
  },
  // GitHub-style tokens (ghp_, gho_, ghs_, github_pat_, etc.)
  {
    pattern: /\b(?:gh[posru]|github_pat)_[A-Za-z0-9_]{20,}/g,
    replace: () => SECRET_MASK
  },
  // AWS access key ids
  {
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replace: () => SECRET_MASK
  },
  // Keyed secret assignments: api_key / apikey / access_token / refresh_token /
  // client_secret / password / secret = "<value>" (JSON, env, query-string forms).
  // The key itself may be quoted (JSON: "access_token":"...") so we allow an
  // optional closing quote on the key before the : or = separator.
  {
    pattern:
      /(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|password|passwd|token)["']?\s*[:=]\s*)(?:"([^"]+)"|'([^']+)'|(?!\[REDACTED\])([^\s,&}]+))/gi,
    replace: (_match, prefix, dq, sq, bare) => {
      if (dq !== undefined) return `${prefix}"${SECRET_MASK}"`;
      if (sq !== undefined) return `${prefix}'${SECRET_MASK}'`;
      return `${prefix}${bare !== undefined ? SECRET_MASK : ''}`;
    }
  },
  // Long opaque token-looking strings: hex (>= 32) or base64url-ish (>= 40).
  // Run last so labelled values above are masked with their prefix preserved.
  {
    pattern: /\b[0-9a-f]{32,}\b/gi,
    replace: () => SECRET_MASK
  },
  {
    pattern: /\b[A-Za-z0-9_-]{40,}\b/g,
    replace: () => SECRET_MASK
  }
];

function redactSecrets(text) {
  if (text === null || text === undefined) return text;
  let value = typeof text === 'string' ? text : String(text);
  for (const rule of SECRET_RULES) {
    value = value.replace(rule.pattern, rule.replace);
  }
  return value;
}

// ---------------------------------------------------------------------------
// W70 - Per-agent retry/backoff (pure)
// ---------------------------------------------------------------------------
function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffMs(attemptIndex, baseBackoffMs) {
  // attemptIndex is zero-based: first retry waits baseBackoffMs, then doubles.
  const base = Number(baseBackoffMs) > 0 ? Number(baseBackoffMs) : 0;
  if (base === 0) return 0;
  return base * Math.pow(2, Math.max(0, attemptIndex));
}

// Runs `fn(attemptNumber)` and retries on transient failure with exponential
// backoff. `fn` should resolve on success or reject on failure. Returns the
// resolved value AND records attempt count via the returned object shape only
// when callers wrap it; here we surface attempts through onAttempt callback.
async function runWithRetry(fn, options = {}) {
  const maxRetries = Number.isInteger(options.maxRetries) && options.maxRetries >= 0 ? options.maxRetries : 2;
  const baseBackoffMs = Number(options.baseBackoffMs) >= 0 ? Number(options.baseBackoffMs) : 1000;
  const isTransient = typeof options.isTransient === 'function' ? options.isTransient : () => true;
  const sleep = typeof options.sleep === 'function' ? options.sleep : defaultSleep;
  const onAttempt = typeof options.onAttempt === 'function' ? options.onAttempt : null;

  let attempt = 0;
  let lastError = null;
  // Total tries = 1 initial + maxRetries retries.
  while (attempt <= maxRetries) {
    const attemptNumber = attempt + 1;
    try {
      const value = await fn(attemptNumber);
      if (onAttempt) onAttempt({ attempt: attemptNumber, outcome: 'success' });
      return { value, attempts: attemptNumber };
    } catch (error) {
      lastError = error;
      const transient = isTransient(error);
      if (onAttempt) {
        onAttempt({ attempt: attemptNumber, outcome: transient ? 'transient-error' : 'permanent-error', error });
      }
      if (!transient || attempt >= maxRetries) {
        const wrapped = error instanceof Error ? error : new Error(String(error));
        wrapped.attempts = attemptNumber;
        throw wrapped;
      }
      const backoff = computeBackoffMs(attempt, baseBackoffMs);
      if (backoff > 0) await sleep(backoff);
      attempt += 1;
    }
  }
  // Unreachable, but keep a defined throw for safety.
  const fallback = lastError instanceof Error ? lastError : new Error('runWithRetry exhausted');
  fallback.attempts = attempt;
  throw fallback;
}

// ---------------------------------------------------------------------------
// W71 - Partial-failure semantics (pure)
// ---------------------------------------------------------------------------
// Statuses that count as a "pass" for outcome purposes. DRY_RUN is treated as
// non-failing (a dry run never actually executes an agent).
const NON_FAILING_STATUSES = new Set(['PASS', 'DRY_RUN']);

function computeRunOutcome(results) {
  const list = Array.isArray(results) ? results : [];
  const failedAgents = list
    .filter((result) => result && !NON_FAILING_STATUSES.has(result.status))
    .map((result) => ({
      phase: result.phase,
      phaseLabel: result.phaseLabel,
      agentName: result.agentName,
      status: result.status,
      attempts: result.attempts,
      error: result.error || null
    }));

  const passedCount = list.filter((result) => result && NON_FAILING_STATUSES.has(result.status)).length;
  const failedCount = failedAgents.length;

  let runOutcome;
  if (list.length === 0) {
    runOutcome = 'failed';
  } else if (failedCount === 0) {
    runOutcome = 'success';
  } else if (passedCount === 0) {
    runOutcome = 'failed';
  } else {
    runOutcome = 'partial';
  }

  // Backward-compatible manifest status mapping (existing consumers expect
  // COMPLETE / FAILED). "partial" maps to FAILED so existing FAIL-detection and
  // exit-code-1 behavior is preserved.
  const status = runOutcome === 'success' ? 'COMPLETE' : 'FAILED';

  return { runOutcome, status, failedAgents, passedCount, failedCount, totalCount: list.length };
}

// Given a prior manifest object, return the list of agent selectors that
// FAILED so a rerun can target only those.
function selectFailedAgentSelectors(priorManifest) {
  if (!priorManifest || typeof priorManifest !== 'object') return [];
  // Prefer the explicit failedAgents list when present (W71 manifests).
  if (Array.isArray(priorManifest.failedAgents) && priorManifest.failedAgents.length > 0) {
    return priorManifest.failedAgents
      .filter((entry) => entry && entry.agentName)
      .map((entry) => ({ phase: entry.phase, agentName: entry.agentName }));
  }
  // Fall back to deriving from results for older manifests.
  const results = Array.isArray(priorManifest.results) ? priorManifest.results : [];
  return results
    .filter((result) => result && !NON_FAILING_STATUSES.has(result.status))
    .map((result) => ({ phase: result.phase, agentName: result.agentName }));
}

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
  const rerunFailed = args.includes('--rerun-failed');
  const rawRunId = getArg('--run-id', `codex-${Date.now()}`);
  return {
    dealPath: path.resolve(BASE_DIR, getArg('--deal', 'config/deal.json')),
    inputSnapshotPath: inputSnapshotArg ? path.resolve(BASE_DIR, inputSnapshotArg) : null,
    workflowId: getArg('--workflow', 'quick-deal-screen'),
    scenarioName: getArg('--scenario', null),
    phaseKey: phaseFromArg(getArg('--phase', null)),
    agentNames: getAll('--agent'),
    maxAgents: Number(getArg('--max-agents', '0')) || 0,
    concurrency: Math.max(1, Number(getArg('--concurrency', '2')) || 2),
    runId: requireSafeRunId(rawRunId),
    model: getArg('--model', null),
    sandbox: getArg('--sandbox', 'read-only'),
    dryRun: args.includes('--dry-run'),
    search: args.includes('--search'),
    // W70: per-agent retry/backoff (default 2 retries, 1000ms base)
    maxRetries: Math.max(0, Number(getArg('--max-retries', '2')) || 0),
    retryBaseMs: Math.max(0, Number(getArg('--retry-base-ms', '1000')) || 0),
    // W71: rerun only the failed agents from a prior run's manifest
    rerunFailed
  };
}

// W71: read failed-agent selectors from a prior run's persisted manifest.json.
function readPriorFailedSelectors(runId) {
  const priorManifestPath = path.join(BASE_DIR, 'data', 'codex-runs', runId, 'manifest.json');
  const priorManifest = readJsonIfExists(priorManifestPath);
  if (!priorManifest) {
    throw new Error(`--rerun-failed could not read prior manifest at ${toRepoPath(priorManifestPath)}`);
  }
  return selectFailedAgentSelectors(priorManifest);
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

// Document types whose content the legal-phase agents reason over (PSA, title,
// estoppels, etc.). Kept broad enough to cover every legal specialist's inputs.
const LEGAL_DOCUMENT_TYPES = new Set([
  'psa',
  'title',
  'title_commitment',
  'estoppel',
  'survey',
  'loi',
  'insurance',
  'loan_documents',
  'closing_statement'
]);

// Source formats a Codex agent can read directly as text. Binary PDFs are
// represented to the agent by their extraction JSON instead.
const TEXT_DOCUMENT_EXTENSIONS = new Set(['.md', '.txt', '.csv', '.json']);

// Repo-relative files giving the legal agents the actual uploaded legal
// documents for a deal: each document's source-backed extraction JSON (parsed
// fields + raw snippets with provenance) plus the raw source when it is a text
// format. Returns [] when the deal has no document manifest. This is what lets a
// legal specialist reason over the real PSA / title commitment / estoppels
// rather than only the deal config and upstream phase outputs.
function legalDocumentRepoFiles(dealId) {
  const manifestPath = path.join(BASE_DIR, 'data', 'deals', String(dealId), 'document-manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return [];
  }
  const documents = Array.isArray(manifest.documents) ? manifest.documents : [];
  const files = [];
  for (const doc of documents) {
    if (!doc || !LEGAL_DOCUMENT_TYPES.has(doc.type)) continue;
    files.push(`data/deals/${dealId}/extractions/${doc.documentId}.json`);
    const ext = path.extname(doc.fileName || '').toLowerCase();
    if (doc.path && TEXT_DOCUMENT_EXTENSIONS.has(ext)) {
      files.push(toRepoPath(doc.path));
    }
  }
  return files;
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
  // Legal specialists reason over the deal's actual legal documents; other
  // phases do not need them, so scope this to the legal phase.
  const legalDocumentFiles =
    task.phaseMeta?.slug === 'legal' ? legalDocumentRepoFiles(deal.dealId) : [];
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
    ...legalDocumentFiles,
    ...runtimeFiles
  ]);
  const hasLegalDocuments = legalDocumentFiles.some((filePath) =>
    fs.existsSync(path.join(BASE_DIR, filePath)));

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
    ...(task.phaseMeta?.slug === 'legal'
      ? [
          `- Legal source documents: ${
            hasLegalDocuments
              ? 'uploaded legal documents and their source-backed extractions are included in the file list below — ground your review in their actual terms (purchase price, deposits, dates, Schedule B exceptions, estoppel lease terms).'
              : 'none uploaded for this deal — flag any document you would need under Data Gaps.'
          }`
        ]
      : []),
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
    'PASS, CONDITIONAL, or FAIL with one paragraph of rationale. Judge the deal on its merits in your domain, using config/thresholds.json where financial criteria apply. Reserve FAIL for a genuine dealbreaker on the thresholds list (e.g. 100% LTV, DSCR below 0.80 without a value-add thesis, occupancy below 70% with no funded lease-up) or a clear failure of multiple primary criteria on economics. Use CONDITIONAL when criteria are marginal but fixable (e.g. LTV in the 0.80-0.85 band, or coverage achievable by re-cutting leverage). Use PASS when the primary criteria are met. IMPORTANT: missing upstream artifacts, dashboard snapshots, or other data gaps LOWER your confidence and belong under Data Gaps — they must NOT by themselves downgrade an otherwise-clean PASS or escalate a deal to FAIL.',
    '## Metrics',
    'If your analysis produced any of these figures, report each on its own line as `Label: value` so it can be read precisely; otherwise write "None". Use the deal\'s actual computed numbers (never threshold or example values). For DSCR, report the going-in DSCR on AMORTIZING debt service as the headline and label any interest-only figure separately. The following are an ILLUSTRATIVE format only (not any deal\'s answer):',
    'NOI: $1,234,000',
    'EGI: $2,500,000',
    'Going-in Cap Rate: 5.75%',
    'Going-in DSCR (amortizing): 1.40x',
    'Leveraged IRR: 12.5%',
    'Equity Multiple: 1.70x',
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
  if (manifest.runOutcome) lines.push(`- Outcome: ${manifest.runOutcome}`);
  lines.push(`- Agents: ${manifest.results.length}`);
  if (Array.isArray(manifest.failedAgents) && manifest.failedAgents.length > 0) {
    lines.push(`- Failed agents: ${manifest.failedAgents.map((agent) => agent.agentName).join(', ')}`);
  }
  lines.push('');
  lines.push('## Results');
  manifest.results.forEach((result) => {
    const attemptLabel = typeof result.attempts === 'number' ? ` (attempts: ${result.attempts})` : '';
    const detail = result.outputPath || redactSecrets(result.error || '') || 'no output';
    lines.push(`- ${result.status}: ${result.phaseLabel} / ${result.agentName}${attemptLabel} -> ${detail}`);
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
      attempts: 0,
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

  // W70: wrap the Codex invocation in retry/backoff. A transient failure is a
  // non-zero exit or a missing output file (the codex process failed to
  // produce a memo). runStreaming itself resolves rather than rejects, so we
  // translate "did not succeed" into a thrown error that runWithRetry can see.
  const runOnce = options.runStreamingFn || runStreaming;
  let result = { code: null, stdout: '', stderr: '' };
  let attempts = 0;
  const execute = async (attemptNumber) => {
    attempts = attemptNumber;
    result = await runOnce('codex', codexArgs, {
      cwd: BASE_DIR,
      input: prompt,
      logFile: logPath,
      redact: redactSecrets
    });
    if (!(result.code === 0 && fs.existsSync(outputPath))) {
      const reason = redactSecrets(result.stderr || result.stdout || 'Codex did not produce an output file').slice(0, 2000);
      const error = new Error(reason);
      error.exitCode = result.code;
      throw error;
    }
    return result;
  };

  try {
    await runWithRetry(execute, {
      maxRetries: options.maxRetries,
      baseBackoffMs: options.retryBaseMs,
      sleep: options.sleep, // injectable for tests; defaults to real timer
      isTransient: () => true,
      onAttempt: ({ attempt, outcome }) => {
        if (outcome === 'transient-error') {
          console.warn(`[codex-run] ${task.agentName} attempt ${attempt} failed; retrying.`);
        }
      }
    });
  } catch {
    // Final failure handled below via the ok/result inspection.
  }

  const ok = result.code === 0 && fs.existsSync(outputPath);
  console.log(`[codex-run] ${ok ? 'Complete' : 'Failed'} ${task.phaseMeta.label} / ${task.agentName} (attempts: ${attempts})`);
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
      attempts,
      error: redactSecrets(result.stderr || result.stdout || 'Codex did not produce an output file').slice(0, 2000)
    });
  }
  return {
    status: ok ? 'PASS' : 'FAIL',
    phase: task.phaseMeta.key,
    phaseLabel: task.phaseMeta.label,
    agentName: task.agentName,
    attempts,
    promptPath: toRepoPath(promptPath),
    outputPath: ok ? toRepoPath(outputPath) : null,
    logPath: toRepoPath(logPath),
    exitCode: result.code,
    error: ok ? null : redactSecrets(result.stderr || result.stdout || 'Codex did not produce an output file').slice(0, 2000)
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

  // W71: when re-running only failed agents, read the prior run's manifest and
  // narrow the agent filter to its failedAgents before task selection.
  let rerunSelectors = null;
  if (options.rerunFailed) {
    rerunSelectors = readPriorFailedSelectors(options.runId);
    if (rerunSelectors.length === 0) {
      throw new Error(`--rerun-failed: prior run ${options.runId} had no failed agents to re-run.`);
    }
    options.agentNames = rerunSelectors.map((selector) => selector.agentName);
    console.log(`[codex-run] Re-running ${rerunSelectors.length} failed agent(s) from prior run ${options.runId}.`);
  }

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
    maxRetries: options.maxRetries,
    retryBaseMs: options.retryBaseMs,
    rerunFailed: options.rerunFailed,
    runOutcome: null,
    failedAgents: [],
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
  // W71: derive machine-readable outcome (success | partial | failed) and the
  // failed-agent list; status stays backward-compatible (COMPLETE | FAILED).
  const outcome = computeRunOutcome(manifest.results);
  manifest.runOutcome = outcome.runOutcome;
  manifest.failedAgents = outcome.failedAgents;
  manifest.status = outcome.status;
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

// Only auto-run when invoked directly as a CLI. When required as a module
// (e.g. unit tests), the pure helpers below are importable without executing
// the live Codex path.
if (require.main === module) {
  main().catch((error) => {
    console.error(`[codex-run] Failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  redactSecrets,
  computeBackoffMs,
  runWithRetry,
  computeRunOutcome,
  selectFailedAgentSelectors,
  legalDocumentRepoFiles,
  buildPrompt
};
