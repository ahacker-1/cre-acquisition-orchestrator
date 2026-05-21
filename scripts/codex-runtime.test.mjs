// Unit tests for the Live Agent Runtime Hardening pure helpers.
// Runs WITHOUT a real Codex CLI: every code path uses injected fakes/stubs,
// no network, and no real sleeping. Run with: node scripts/codex-runtime.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const {
  redactSecrets,
  computeBackoffMs,
  runWithRetry,
  computeRunOutcome,
  selectFailedAgentSelectors
} = require('./codex-agent-runner.js')

let passed = 0
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1
      console.log(`  ok - ${name}`)
    })
    .catch((error) => {
      console.error(`  FAIL - ${name}`)
      console.error(error.stack || error.message)
      process.exitCode = 1
      throw error
    })
}

async function main() {
  // -------------------------------------------------------------------------
  // W73 - redactSecrets
  // -------------------------------------------------------------------------
  await test('W73 masks Bearer tokens', () => {
    const out = redactSecrets('Using Authorization: Bearer abcDEF123456ghijkLMNOP7890 now')
    assert.ok(!out.includes('abcDEF123456ghijkLMNOP7890'), 'bearer token should be masked')
    assert.ok(out.includes('[REDACTED]'))
  })

  await test('W73 masks bare Bearer token', () => {
    const out = redactSecrets('header was Bearer sometokenvalue1234567890abc')
    assert.ok(!out.includes('sometokenvalue1234567890abc'))
    assert.ok(out.includes('Bearer [REDACTED]'))
  })

  await test('W73 masks OpenAI sk- style keys', () => {
    const out = redactSecrets('key is sk-proj-abcdEFGH1234567890ijklMNOP and done')
    assert.ok(!out.includes('sk-proj-abcdEFGH1234567890ijklMNOP'))
    assert.ok(out.includes('[REDACTED]'))
  })

  await test('W73 masks Authorization header without Bearer', () => {
    const out = redactSecrets('Authorization: abc123def456ghi789jkl012mno345')
    assert.ok(!out.includes('abc123def456ghi789jkl012mno345'))
    assert.ok(/Authorization:\s*\[REDACTED\]/.test(out))
  })

  await test('W73 masks access_token / refresh_token / api_key assignments', () => {
    const json = '{"access_token":"xyzAccessToken1234567890","refresh_token":"refreshTok0987654321","api_key":"keyVALUE123456"}'
    const out = redactSecrets(json)
    assert.ok(!out.includes('xyzAccessToken1234567890'))
    assert.ok(!out.includes('refreshTok0987654321'))
    assert.ok(!out.includes('keyVALUE123456'))
    // Field names are preserved, only the values are masked.
    assert.ok(out.includes('"access_token":"[REDACTED]"'))
    assert.ok(out.includes('"api_key":"[REDACTED]"'))
  })

  await test('W73 masks api-key with hyphen form and env-style assignment', () => {
    const out = redactSecrets('API_KEY=supersecretkeyvalue1234567890ABCDE')
    assert.ok(!out.includes('supersecretkeyvalue1234567890ABCDE'))
    assert.ok(out.includes('API_KEY=[REDACTED]'))
  })

  await test('W73 masks long hex token-looking strings', () => {
    const hex = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4' // 32 hex chars
    const out = redactSecrets(`session ${hex} end`)
    assert.ok(!out.includes(hex))
    assert.ok(out.includes('[REDACTED]'))
  })

  await test('W73 leaves ordinary deal text untouched', () => {
    const text =
      'Net operating income held at the 6.1% in-place cap; rent roll shows 92% occupancy across 120 units in Dallas, TX.'
    const out = redactSecrets(text)
    assert.equal(out, text, 'ordinary deal text must not be altered')
  })

  await test('W73 leaves short numbers and words alone', () => {
    const text = 'DSCR 1.25, LTV 65%, IRR 14.2%, hold period 5 years, NOI $730,000.'
    assert.equal(redactSecrets(text), text)
  })

  await test('W73 handles null/undefined safely', () => {
    assert.equal(redactSecrets(null), null)
    assert.equal(redactSecrets(undefined), undefined)
  })

  // -------------------------------------------------------------------------
  // W70 - computeBackoffMs + runWithRetry
  // -------------------------------------------------------------------------
  await test('W70 computeBackoffMs grows exponentially', () => {
    assert.equal(computeBackoffMs(0, 1000), 1000)
    assert.equal(computeBackoffMs(1, 1000), 2000)
    assert.equal(computeBackoffMs(2, 1000), 4000)
    assert.equal(computeBackoffMs(0, 0), 0)
  })

  await test('W70 retries transient failures then succeeds with fake sleep', async () => {
    let calls = 0
    const slept = []
    const result = await runWithRetry(
      async () => {
        calls += 1
        if (calls < 3) throw new Error('transient boom')
        return 'done'
      },
      {
        maxRetries: 3,
        baseBackoffMs: 10,
        isTransient: () => true,
        sleep: async (ms) => {
          slept.push(ms)
        }
      }
    )
    assert.equal(calls, 3, 'fails twice then succeeds = 3 calls')
    assert.equal(result.value, 'done')
    assert.equal(result.attempts, 3)
    // Two backoffs before the third attempt: 10, 20.
    assert.deepEqual(slept, [10, 20])
  })

  await test('W70 does NOT retry a permanent (non-transient) failure', async () => {
    let calls = 0
    let sleeps = 0
    await assert.rejects(
      runWithRetry(
        async () => {
          calls += 1
          throw new Error('permanent')
        },
        {
          maxRetries: 5,
          baseBackoffMs: 10,
          isTransient: () => false,
          sleep: async () => {
            sleeps += 1
          }
        }
      ),
      /permanent/
    )
    assert.equal(calls, 1, 'permanent failure must not retry')
    assert.equal(sleeps, 0, 'permanent failure must not sleep')
  })

  await test('W70 stops after maxRetries when always transient', async () => {
    let calls = 0
    let error
    try {
      await runWithRetry(
        async () => {
          calls += 1
          throw new Error('always boom')
        },
        { maxRetries: 2, baseBackoffMs: 0, isTransient: () => true, sleep: async () => {} }
      )
    } catch (err) {
      error = err
    }
    assert.ok(error, 'should reject eventually')
    assert.equal(calls, 3, '1 initial + 2 retries = 3 calls')
    assert.equal(error.attempts, 3)
  })

  await test('W70 succeeds first try without sleeping', async () => {
    let sleeps = 0
    const result = await runWithRetry(async () => 'ok', {
      maxRetries: 2,
      baseBackoffMs: 100,
      sleep: async () => {
        sleeps += 1
      }
    })
    assert.equal(result.attempts, 1)
    assert.equal(result.value, 'ok')
    assert.equal(sleeps, 0)
  })

  // -------------------------------------------------------------------------
  // W71 - computeRunOutcome + selectFailedAgentSelectors
  // -------------------------------------------------------------------------
  await test('W71 all-pass => success / COMPLETE', () => {
    const out = computeRunOutcome([
      { status: 'PASS', agentName: 'a', phase: 'underwriting' },
      { status: 'PASS', agentName: 'b', phase: 'underwriting' }
    ])
    assert.equal(out.runOutcome, 'success')
    assert.equal(out.status, 'COMPLETE')
    assert.equal(out.failedAgents.length, 0)
  })

  await test('W71 mixed => partial / FAILED with failedAgents list', () => {
    const out = computeRunOutcome([
      { status: 'PASS', agentName: 'a', phase: 'underwriting' },
      { status: 'FAIL', agentName: 'b', phase: 'underwriting', attempts: 3, error: 'boom' }
    ])
    assert.equal(out.runOutcome, 'partial')
    assert.equal(out.status, 'FAILED')
    assert.equal(out.failedAgents.length, 1)
    assert.equal(out.failedAgents[0].agentName, 'b')
    assert.equal(out.failedAgents[0].attempts, 3)
  })

  await test('W71 all-fail => failed / FAILED', () => {
    const out = computeRunOutcome([
      { status: 'FAIL', agentName: 'a', phase: 'underwriting' },
      { status: 'FAIL', agentName: 'b', phase: 'underwriting' }
    ])
    assert.equal(out.runOutcome, 'failed')
    assert.equal(out.status, 'FAILED')
    assert.equal(out.failedAgents.length, 2)
  })

  await test('W71 empty results => failed', () => {
    const out = computeRunOutcome([])
    assert.equal(out.runOutcome, 'failed')
    assert.equal(out.status, 'FAILED')
  })

  await test('W71 DRY_RUN counts as non-failing', () => {
    const out = computeRunOutcome([
      { status: 'DRY_RUN', agentName: 'a', phase: 'underwriting' },
      { status: 'DRY_RUN', agentName: 'b', phase: 'underwriting' }
    ])
    assert.equal(out.runOutcome, 'success')
  })

  await test('W71 selectFailedAgentSelectors reads failedAgents from prior manifest', () => {
    const prior = {
      failedAgents: [
        { phase: 'underwriting', agentName: 'scenario-analyst' },
        { phase: 'financing', agentName: 'lender-outreach' }
      ]
    }
    const selectors = selectFailedAgentSelectors(prior)
    assert.deepEqual(selectors, [
      { phase: 'underwriting', agentName: 'scenario-analyst' },
      { phase: 'financing', agentName: 'lender-outreach' }
    ])
  })

  await test('W71 selectFailedAgentSelectors falls back to results for older manifests', () => {
    const prior = {
      results: [
        { status: 'PASS', phase: 'underwriting', agentName: 'financial-model-builder' },
        { status: 'FAIL', phase: 'underwriting', agentName: 'scenario-analyst' }
      ]
    }
    const selectors = selectFailedAgentSelectors(prior)
    assert.deepEqual(selectors, [{ phase: 'underwriting', agentName: 'scenario-analyst' }])
  })

  await test('W71 selectFailedAgentSelectors returns [] for empty/garbage', () => {
    assert.deepEqual(selectFailedAgentSelectors(null), [])
    assert.deepEqual(selectFailedAgentSelectors({}), [])
    assert.deepEqual(selectFailedAgentSelectors({ failedAgents: [] }), [])
  })

  // -------------------------------------------------------------------------
  // W74 - committed redacted sample artifact
  // -------------------------------------------------------------------------
  await test('W74 sample manifest parses and has expected shape', () => {
    const manifestPath = resolve(projectRoot, 'data', 'examples', 'codex-run-sample', 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert.ok(['success', 'partial', 'failed'].includes(manifest.runOutcome), 'runOutcome must be enum')
    assert.ok(Array.isArray(manifest.results) && manifest.results.length > 0)
    // Every result records attempts.
    for (const result of manifest.results) {
      assert.equal(typeof result.attempts, 'number', `result for ${result.agentName} must record attempts`)
    }
    assert.ok(Array.isArray(manifest.failedAgents))
    // The sample is "partial": at least one pass and one fail.
    assert.equal(manifest.runOutcome, 'partial')
    // Re-deriving the outcome from results must agree with the stored fields.
    const derived = computeRunOutcome(manifest.results)
    assert.equal(derived.runOutcome, manifest.runOutcome)
    assert.equal(derived.status, manifest.status)
    assert.equal(derived.failedAgents.length, manifest.failedAgents.length)
  })

  await test('W74 sample artifacts contain NO unredacted secrets', () => {
    const dir = resolve(projectRoot, 'data', 'examples', 'codex-run-sample')
    const blobs = [
      readFileSync(resolve(dir, 'manifest.json'), 'utf8'),
      readFileSync(resolve(dir, 'summary.md'), 'utf8')
    ]
    // Patterns redactSecrets targets must not appear unmasked in committed samples.
    const forbidden = [
      /\bBearer\s+[A-Za-z0-9._\-+/=]{12,}/,
      /\b(?:sk|rk|pk|ssk)-[A-Za-z0-9_-]{20,}/,
      /\b[0-9a-f]{32,}\b/i,
      /(?:access[_-]?token|refresh[_-]?token|api[_-]?key|secret)\s*[:=]\s*["']?[A-Za-z0-9]{12,}/i
    ]
    for (const blob of blobs) {
      // Re-running redactSecrets over the committed sample must be a no-op:
      // it is already fully redacted.
      assert.equal(redactSecrets(blob), blob, 'committed sample must already be fully redacted')
      for (const pattern of forbidden) {
        assert.ok(!pattern.test(blob), `committed sample must not contain secret matching ${pattern}`)
      }
    }
  })

  console.log(`\n[codex-runtime] PASS ${passed} assertions/tests`)
}

main().catch((error) => {
  console.error(`[codex-runtime] FAIL: ${error.message}`)
  process.exit(1)
})
