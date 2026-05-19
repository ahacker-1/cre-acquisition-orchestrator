#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');
const TARGET_DIRS = [
  path.join(BASE_DIR, 'data', 'examples'),
  path.join(BASE_DIR, 'schemas')
];
const LEGACY_TOKENS = ['"complete"', '"COMPLETED"', '"GO"', '"NO_GO"'];

function walkFiles(dirPath, files = []) {
  if (!fs.existsSync(dirPath)) return files;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, files);
    else if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.ndjson'))) {
      files.push(fullPath);
    }
  }
  return files;
}

function main() {
  const failures = [];
  for (const filePath of TARGET_DIRS.flatMap((dir) => walkFiles(dir))) {
    const rel = path.relative(BASE_DIR, filePath).replace(/\\/g, '/');
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      LEGACY_TOKENS.forEach((token) => {
        if (line.includes(token)) failures.push(`${rel}:${index + 1}: legacy enum token ${token}`);
      });
    });
  }

  if (failures.length > 0) {
    console.error('[check-legacy-enums] FAIL');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log('[check-legacy-enums] PASS');
}

main();
