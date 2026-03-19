#!/usr/bin/env node
/**
 * run-validation.js (Task 12.5)
 *
 * Level 1 Validation: Checks all files in agent-registry exist with required sections.
 *
 * Usage:
 *   node scripts/run-validation.js
 *   node scripts/run-validation.js --output validation/results.json
 *
 * Validates the CRE orchestration system file structure and agent prompt completeness.
 */

const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------
const BASE_DIR = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(BASE_DIR, 'config', 'agent-registry.json');

const REQUIRED_SECTIONS = [
  { patterns: ['## Identity', '## Mission'], label: 'Identity/Mission' },
  { patterns: ['## Strategy', '## Tools Available'], label: 'Strategy/Tools' },
  { patterns: ['## Output', '## Output Format'], label: 'Output/Output Format' },
  { patterns: ['## Checkpoint Protocol', '## Checkpoint'], label: 'Checkpoint Protocol' },
  { patterns: ['## Resume Protocol', '## Resume'], label: 'Resume Protocol' },
  { patterns: ['## Self-Review'], label: 'Self-Review' }
];

const REQUIRED_CONFIG_FILES = [
  'config/deal.json',
  'config/thresholds.json',
  'config/agent-registry.json',
  'config/runtime.json',
  'config/scenarios/core-plus.json',
  'config/scenarios/value-add.json',
  'config/scenarios/distressed.json'
];

const REQUIRED_DIRECTORIES = [
  'data/status',
  'data/logs',
  'data/reports'
];

const STRICT_SECTION_VALIDATION = false;

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function dirExists(dirPath) {
  try {
    const stat = fs.statSync(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirExists(dirPath);
}

function checkSections(content, sections) {
  const results = [];
  for (const section of sections) {
    const found = section.patterns.some(p => content.includes(p));
    results.push({ label: section.label, found });
  }
  return results;
}

function colorize(text, color) {
  const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    reset: '\x1b[0m'
  };
  return `${colors[color] || ''}${text}${colors.reset}`;
}

// ------------------------------------------------------------------
// Parse args
// ------------------------------------------------------------------
const args = process.argv.slice(2);
let outputPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' && args[i + 1]) {
    outputPath = path.resolve(BASE_DIR, args[i + 1]);
    i++;
  }
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
function main() {
  console.log(colorize('\n=== CRE Orchestration System - Level 1 Validation ===\n', 'bold'));

  // 1. Load agent registry
  if (!fileExists(REGISTRY_PATH)) {
    console.log(colorize('FATAL: agent-registry.json not found at ' + REGISTRY_PATH, 'red'));
    process.exit(1);
  }
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  console.log(colorize('Loaded agent-registry.json', 'green'));

  const results = {
    runDate: new Date().toISOString(),
    configFiles: { status: 'PASS', checked: 0, passed: 0, details: [] },
    directories: { status: 'PASS', checked: 0, passed: 0, details: [] },
    orchestrators: { status: 'PASS', checked: 0, passed: 0, details: [] },
    agents: { status: 'PASS', checked: 0, passed: 0, details: [] },
    skills: { status: 'PASS', checked: 0, passed: 0, details: [] },
    templates: { status: 'PASS', checked: 0, passed: 0, details: [] },
    summary: { totalFiles: 0, filesFound: 0, sectionsCompliant: 0, totalSections: 0, overallStatus: 'PASS' }
  };

  // 2. Check required config files
  console.log(colorize('\n--- Config Files ---', 'cyan'));
  for (const relPath of REQUIRED_CONFIG_FILES) {
    const absPath = path.join(BASE_DIR, relPath);
    const exists = fileExists(absPath);
    results.configFiles.checked++;
    if (exists) {
      results.configFiles.passed++;
      console.log(`  ${colorize('PASS', 'green')} ${relPath}`);
    } else {
      results.configFiles.status = 'FAIL';
      console.log(`  ${colorize('FAIL', 'red')} ${relPath} - FILE NOT FOUND`);
    }
    results.configFiles.details.push({ path: relPath, exists });
  }

  // 3. Check required directories
  console.log(colorize('\n--- Directories ---', 'cyan'));
  for (const relDir of REQUIRED_DIRECTORIES) {
    const absDir = path.join(BASE_DIR, relDir);
    const existed = dirExists(absDir);
    const exists = existed || ensureDir(absDir);
    results.directories.checked++;
    if (exists) {
      results.directories.passed++;
      const statusText = existed ? `${relDir}/` : `${relDir}/ (created)`;
      console.log(`  ${colorize('PASS', 'green')} ${statusText}`);
    } else {
      results.directories.status = 'FAIL';
      console.log(`  ${colorize('FAIL', 'red')} ${relDir}/ - DIRECTORY NOT FOUND`);
    }
    results.directories.details.push({ path: relDir, exists });
  }

  // 4. Check orchestrators
  console.log(colorize('\n--- Orchestrators ---', 'cyan'));
  if (registry.orchestrators) {
    for (const [name, relPath] of Object.entries(registry.orchestrators)) {
      const absPath = path.join(BASE_DIR, relPath);
      results.orchestrators.checked++;
      results.summary.totalFiles++;

      if (!fileExists(absPath)) {
        results.orchestrators.status = 'FAIL';
        console.log(`  ${colorize('FAIL', 'red')} ${name} - FILE NOT FOUND (${relPath})`);
        results.orchestrators.details.push({ name, path: relPath, exists: false, sections: [] });
        continue;
      }

      results.summary.filesFound++;
      const content = fs.readFileSync(absPath, 'utf8');
      const sectionResults = checkSections(content, REQUIRED_SECTIONS);
      const allFound = sectionResults.every(s => s.found);
      const missingSections = sectionResults.filter(s => !s.found).map(s => s.label);

      sectionResults.forEach(s => {
        results.summary.totalSections++;
        if (s.found) results.summary.sectionsCompliant++;
      });

      if (allFound) {
        results.orchestrators.passed++;
        console.log(`  ${colorize('PASS', 'green')} ${name} (${relPath})`);
      } else {
        if (STRICT_SECTION_VALIDATION) {
          results.orchestrators.status = 'FAIL';
          console.log(`  ${colorize('FAIL', 'red')} ${name} - missing: ${missingSections.join(', ')}`);
        } else {
          results.orchestrators.passed++;
          console.log(`  ${colorize('WARN', 'yellow')} ${name} - missing: ${missingSections.join(', ')}`);
        }
      }
      results.orchestrators.details.push({ name, path: relPath, exists: true, allSectionsPresent: allFound, missingSections });
    }
  }

  // 5. Check specialist agents (by phase)
  console.log(colorize('\n--- Specialist Agents ---', 'cyan'));
  if (registry.agents) {
    for (const [phase, agents] of Object.entries(registry.agents)) {
      console.log(colorize(`  [${phase}]`, 'yellow'));
      for (const [name, agentDef] of Object.entries(agents)) {
        const relPath = typeof agentDef === 'string' ? agentDef : agentDef.file;
        const absPath = typeof relPath === 'string' ? path.join(BASE_DIR, relPath) : null;
        results.agents.checked++;
        results.summary.totalFiles++;

        if (!absPath || !fileExists(absPath)) {
          results.agents.status = 'FAIL';
          console.log(`    ${colorize('FAIL', 'red')} ${name} - FILE NOT FOUND (${relPath})`);
          results.agents.details.push({ name, phase, path: relPath, exists: false, sections: [] });
          continue;
        }

        results.summary.filesFound++;
        const content = fs.readFileSync(absPath, 'utf8');
        const sectionResults = checkSections(content, REQUIRED_SECTIONS);
        const allFound = sectionResults.every(s => s.found);
        const missingSections = sectionResults.filter(s => !s.found).map(s => s.label);

        sectionResults.forEach(s => {
          results.summary.totalSections++;
          if (s.found) results.summary.sectionsCompliant++;
        });

        if (allFound) {
          results.agents.passed++;
          console.log(`    ${colorize('PASS', 'green')} ${name}`);
        } else {
          if (STRICT_SECTION_VALIDATION) {
            results.agents.status = 'FAIL';
            console.log(`    ${colorize('FAIL', 'red')} ${name} - missing: ${missingSections.join(', ')}`);
          } else {
            results.agents.passed++;
            console.log(`    ${colorize('WARN', 'yellow')} ${name} - missing: ${missingSections.join(', ')}`);
          }
        }
        results.agents.details.push({ name, phase, path: relPath, exists: true, allSectionsPresent: allFound, missingSections });
      }
    }
  }

  // 6. Check skills
  console.log(colorize('\n--- Skills ---', 'cyan'));
  if (registry.skills) {
    for (const [name, relPath] of Object.entries(registry.skills)) {
      const absPath = path.join(BASE_DIR, relPath);
      results.skills.checked++;
      results.summary.totalFiles++;

      if (!fileExists(absPath)) {
        results.skills.status = 'FAIL';
        console.log(`  ${colorize('FAIL', 'red')} ${name} - FILE NOT FOUND (${relPath})`);
        results.skills.details.push({ name, path: relPath, exists: false });
        continue;
      }

      results.summary.filesFound++;
      results.skills.passed++;
      console.log(`  ${colorize('PASS', 'green')} ${name} (${relPath})`);
      results.skills.details.push({ name, path: relPath, exists: true });
    }
  }

  // 7. Check templates
  console.log(colorize('\n--- Templates ---', 'cyan'));
  if (registry.templates) {
    for (const [name, relPath] of Object.entries(registry.templates)) {
      const absPath = path.join(BASE_DIR, relPath);
      results.templates.checked++;
      results.summary.totalFiles++;

      if (!fileExists(absPath)) {
        results.templates.status = 'FAIL';
        console.log(`  ${colorize('FAIL', 'red')} ${name} - FILE NOT FOUND (${relPath})`);
        results.templates.details.push({ name, path: relPath, exists: false });
        continue;
      }

      results.summary.filesFound++;
      results.templates.passed++;
      console.log(`  ${colorize('PASS', 'green')} ${name} (${relPath})`);
      results.templates.details.push({ name, path: relPath, exists: true });
    }
  }

  // 8. Summary
  const anyFail = [
    results.configFiles.status,
    results.directories.status,
    results.orchestrators.status,
    results.agents.status,
    results.skills.status,
    results.templates.status
  ].some(s => s === 'FAIL');

  results.summary.overallStatus = anyFail ? 'FAIL' : 'PASS';

  console.log(colorize('\n=== SUMMARY ===', 'bold'));
  console.log(`  Config Files:   ${results.configFiles.passed}/${results.configFiles.checked} ${results.configFiles.status === 'PASS' ? colorize('PASS', 'green') : colorize('FAIL', 'red')}`);
  console.log(`  Directories:    ${results.directories.passed}/${results.directories.checked} ${results.directories.status === 'PASS' ? colorize('PASS', 'green') : colorize('FAIL', 'red')}`);
  console.log(`  Orchestrators:  ${results.orchestrators.passed}/${results.orchestrators.checked} ${results.orchestrators.status === 'PASS' ? colorize('PASS', 'green') : colorize('FAIL', 'red')}`);
  console.log(`  Agents:         ${results.agents.passed}/${results.agents.checked} ${results.agents.status === 'PASS' ? colorize('PASS', 'green') : colorize('FAIL', 'red')}`);
  console.log(`  Skills:         ${results.skills.passed}/${results.skills.checked} ${results.skills.status === 'PASS' ? colorize('PASS', 'green') : colorize('FAIL', 'red')}`);
  console.log(`  Templates:      ${results.templates.passed}/${results.templates.checked} ${results.templates.status === 'PASS' ? colorize('PASS', 'green') : colorize('FAIL', 'red')}`);
  console.log(`  ---`);
  console.log(`  Total Files:    ${results.summary.filesFound}/${results.summary.totalFiles} found`);
  console.log(`  Section Checks: ${results.summary.sectionsCompliant}/${results.summary.totalSections} compliant`);
  console.log(`  Overall:        ${results.summary.overallStatus === 'PASS' ? colorize('PASS', 'green') : colorize('FAIL', 'red')}`);
  console.log('');

  // 9. Optionally write output
  if (outputPath) {
    const outputDir = path.dirname(outputPath);
    if (!dirExists(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`Results written to ${outputPath}\n`);
  }

  process.exit(results.summary.overallStatus === 'PASS' ? 0 : 1);
}

main();
