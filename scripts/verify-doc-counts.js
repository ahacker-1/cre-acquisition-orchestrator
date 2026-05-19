#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(BASE_DIR, relPath), 'utf8'));
}

function walkFiles(relDir, predicate, files = []) {
  const dirPath = path.join(BASE_DIR, relDir);
  if (!fs.existsSync(dirPath)) return files;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(BASE_DIR, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) walkFiles(relPath, predicate, files);
    else if (entry.isFile() && predicate(relPath)) files.push(relPath);
  }
  return files;
}

function parseByTheNumbers(readme) {
  const lines = readme.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.includes('| AI Roles | Skills | Schemas | Workflows | Fixtures | Tests passing |'));
  if (headerIndex === -1 || !lines[headerIndex + 2]) {
    throw new Error('README By the Numbers table is missing or malformed.');
  }
  const headers = lines[headerIndex].split('|').map((cell) => cell.trim()).filter(Boolean);
  const values = lines[headerIndex + 2].split('|').map((cell) => cell.trim()).filter(Boolean);
  if (headers.length !== values.length) {
    throw new Error('README By the Numbers table header/value count mismatch.');
  }
  return Object.fromEntries(headers.map((header, index) => [header, Number(values[index])]));
}

function countTestScripts() {
  const scripts = readJson('package.json').scripts || {};
  return Object.keys(scripts).filter((name) => name === 'test' || name.startsWith('test:')).length;
}

function main() {
  const readme = fs.readFileSync(path.join(BASE_DIR, 'README.md'), 'utf8');
  const claims = parseByTheNumbers(readme);
  const workflows = readJson('config/workflows.json').workflows || [];

  const actual = {
    'AI Roles':
      walkFiles('agents', (relPath) => relPath.endsWith('.md')).length +
      walkFiles('orchestrators', (relPath) => relPath.endsWith('.md')).length,
    Skills: walkFiles('skills', (relPath) => relPath.endsWith('.md')).length,
    Schemas: walkFiles('schemas', (relPath) => relPath.endsWith('.schema.json')).length,
    Workflows: workflows.length,
    Fixtures: walkFiles('fixtures', () => true).length,
    'Tests passing': countTestScripts()
  };

  const failures = [];
  for (const [label, actualCount] of Object.entries(actual)) {
    if (claims[label] !== actualCount) {
      failures.push(`${label}: README claims ${claims[label]}, actual ${actualCount}`);
    } else {
      console.log(`PASS ${label}: ${actualCount}`);
    }
  }

  if (failures.length > 0) {
    console.error('README count drift detected:');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log('README count verification complete.');
}

try {
  main();
} catch (error) {
  console.error(`[verify-doc-counts] ${error.message}`);
  process.exit(1);
}
