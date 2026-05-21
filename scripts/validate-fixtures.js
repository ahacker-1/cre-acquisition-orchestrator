#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { validateFile, readJson } = require('./lib/schema-validator');

const BASE_DIR = path.resolve(__dirname, '..');
const EXAMPLES_DIR = path.join(BASE_DIR, 'data', 'examples');

function walkJsonFiles(dirPath, files = []) {
  if (!fs.existsSync(dirPath)) return files;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) walkJsonFiles(fullPath, files);
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(fullPath);
  }
  return files;
}

function schemaForFixture(filePath) {
  const rel = path.relative(EXAMPLES_DIR, filePath).replace(/\\/g, '/');
  if (rel.endsWith('/master-checkpoint.json')) {
    return {
      schemaPath: path.join(BASE_DIR, 'schemas', 'checkpoint', 'master-checkpoint.schema.json'),
      rootName: 'masterCheckpoint'
    };
  }
  if (rel.endsWith('/documents-manifest.json')) {
    return {
      schemaPath: path.join(BASE_DIR, 'schemas', 'documents', 'manifest.schema.json'),
      rootName: 'documentsManifest'
    };
  }
  if (/(^|\/)codex-run-sample\/manifest\.json$/.test(rel)) {
    return {
      schemaPath: path.join(BASE_DIR, 'schemas', 'codex', 'run-manifest.schema.json'),
      rootName: 'codexRunManifest'
    };
  }
  const phaseMatch = rel.match(/\/phase-outputs\/([a-z-]+)-output\.json$/);
  if (phaseMatch) {
    return {
      schemaPath: path.join(BASE_DIR, 'schemas', 'phases', `${phaseMatch[1]}-data.schema.json`),
      rootName: phaseMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    };
  }
  return null;
}

function main() {
  const jsonFiles = walkJsonFiles(EXAMPLES_DIR).sort();
  if (jsonFiles.length === 0) {
    throw new Error(`No JSON fixtures found under ${path.relative(BASE_DIR, EXAMPLES_DIR)}`);
  }

  const failures = [];
  let checked = 0;
  for (const filePath of jsonFiles) {
    const rel = path.relative(BASE_DIR, filePath).replace(/\\/g, '/');
    const schema = schemaForFixture(filePath);
    if (!schema) {
      failures.push(`${rel}: no declared schema mapping`);
      continue;
    }
    checked += 1;
    const result = validateFile(schema.schemaPath, readJson(filePath), schema.rootName);
    if (result.valid) {
      console.log(`PASS ${rel}`);
    } else {
      failures.push(`${rel}\n${result.errors.map((error) => `  - ${error}`).join('\n')}`);
    }
  }

  if (failures.length > 0) {
    console.error(`Fixture validation failed (${failures.length} failures):`);
    failures.forEach((failure) => console.error(failure));
    process.exit(1);
  }

  console.log(`Fixture validation complete (${checked}/${jsonFiles.length} JSON fixtures).`);
}

try {
  main();
} catch (error) {
  console.error(`[validate-fixtures] ${error.message}`);
  process.exit(1);
}
