#!/usr/bin/env node
/**
 * release-check.js -- release-readiness gate runner.
 *
 * Composes the project's existing fast, read-only validation scripts into a
 * single PASS/FAIL checklist so a contributor (or CI step) can answer one
 * question before tagging a release: "is the checked-in catalog internally
 * consistent and is the version metadata ready to tag?"
 *
 * Design constraints (intentional):
 *   - SAFE:  read-only / validation only. This script never builds the
 *            dashboard, runs Playwright e2e, runs demo:verify, or writes any
 *            project files. It only reads files and shells out to the existing
 *            validators (which are themselves read-only).
 *   - FAST:  no network, no install, no spawning the simulation/Codex runtime.
 *   - HONEST: a real gap is reported as FAIL (non-zero exit). It is never
 *            masked. Gates that cannot be evaluated (e.g. no git available)
 *            are reported as WARN and do not fail the run on their own.
 *
 * Exit code: 0 when every hard gate passes; 1 when any hard gate fails.
 *
 * Gates:
 *   1. validate:docs      -> scripts/verify-doc-counts.js  (README "By the Numbers" drift)
 *   2. validate:fixtures  -> scripts/validate-fixtures.js  (example fixtures vs schemas)
 *   3. validate:guides    -> scripts/validate-operator-guides.js (operator guide config)
 *   4. check-legacy-enums -> scripts/check-legacy-enums.js (no legacy enum tokens)
 *   5. version-readiness  -> package.json version vs latest git tag + CHANGELOG entry
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const SYMBOL = { PASS: 'PASS', FAIL: 'FAIL', WARN: 'WARN' };

function line(status, label, detail) {
  const tag = SYMBOL[status] || status;
  const suffix = detail ? `  ${detail}` : '';
  console.log(`  [${tag}] ${label}${suffix}`);
}

// ---------------------------------------------------------------------------
// Sub-check runner: invoke an existing validator script in-process-safe mode
// ---------------------------------------------------------------------------

/**
 * Run a node validator script and capture its result. Read-only by contract.
 * Returns { ok, output } where ok reflects exit code 0.
 */
function runValidator(relScript, args = []) {
  const scriptPath = path.join(BASE_DIR, relScript);
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, output: `missing script: ${relScript}`, missing: true };
  }
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: BASE_DIR,
    encoding: 'utf8',
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const output = `${stdout}${stderr}`.trim();
  return { ok: result.status === 0, output, status: result.status };
}

/**
 * Pull the first informative line out of a validator's output so the
 * checklist stays scannable. Prefers FAIL/error lines when present.
 */
function summarize(output, ok) {
  if (!output) return '';
  const lines = output.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!ok) {
    // Prefer a concrete itemized failure (e.g. "- Fixtures: README claims 18,
    // actual 20") over a generic header like "README count drift detected:".
    const itemized = lines.find((l) => /^\s*-\s+\S/.test(l) && /\d|fail|invalid|missing/i.test(l));
    if (itemized) return itemized.replace(/^\s*-\s+/, '').trim();
    const failLine = lines.find((l) => /fail|drift|error|missing|invalid/i.test(l));
    if (failLine) return failLine.trim();
  }
  return lines[lines.length - 1].trim();
}

// ---------------------------------------------------------------------------
// Git helpers (best-effort; absence is a WARN, not a hard FAIL)
// ---------------------------------------------------------------------------

function git(args) {
  const result = spawnSync('git', args, { cwd: BASE_DIR, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || '').trim();
}

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(BASE_DIR, relPath), 'utf8'));
}

/**
 * Version-readiness gate.
 *
 * Confirms the package version has a matching CHANGELOG entry (the release
 * notes exist) and reports the relationship to the latest git tag.
 *
 * Hard FAIL conditions:
 *   - package.json has no version
 *   - CHANGELOG.md has no entry for the current version
 * Soft conditions (reported, do not fail the gate on their own):
 *   - git is unavailable / not a repo (WARN)
 *   - the current version is already tagged (INFO -- nothing to release)
 *   - the current version is ahead of the latest tag (INFO -- ready to tag)
 */
function checkVersionReadiness() {
  const detail = [];
  let hardFail = false;

  let version = null;
  try {
    version = readJson('package.json').version || null;
  } catch (err) {
    return { ok: false, detail: `package.json unreadable: ${err.message}` };
  }
  if (!version) {
    return { ok: false, detail: 'package.json has no "version" field.' };
  }

  // CHANGELOG entry for this version must exist.
  const changelogPath = path.join(BASE_DIR, 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    hardFail = true;
    detail.push('CHANGELOG.md is missing');
  } else {
    const changelog = fs.readFileSync(changelogPath, 'utf8');
    // Match a heading like "## [2.6.0]" or "## 2.6.0" (escape regex chars).
    const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entryRe = new RegExp(`^##\\s*\\[?${escaped}\\]?`, 'm');
    if (!entryRe.test(changelog)) {
      hardFail = true;
      detail.push(`no CHANGELOG entry for v${version}`);
    } else {
      detail.push(`CHANGELOG has v${version}`);
    }
  }

  // Compare against the latest semver tag (informational).
  const latestTag = git(['describe', '--tags', '--abbrev=0']);
  if (latestTag === null) {
    detail.push('git tag unavailable (WARN)');
  } else {
    const tagVersion = latestTag.replace(/^v/, '');
    if (tagVersion === version) {
      detail.push(`already tagged as ${latestTag}`);
    } else {
      detail.push(`package v${version} ahead of latest tag ${latestTag} (ready to tag)`);
    }
  }

  return {
    ok: !hardFail,
    detail: detail.join('; '),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('Release readiness check');
  console.log('=======================');
  console.log('(read-only: composes existing validators; no build / e2e / writes)');
  console.log('');

  const failures = [];
  const warnings = [];

  // --- Catalog/contract gates (existing validators) ---
  const validatorGates = [
    { label: 'validate:docs   (README By the Numbers drift)', script: 'scripts/verify-doc-counts.js' },
    { label: 'validate:fixtures (example fixtures vs schemas)', script: 'scripts/validate-fixtures.js' },
    { label: 'validate:guides  (operator guide config)', script: 'scripts/validate-operator-guides.js' },
    { label: 'check-legacy-enums (no legacy enum tokens)', script: 'scripts/check-legacy-enums.js' },
  ];

  for (const gate of validatorGates) {
    const result = runValidator(gate.script);
    const summary = summarize(result.output, result.ok);
    if (result.ok) {
      line('PASS', gate.label, summary ? `- ${summary}` : '');
    } else {
      line('FAIL', gate.label, summary ? `- ${summary}` : '');
      failures.push({ label: gate.label, output: result.output });
    }
  }

  // --- Version/tag readiness gate ---
  const version = checkVersionReadiness();
  if (version.ok) {
    if (/WARN/.test(version.detail)) {
      line('WARN', 'version-readiness (package vs tag + CHANGELOG)', `- ${version.detail}`);
      warnings.push('version-readiness');
    } else {
      line('PASS', 'version-readiness (package vs tag + CHANGELOG)', `- ${version.detail}`);
    }
  } else {
    line('FAIL', 'version-readiness (package vs tag + CHANGELOG)', `- ${version.detail}`);
    failures.push({ label: 'version-readiness', output: version.detail });
  }

  // --- Summary ---
  console.log('');
  if (failures.length === 0) {
    const warnNote = warnings.length > 0 ? ` (${warnings.length} warning(s))` : '';
    console.log(`Release readiness: PASS${warnNote}. All hard gates green.`);
    process.exit(0);
  }

  console.log(`Release readiness: FAIL. ${failures.length} gate(s) need attention before tagging:`);
  for (const failure of failures) {
    console.log('');
    console.log(`--- ${failure.label} ---`);
    console.log(
      failure.output
        .split(/\r?\n/)
        .map((l) => `    ${l}`)
        .join('\n'),
    );
  }
  process.exit(1);
}

main();
