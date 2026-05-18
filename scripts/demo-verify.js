#!/usr/bin/env node

/**
 * Offline Quick Demo verification.
 *
 * This is intentionally credential-free: it proves the deterministic sample
 * journey, contracts, guides, system tests, and dashboard production build
 * without calling external AI APIs.
 */

const { spawnSync } = require('node:child_process')

const steps = [
  {
    name: 'Regenerate deterministic demo artifacts',
    command: ['run', 'demo'],
  },
  {
    name: 'Validate schema contracts and generated artifacts',
    command: ['run', 'validate'],
  },
  {
    name: 'Validate goal-helper swarm recommendations',
    command: ['run', 'test:goal-helper'],
  },
  {
    name: 'Validate operator guide contract',
    command: ['run', 'validate:guides'],
  },
  {
    name: 'Run system scenarios and failure/resume checks',
    command: ['test'],
  },
  {
    name: 'Verify dashboard production build',
    command: ['--prefix', 'dashboard', 'run', 'build'],
  },
]

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

const startedAt = Date.now()
const results = []

console.log('\nCRE Acquisition Orchestrator — Offline Quick Demo Verification')
console.log('This command is deterministic and credential-free by default.\n')

for (const [index, step] of steps.entries()) {
  const label = `${index + 1}/${steps.length}`
  const commandText = `npm ${step.command.join(' ')}`
  const stepStartedAt = Date.now()

  console.log(`\n[${label}] ${step.name}`)
  console.log(`$ ${commandText}`)

  const result = spawnSync(commandText, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: true,
  })

  const duration = Date.now() - stepStartedAt
  results.push({ ...step, commandText, duration, status: result.status })

  if (result.error) {
    console.error(`\n[${label}] Failed to launch: ${result.error.message}`)
    process.exitCode = 1
    break
  }

  if (result.status !== 0) {
    console.error(`\n[${label}] FAILED after ${formatDuration(duration)}: ${step.name}`)
    process.exitCode = result.status || 1
    break
  }

  console.log(`[${label}] Passed in ${formatDuration(duration)}`)
}

console.log('\nVerification summary:')
for (const [index, result] of results.entries()) {
  const ok = result.status === 0
  console.log(`- ${ok ? 'PASS' : 'FAIL'} ${index + 1}. ${result.name} (${formatDuration(result.duration)})`)
  if (!ok) {
    console.log(`  Command: ${result.commandText}`)
    break
  }
}

if (process.exitCode) {
  console.error('\nOffline Quick Demo verification failed. Fix the failing stage above, then rerun `npm run demo:verify`.')
  process.exit(process.exitCode)
}

console.log(`\nOffline Quick Demo verification passed in ${formatDuration(Date.now() - startedAt)}.`)
console.log('You can now run `npm run dashboard` and open http://localhost:5173 to review the workspace.\n')
