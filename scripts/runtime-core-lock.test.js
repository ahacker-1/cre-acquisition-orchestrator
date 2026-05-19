#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');
const TARGET_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cre-runtime-lock-'));
const TARGET_FILE = path.join(TARGET_DIR, 'checkpoint.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function listFiles(dirPath, files = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) listFiles(fullPath, files);
    else files.push(fullPath);
  }
  return files;
}

function runWorker(name) {
  const runtimeCorePath = path.join(BASE_DIR, 'scripts', 'lib', 'runtime-core.js');
  const worker = `
const { writeJson } = require(${JSON.stringify(runtimeCorePath)});
const filePath = process.argv[1];
const writer = process.argv[2];
for (let index = 0; index < 75; index += 1) {
  writeJson(filePath, {
    writer,
    index,
    payload: Array.from({ length: 20 }, (_, item) => \`\${writer}-\${index}-\${item}\`)
  });
}
`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', worker, TARGET_FILE, name], {
      cwd: BASE_DIR,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`worker ${name} exited ${code}: ${stderr}`));
    });
  });
}

async function main() {
  await Promise.all(['alpha', 'bravo', 'charlie', 'delta'].map(runWorker));

  const checkpoint = JSON.parse(fs.readFileSync(TARGET_FILE, 'utf8'));
  assert(typeof checkpoint.writer === 'string', 'final checkpoint missing writer');
  assert(Number.isInteger(checkpoint.index), 'final checkpoint missing numeric index');
  assert(Array.isArray(checkpoint.payload) && checkpoint.payload.length === 20, 'final checkpoint payload corrupt');

  const leftovers = listFiles(TARGET_DIR).filter((filePath) => filePath.endsWith('.tmp') || filePath.endsWith('.lock'));
  assert(leftovers.length === 0, `temporary lock artifacts remained: ${leftovers.join(', ')}`);

  fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  console.log('[runtime-core-lock] PASS concurrent checkpoint writes remain atomic');
}

main().catch((error) => {
  try {
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only.
  }
  console.error(`[runtime-core-lock] FAIL: ${error.message}`);
  process.exit(1);
});
