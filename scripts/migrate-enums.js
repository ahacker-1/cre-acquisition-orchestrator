#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(BASE_DIR, 'data');

const VALUE_MAP = new Map([
  ['pending', 'PENDING'],
  ['running', 'RUNNING'],
  ['complete', 'COMPLETE'],
  ['completed', 'COMPLETE'],
  ['COMPLETED', 'COMPLETE'],
  ['failed', 'FAILED'],
  ['skipped', 'SKIPPED'],
  ['GO', 'PROCEED_WITH_MITIGATIONS'],
  ['NO_GO', 'FAIL']
]);

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

function migrateValue(value) {
  if (typeof value === 'string') return VALUE_MAP.get(value) || value;
  if (Array.isArray(value)) return value.map(migrateValue);
  if (!value || typeof value !== 'object') return value;

  const migrated = {};
  for (const [key, child] of Object.entries(value)) {
    const nextKey = key === 'complete' ? 'completedCount' : key;
    migrated[nextKey] = migrateValue(child);
  }
  return migrated;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function migrateJson(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(original);
  const migrated = migrateValue(parsed);
  const next = `${JSON.stringify(migrated, null, 2)}\n`;
  if (next !== original) {
    fs.writeFileSync(filePath, next);
    return true;
  }
  return false;
}

function migrateNdjson(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const lines = original.split(/\r?\n/);
  const migratedLines = lines.map((line, index) => {
    if (line.trim().length === 0) return line;
    try {
      return JSON.stringify(migrateValue(JSON.parse(line)));
    } catch (error) {
      throw new Error(`${filePath}:${index + 1} invalid NDJSON: ${error.message}`);
    }
  });
  const next = migratedLines.join('\n');
  if (next !== original) {
    fs.writeFileSync(filePath, next);
    return true;
  }
  return false;
}

function main() {
  let changed = 0;
  for (const filePath of walkFiles(DATA_DIR)) {
    if (filePath.endsWith('.ndjson')) {
      if (migrateNdjson(filePath)) changed += 1;
    } else if (migrateJson(filePath)) {
      changed += 1;
    }
  }
  console.log(`[migrate-enums] Updated ${changed} data files.`);
}

if (require.main === module) main();

module.exports = {
  migrateValue
};
