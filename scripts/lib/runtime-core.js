const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assertValid, readJson } = require('./schema-validator');

const PHASES = [
  {
    key: 'dueDiligence',
    slug: 'due-diligence',
    label: 'Due Diligence',
    agents: [
      'rent-roll-analyst',
      'opex-analyst',
      'physical-inspection',
      'legal-title-review',
      'market-study',
      'tenant-credit',
      'environmental-review'
    ]
  },
  {
    key: 'underwriting',
    slug: 'underwriting',
    label: 'Underwriting',
    agents: ['financial-model-builder', 'scenario-analyst', 'ic-memo-writer']
  },
  {
    key: 'financing',
    slug: 'financing',
    label: 'Financing',
    agents: ['lender-outreach', 'quote-comparator', 'term-sheet-builder']
  },
  {
    key: 'legal',
    slug: 'legal',
    label: 'Legal',
    agents: [
      'psa-reviewer',
      'loan-doc-reviewer',
      'title-survey-reviewer',
      'estoppel-tracker',
      'insurance-coordinator',
      'transfer-doc-preparer'
    ]
  },
  {
    key: 'closing',
    slug: 'closing',
    label: 'Closing',
    agents: ['closing-coordinator', 'funds-flow-manager']
  }
];

const SCHEMA_BY_PHASE = {
  dueDiligence: 'schemas/phases/due-diligence-data.schema.json',
  underwriting: 'schemas/phases/underwriting-data.schema.json',
  financing: 'schemas/phases/financing-data.schema.json',
  legal: 'schemas/phases/legal-data.schema.json',
  closing: 'schemas/phases/closing-data.schema.json'
};

function createRng(seed) {
  let t = seed + 0x6d2b79f5;
  return function rng() {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input) {
  const hash = crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 8);
  return parseInt(hash, 16);
}

function randBetween(rng, min, max) {
  return rng() * (max - min) + min;
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath);
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function appendLog(logFile, agent, category, message) {
  ensureDir(path.dirname(logFile));
  const line = `[${nowIso()}] [${agent}] [${category}] ${message}\n`;
  fs.appendFileSync(logFile, line);
}

function safeNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function buildFlag(id, severity, category, message, impact, owner, status = 'OPEN') {
  return {
    id,
    severity,
    category,
    message,
    impact,
    owner,
    status,
    createdAt: nowIso()
  };
}

function buildDataGap(id, message, owner = 'orchestrator') {
  return {
    id,
    severity: 'MEDIUM',
    category: 'DATA_GAP',
    message,
    impact: 'Could reduce confidence in recommendation',
    owner,
    status: 'OPEN',
    createdAt: nowIso()
  };
}

function buildChecklistItem(id, description, status, blocker, owner, dueAt, evidencePath = '') {
  return {
    id,
    description,
    status,
    blocker,
    owner,
    dueAt,
    evidencePath
  };
}

function formatPhaseName(phaseKey) {
  return phaseKey === 'dueDiligence' ? 'due-diligence' : phaseKey;
}

function phaseKeyToDashboard(phaseKey) {
  return phaseKey === 'dueDiligence' ? 'due_diligence' : phaseKey;
}

function normalizeDealProperty(deal) {
  return {
    address: deal?.property?.address || 'Unknown',
    city: deal?.property?.city || '',
    state: deal?.property?.state || '',
    zip: deal?.property?.zip || '',
    totalUnits: safeNumber(deal?.property?.totalUnits, 0),
    askingPrice: safeNumber(deal?.financials?.askingPrice, 0)
  };
}

function initPhaseState(agents) {
  const agentStatuses = {};
  agents.forEach((agent) => {
    agentStatuses[agent] = 'PENDING';
  });
  return {
    status: 'PENDING',
    progress: 0,
    startedAt: null,
    completedAt: null,
    verdict: null,
    confidence: 0,
    riskScore: 0,
    redFlagCount: 0,
    dataGapCount: 0,
    findings: 0,
    outputs: {
      phaseSummary: '',
      keyFindings: [],
      redFlags: [],
      dataGaps: [],
      phaseVerdict: null
    },
    agentStatuses,
    dataForDownstream: {}
  };
}

function createInitialCheckpoint(deal, scenarioName, seed) {
  const phases = {};
  PHASES.forEach((phase) => {
    phases[phase.key] = initPhaseState(phase.agents);
  });
  return {
    dealId: deal.dealId,
    dealName: deal.dealName || `${deal.dealId} Acquisition`,
    property: normalizeDealProperty(deal),
    status: 'PENDING',
    currentPhase: null,
    overallProgress: 0,
    startedAt: nowIso(),
    lastUpdatedAt: nowIso(),
    completedAt: null,
    traceId: `${deal.dealId}-${Date.now()}`,
    scenario: scenarioName,
    seed,
    phases,
    events: [],
    resumeInstructions:
      `Run: node scripts/orchestrate.js --deal config/deal.json --resume --scenario ${scenarioName} --seed ${seed}`
  };
}

function summarizeProgress(checkpoint) {
  const total = PHASES.length;
  let completed = 0;
  let running = false;
  let failed = false;

  PHASES.forEach((phase) => {
    const status = checkpoint.phases[phase.key]?.status;
    if (status === 'COMPLETE' || status === 'SKIPPED') completed += 1;
    if (status === 'RUNNING') running = true;
    if (status === 'FAILED') failed = true;
  });

  checkpoint.overallProgress = round((completed / total) * 100, 2);
  if (failed) checkpoint.status = 'FAILED';
  else if (completed === total) checkpoint.status = 'COMPLETE';
  else if (running || completed > 0) checkpoint.status = 'RUNNING';
  else checkpoint.status = 'PENDING';
  checkpoint.lastUpdatedAt = nowIso();
}

function scenarioAdjustments(scenario, fallback = {}) {
  const defaults = {
    occupancyShift: 0,
    rentGrowthShift: 0,
    expenseInflationShift: 0,
    capRateShiftBps: 0,
    lenderSpreadShiftBps: 0,
    legalComplexity: 'medium',
    environmentalRisk: 'medium'
  };
  return {
    ...defaults,
    ...(scenario?.assumptions || {}),
    ...fallback
  };
}

function checkpointPaths(baseDir, dealId) {
  return {
    masterCheckpoint: path.join(baseDir, 'data', 'status', `${dealId}.json`),
    phaseOutputDir: path.join(baseDir, 'data', 'phase-outputs', dealId),
    logsDir: path.join(baseDir, 'data', 'logs', dealId),
    reportsDir: path.join(baseDir, 'data', 'reports', dealId),
    agentStatusDir: path.join(baseDir, 'data', 'status', dealId, 'agents')
  };
}

function ensureRuntimePaths(baseDir, dealId) {
  const paths = checkpointPaths(baseDir, dealId);
  ensureDir(path.dirname(paths.masterCheckpoint));
  ensureDir(paths.phaseOutputDir);
  ensureDir(paths.logsDir);
  ensureDir(paths.reportsDir);
  ensureDir(paths.agentStatusDir);
  return paths;
}

function phaseFromArg(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'due-diligence' || normalized === 'dd' || normalized === 'due_diligence') return 'dueDiligence';
  if (normalized === 'underwriting' || normalized === 'uw') return 'underwriting';
  if (normalized === 'financing' || normalized === 'fin') return 'financing';
  if (normalized === 'legal') return 'legal';
  if (normalized === 'closing') return 'closing';
  return null;
}

function readRuntimeConfig(baseDir) {
  return readJson(path.join(baseDir, 'config', 'runtime.json'));
}

function readScenarioConfig(baseDir, scenarioName) {
  return readJson(path.join(baseDir, 'config', 'scenarios', `${scenarioName}.json`));
}

function phaseOrder() {
  return PHASES.map((phase) => phase.key);
}

function phaseMetadata(phaseKey) {
  return PHASES.find((phase) => phase.key === phaseKey) || null;
}

function validatePhaseData(baseDir, phaseKey, data) {
  const rel = SCHEMA_BY_PHASE[phaseKey];
  if (!rel) return;
  const schemaPath = path.join(baseDir, rel);
  assertValid(schemaPath, data, phaseKey);
}

function validateMasterCheckpoint(baseDir, checkpoint) {
  const schemaPath = path.join(baseDir, 'schemas/checkpoint/master-checkpoint.schema.json');
  assertValid(schemaPath, checkpoint, 'masterCheckpoint');
}

function validateAgentCheckpoint(baseDir, agentCheckpoint) {
  const schemaPath = path.join(baseDir, 'schemas/checkpoint/agent-checkpoint.schema.json');
  assertValid(schemaPath, agentCheckpoint, 'agentCheckpoint');
}

function validatePhaseCompletionEvent(baseDir, event) {
  const schemaPath = path.join(baseDir, 'schemas/events/phase-completion.schema.json');
  assertValid(schemaPath, event, 'phaseEvent');
}

module.exports = {
  PHASES,
  SCHEMA_BY_PHASE,
  createRng,
  hashSeed,
  randBetween,
  round,
  ensureDir,
  nowIso,
  readJsonIfExists,
  writeJson,
  appendLog,
  safeNumber,
  safeString,
  buildFlag,
  buildDataGap,
  buildChecklistItem,
  formatPhaseName,
  phaseKeyToDashboard,
  createInitialCheckpoint,
  summarizeProgress,
  scenarioAdjustments,
  checkpointPaths,
  ensureRuntimePaths,
  phaseFromArg,
  readRuntimeConfig,
  readScenarioConfig,
  phaseOrder,
  phaseMetadata,
  validatePhaseData,
  validateMasterCheckpoint,
  validateAgentCheckpoint,
  validatePhaseCompletionEvent
};
