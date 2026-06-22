#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const process = require('process');
const packageManifest = require('../package.json');

const UI_URL = 'http://localhost:5173/';
const API_HEALTH_URL = 'http://127.0.0.1:8081/api/health';
const DEFAULT_TIMEOUT_MS = 90_000;
const PROBE_TIMEOUT_MS = 2500;

function usage() {
  return [
    'Usage: npm run proof -- [options]',
    '',
    'Options:',
    '  --no-open              Do not open the browser after readiness.',
    '  --skip-demo            Reuse existing deterministic artifacts.',
    '  --smoke                Start, verify readiness, then stop the dashboard.',
    '  --timeout-ms <ms>      Readiness timeout. Default: 90000.',
    '  --help, -h             Show this help.'
  ].join('\n');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    help: false,
    noOpen: false,
    skipDemo: false,
    smoke: false,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--no-open') {
      options.noOpen = true;
      continue;
    }
    if (arg === '--skip-demo') {
      options.skipDemo = true;
      continue;
    }
    if (arg === '--smoke') {
      options.smoke = true;
      options.noOpen = true;
      continue;
    }
    if (arg === '--timeout-ms') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`--timeout-ms requires a positive numeric value\n\n${usage()}`);
      }
      options.timeoutMs = parseTimeout(value);
      index += 1;
      continue;
    }
    if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = parseTimeout(arg.slice('--timeout-ms='.length));
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
    }
    throw new Error(`Unexpected argument: ${arg}\n\n${usage()}`);
  }

  return options;
}

function parseTimeout(value) {
  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`--timeout-ms requires a positive numeric value\n\n${usage()}`);
  }
  return timeoutMs;
}

function runRequired(command, args, label) {
  console.log(`[proof] ${label}: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false
  });

  if (result.status !== 0) {
    const code = result.status == null ? 'unknown' : result.status;
    throw new Error(`${label} failed with exit code ${code}`);
  }
}

function npmRunArgs(scriptName) {
  return process.platform === 'win32'
    ? { command: 'cmd', args: ['/c', 'npm', 'run', scriptName] }
    : { command: 'npm', args: ['run', scriptName] };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOk(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function apiHealthReady() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(API_HEALTH_URL, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true &&
      body.service === 'cre-acquisition-dashboard-api' &&
      body.packageName === packageManifest.name &&
      body.version === packageManifest.version &&
      samePath(body.projectRoot, process.cwd());
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForEndpoints(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const { uiReady, apiReady } = await localReadiness();

    if (uiReady && apiReady) return true;
    await sleep(1000);
  }
  return false;
}

async function localReadiness() {
  const [uiReady, apiReady] = await Promise.all([
    fetchOk(UI_URL),
    apiHealthReady()
  ]);
  return { uiReady, apiReady };
}

function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);
  return process.platform === 'win32'
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function printReadyMessage(reusedExisting, smoke) {
  if (smoke) {
    console.log('[proof] Local dashboard/API reached readiness for the public proof path.');
    return;
  }

  console.log('');
  console.log('[proof] Ready.');
  if (reusedExisting) {
    console.log('[proof] Existing dashboard and API detected; reusing the running local app.');
  }
  console.log(`[proof] Open the dashboard: ${UI_URL}`);
  console.log('[proof] Click "Start Guided Demo" or "Parkview Demo", then follow docs/PROOF-PATH.md.');
  console.log('[proof] Proof stops: source upload, uploaded data inspector, extraction review, approved evidence, workpaper, IC package.');
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();
    return;
  }

  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(opener, [url], {
    detached: true,
    stdio: 'ignore'
  }).unref();
}

function stopProcessTree(child) {
  if (!child || child.killed) return;

  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true
    });
    return;
  }

  child.kill('SIGTERM');
}

function createChildMonitor(child) {
  let expectedStop = false;
  const exit = new Promise((resolve, reject) => {
    child.once('error', (error) => {
      if (expectedStop) {
        resolve({ expectedStop: true });
      } else {
        reject(error);
      }
    });
    child.once('exit', (code, signal) => {
      if (expectedStop) {
        resolve({ expectedStop: true, code, signal });
      } else if (code === 0) {
        reject(new Error('Dashboard exited before proof readiness completed.'));
      } else {
        reject(new Error(`Dashboard exited before proof readiness completed (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`));
      }
    });
  });

  return {
    exit,
    expectStop() {
      expectedStop = true;
    }
  };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }

  console.log('');
  console.log('CRE Acquisition Orchestrator public proof path');
  console.log('====================================================');
  console.log('[proof] This local path uses deterministic Parkview data and no external AI APIs.');
  console.log('[proof] Reviewer script: docs/PROOF-PATH.md');
  console.log('');

  if (!options.skipDemo) {
    runRequired('node', [
      'scripts/demo-run.js',
      '--deal',
      'config/deal.json',
      '--scenario',
      'core-plus',
      '--seed',
      '42'
    ], 'Regenerating deterministic Parkview artifacts');
  } else {
    console.log('[proof] Skipping demo artifact regeneration.');
  }

  const initialReadiness = await localReadiness();
  if (initialReadiness.uiReady && initialReadiness.apiReady) {
    printReadyMessage(true, options.smoke);
    if (!options.noOpen) {
      openBrowser(UI_URL);
    }
    if (options.smoke) {
      console.log('[proof] Smoke check passed.');
    }
    return;
  }

  if (initialReadiness.uiReady || initialReadiness.apiReady) {
    throw new Error(`Partial local app state detected before startup. UI ready=${initialReadiness.uiReady}; API ready=${initialReadiness.apiReady}. Stop stale listeners on ports 5173/8081 or run npm run dashboard manually.`);
  }

  console.log('[proof] Starting the dashboard. Press Ctrl+C to stop it.');
  const dashboardCommand = npmRunArgs('dashboard');
  const dashboard = spawn(dashboardCommand.command, dashboardCommand.args, {
    cwd: process.cwd(),
    env: { ...process.env, CRE_PROOF_NO_OPEN: '1' },
    stdio: 'inherit',
    shell: false
  });
  const monitor = createChildMonitor(dashboard);

  const cleanup = () => {
    monitor.expectStop();
    stopProcessTree(dashboard);
  };
  process.once('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
  process.once('exit', cleanup);

  const ready = await Promise.race([
    waitForEndpoints(options.timeoutMs),
    monitor.exit.then(() => false)
  ]);
  if (ready !== true) {
    cleanup();
    throw new Error(`Timed out waiting for ${UI_URL} and ${API_HEALTH_URL}`);
  }

  printReadyMessage(false, options.smoke);

  if (!options.noOpen) {
    openBrowser(UI_URL);
  }

  if (options.smoke) {
    cleanup();
    await monitor.exit.catch(() => undefined);
    console.log('[proof] Smoke check passed.');
    return;
  }

  await monitor.exit;
}

main().catch((error) => {
  console.error(`[proof] ${error.message}`);
  process.exit(1);
});
