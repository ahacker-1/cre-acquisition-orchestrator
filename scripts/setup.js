#!/usr/bin/env node
const path = require('path');
const { getCodexStatus, runSync, runSyncInherited } = require('./lib/codex-cli');

const BASE_DIR = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    checkOnly: args.includes('--check'),
    skipInstall: args.includes('--skip-install'),
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

function ensureDashboardDependencies(options) {
  if (options.skipInstall || options.checkOnly) {
    console.log('[setup] Skipping dependency install.');
    return;
  }
  runRequired('npm', ['--prefix', 'dashboard', 'install'], 'Installing dashboard dependencies');
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
  ensureDashboardDependencies(options);
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
