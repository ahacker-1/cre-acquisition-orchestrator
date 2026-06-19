#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getCodexStatus, runSync, runSyncInherited } = require('./lib/codex-cli');

const BASE_DIR = path.resolve(__dirname, '..');
const VENV_DIR = path.join(BASE_DIR, '.venv');
const REQUIREMENTS_FILE = path.join('scripts', 'requirements.txt');
const PYTHON_IMPORT_CHECK = 'import pandas, openpyxl, pdfplumber, fitz';
const PYTHON_DEPENDENCY_LABEL = 'pandas, openpyxl, pdfplumber, PyMuPDF';

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    checkOnly: args.includes('--check'),
    skipInstall: args.includes('--skip-install'),
    skipPythonInstall: args.includes('--skip-python-install'),
    skipCodexInstall: args.includes('--skip-codex-install'),
    skipLogin: args.includes('--skip-login'),
    requireCodex: args.includes('--require-codex'),
    withDemo: args.includes('--with-demo')
  };
}

function fail(message) {
  console.error(`[setup] ${message}`);
  process.exit(1);
}

function commandText(command, args) {
  return [command, ...args].join(' ');
}

function runRequired(command, args, label) {
  console.log(`[setup] ${label}: ${commandText(command, args)}`);
  const result = runSyncInherited(command, args, { cwd: BASE_DIR });
  if (result.status !== 0) {
    fail(`${label} failed with exit code ${result.status}`);
  }
}

function runPython(candidate, args, options = {}) {
  return spawnSync(candidate.command, [...candidate.args, ...args], {
    cwd: BASE_DIR,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  });
}

function runPythonRequired(candidate, args, label) {
  console.log(`[setup] ${label}: ${commandText(candidate.command, [...candidate.args, ...args])}`);
  const result = runPython(candidate, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    fail(`${label} failed with exit code ${result.status}`);
  }
}

function parseNodeMajor(versionText) {
  const match = String(versionText || '').match(/v?(\d+)/);
  return match ? Number(match[1]) : 0;
}

function verifyNodeAndNpm() {
  const nodeResult = runSync('node', ['--version'], { cwd: BASE_DIR });
  if (nodeResult.status !== 0) fail('Node.js is required. Install Node.js 18 or newer.');
  const nodeVersion = `${nodeResult.stdout || nodeResult.stderr}`.trim();
  const major = parseNodeMajor(nodeVersion);
  if (major < 18) fail(`Node.js 18+ is required. Found ${nodeVersion}.`);
  console.log(`[setup] Node.js OK: ${nodeVersion}`);

  const npmResult = runSync('npm', ['--version'], { cwd: BASE_DIR });
  if (npmResult.status !== 0) fail('npm is required and was not found on PATH.');
  console.log(`[setup] npm OK: ${`${npmResult.stdout || npmResult.stderr}`.trim()}`);
}

function ensureRootDependencies(options) {
  if (options.skipInstall || options.checkOnly) {
    console.log('[setup] Skipping root dependency install.');
    return;
  }
  runRequired('npm', ['install'], 'Installing root dependencies');
}

function ensureDashboardDependencies(options) {
  if (options.skipInstall || options.checkOnly) {
    console.log('[setup] Skipping dashboard dependency install.');
    return;
  }
  runRequired('npm', ['--prefix', 'dashboard', 'install'], 'Installing dashboard dependencies');
}

function venvPythonPath() {
  return process.platform === 'win32'
    ? path.join(VENV_DIR, 'Scripts', 'python.exe')
    : path.join(VENV_DIR, 'bin', 'python');
}

function pythonCommandCandidates(options = {}) {
  const includeVenv = options.includeVenv !== false;
  const candidates = [];
  if (includeVenv) {
    candidates.push({ command: venvPythonPath(), args: [], label: 'repo .venv' });
  }
  if (process.platform === 'win32') {
    candidates.push(
      { command: 'py', args: ['-3'], label: 'py -3' },
      { command: 'python', args: [], label: 'python' },
      { command: 'python3', args: [], label: 'python3' },
    );
  } else {
    candidates.push(
      { command: 'python3', args: [], label: 'python3' },
      { command: 'python', args: [], label: 'python' },
    );
  }
  return candidates;
}

function findPython(options = {}) {
  for (const candidate of pythonCommandCandidates(options)) {
    const result = runPython(candidate, ['--version']);
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}

function parserDepsAvailable(candidate) {
  const result = runPython(candidate, ['-c', PYTHON_IMPORT_CHECK]);
  return !result.error && result.status === 0;
}

function ensurePythonParserDependencies(options) {
  if (options.skipPythonInstall) {
    console.log('[setup] Skipping Python parser dependency install.');
    return false;
  }

  const venvPython = { command: venvPythonPath(), args: [], label: 'repo .venv' };
  if (options.checkOnly) {
    if (!fs.existsSync(venvPython.command)) {
      console.warn('[setup] Python parser .venv is missing. Run npm run setup to create it.');
      return false;
    }
    if (parserDepsAvailable(venvPython)) {
      console.log(`[setup] Python parser dependencies OK: ${PYTHON_DEPENDENCY_LABEL}`);
      return true;
    }
    console.warn('[setup] Python parser dependencies missing in .venv. Run npm run setup to install them.');
    return false;
  }

  const bootstrapPython = findPython({ includeVenv: false });
  if (!bootstrapPython) {
    fail('Python 3 is required for parser dependencies. Install Python 3, or rerun with --skip-python-install for dashboard-only setup.');
  }

  if (!fs.existsSync(venvPython.command)) {
    runPythonRequired(bootstrapPython, ['-m', 'venv', '.venv'], 'Creating Python parser virtual environment');
  }

  runPythonRequired(venvPython, ['-m', 'pip', 'install', '-r', REQUIREMENTS_FILE], 'Installing Python parser dependencies');
  if (!parserDepsAvailable(venvPython)) {
    fail(`Python parser dependency check failed after install. Expected ${PYTHON_DEPENDENCY_LABEL}.`);
  }
  console.log(`[setup] Python parser dependencies OK: ${PYTHON_DEPENDENCY_LABEL}`);
  return true;
}

function ensureCodex(options) {
  let status = getCodexStatus(BASE_DIR);
  if (!status.installed) {
    if (options.checkOnly) {
      const message = 'Codex CLI is missing. Install with: npm install -g @openai/codex';
      if (options.requireCodex) fail(message);
      console.warn(`[setup] Optional live Codex runtime unavailable: ${message}`);
      return false;
    }
    if (options.skipCodexInstall) {
      const message = 'Codex CLI is missing and --skip-codex-install was provided.';
      if (options.requireCodex) fail(message);
      console.warn(`[setup] Optional live Codex runtime unavailable: ${message}`);
      return false;
    }
    console.log('[setup] Installing optional Codex CLI for live ChatGPT-backed agents.');
    const installResult = runSyncInherited('npm', ['install', '-g', '@openai/codex'], { cwd: BASE_DIR });
    if (installResult.status !== 0) {
      const message = `Codex CLI install failed with exit code ${installResult.status}.`;
      if (options.requireCodex) fail(message);
      console.warn(`[setup] Optional live Codex runtime unavailable: ${message}`);
      console.warn('[setup] Offline demo and dashboard still work. Install later with: npm install -g @openai/codex');
      return false;
    }
    status = getCodexStatus(BASE_DIR);
  }

  if (!status.installed) {
    const message = 'Codex CLI install did not complete successfully.';
    if (options.requireCodex) fail(message);
    console.warn(`[setup] Optional live Codex runtime unavailable: ${message}`);
    return false;
  }
  console.log(`[setup] Codex CLI OK: ${status.version}`);

  if (!status.loggedIn) {
    if (options.checkOnly || options.skipLogin) {
      const message = 'Codex is not logged in. Run: codex login and choose ChatGPT.';
      if (options.requireCodex) fail(message);
      console.warn(`[setup] Optional live Codex runtime not ready: ${message}`);
      return false;
    }
    console.log('[setup] Starting Codex login. Choose "Sign in with ChatGPT" in the browser flow.');
    const loginResult = runSyncInherited('codex', ['login'], { cwd: BASE_DIR });
    if (loginResult.status !== 0) {
      const message = `Codex login exited with code ${loginResult.status}.`;
      if (options.requireCodex) fail(message);
      console.warn(`[setup] Optional live Codex runtime not ready: ${message}`);
      console.warn('[setup] Run codex login later, then npm run codex:status.');
      return false;
    }
    status = getCodexStatus(BASE_DIR);
  }

  if (!status.loggedIn) {
    const message = 'Codex login did not complete.';
    if (options.requireCodex) fail(message);
    console.warn(`[setup] Optional live Codex runtime not ready: ${message}`);
    return false;
  }
  console.log(`[setup] Codex auth OK: ${status.loginStatus}`);
  if (!status.usingChatGpt) {
    console.warn('[setup] Codex is logged in, but status did not explicitly say ChatGPT.');
    console.warn('[setup] Subscription-based usage should use codex login with ChatGPT.');
  }
  return true;
}

function runDemoIfRequested(options) {
  if (!options.withDemo || options.checkOnly) return;
  runRequired('node', ['scripts/demo-run.js', '--deal', 'config/deal.json', '--scenario', 'core-plus', '--seed', '42'], 'Running offline demo');
}

function main() {
  const options = parseArgs();
  verifyNodeAndNpm();
  ensureRootDependencies(options);
  ensureDashboardDependencies(options);
  ensurePythonParserDependencies(options);
  const codexReady = ensureCodex(options);
  runDemoIfRequested(options);

  console.log('');
  console.log('[setup] Ready.');
  console.log('[setup] Try the offline app: npm run dashboard');
  if (codexReady) {
    console.log('[setup] Try one live Codex-backed agent: npm run codex:smoke');
    console.log('[setup] Try a multi-agent Codex workflow: npm run codex:run');
  } else {
    console.log('[setup] To enable live Codex agents later: codex login, then npm run codex:status');
  }
}

main();
