import { execFile, spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'
const npxCommand = 'npx'
const testPorts = [8080, 8081, 4173]
const dashboardRoot = process.cwd().replace(/\\/g, '/').toLowerCase()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForUrl(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await isUrlReady(url)) return
    await sleep(500)
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`)
}

async function isUrlReady(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

function quoteArg(arg) {
  if (/^[a-zA-Z0-9_./:=+-]+$/.test(arg)) return arg
  return `"${arg.replace(/"/g, '\\"')}"`
}

function spawnLogged(command, args, options = {}) {
  const child = spawn(
    isWindows ? [command, ...args].map(quoteArg).join(' ') : command,
    isWindows ? [] : args,
    {
      cwd: process.cwd(),
      stdio: 'pipe',
      windowsHide: true,
      shell: isWindows,
      ...options,
    },
  )

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${options.label ?? 'proc'}] ${chunk}`)
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${options.label ?? 'proc'}] ${chunk}`)
  })

  return child
}

function execFileAsync(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout ?? '', stderr: stderr ?? '' })
    })
  })
}

async function findWindowsPidsOnPorts(ports) {
  const result = await execFileAsync('netstat', ['-ano', '-p', 'tcp'])
  if (result.error) return []

  const wanted = new Set(ports.map(String))
  const pids = new Set()

  for (const line of result.stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 5 || parts[0].toUpperCase() !== 'TCP') continue
    const localAddress = parts[1]
    const state = parts[3]
    const pid = parts[4]
    const portMatch = localAddress.match(/:(\d+)$/)
    if (state !== 'LISTENING' || !portMatch) continue
    if (wanted.has(portMatch[1]) && /^\d+$/.test(pid)) {
      pids.add(pid)
    }
  }

  return [...pids]
}

async function findUnixPidsOnPorts(ports) {
  const pids = new Set()

  for (const port of ports) {
    const result = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    if (result.error) continue
    for (const line of result.stdout.split(/\r?\n/)) {
      const pid = line.trim()
      if (/^\d+$/.test(pid)) pids.add(pid)
    }
  }

  return [...pids]
}

async function killPids(pids) {
  if (pids.length === 0) return

  if (isWindows) {
    await Promise.allSettled(
      pids.map((pid) => execFileAsync('taskkill', ['/pid', pid, '/t', '/f'])),
    )
    return
  }

  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM')
    } catch {
      // Already gone.
    }
  }
}

async function windowsCommandLine(pid) {
  const command = [
    '$p = Get-CimInstance Win32_Process -Filter "ProcessId = ' + pid + '"',
    'if ($p) { $p | Select-Object -ExpandProperty CommandLine }',
  ].join('; ')
  const result = await execFileAsync('powershell', ['-NoProfile', '-Command', command])
  return result.error ? '' : result.stdout.trim()
}

async function unixCommandLine(pid) {
  const result = await execFileAsync('ps', ['-p', pid, '-o', 'command='])
  return result.error ? '' : result.stdout.trim()
}

function isOwnedDashboardServer(commandLine) {
  const normalized = commandLine.replace(/\\/g, '/').toLowerCase()
  const belongsToThisProject =
    normalized.includes(dashboardRoot) ||
    normalized.includes('cre-acquisition-orchestrator/dashboard')
  if (!belongsToThisProject) return false
  return (
    normalized.includes('server/watcher.ts') ||
    normalized.includes('/vite/') ||
    normalized.includes('/.bin/vite') ||
    normalized.includes(' vite ')
  )
}

async function filterOwnedDashboardPids(pids) {
  const owned = []
  for (const pid of pids) {
    const commandLine = isWindows
      ? await windowsCommandLine(pid)
      : await unixCommandLine(pid)
    if (isOwnedDashboardServer(commandLine)) {
      owned.push(pid)
    }
  }
  return owned
}

async function clearTestPorts(ports) {
  const pids = isWindows
    ? await findWindowsPidsOnPorts(ports)
    : await findUnixPidsOnPorts(ports)

  if (pids.length === 0) return

  const ownedPids = await filterOwnedDashboardPids(pids)
  if (ownedPids.length === 0) {
    throw new Error(`[e2e] Ports ${ports.join(', ')} are occupied by non-dashboard processes; leaving them untouched. Stop those services or rerun with E2E_REUSE_SERVERS=1 if they are intentional.`)
  }

  console.log(`[e2e] Clearing stale dashboard test servers on ports ${ports.join(', ')} (pid ${ownedPids.join(', ')})`)
  await killPids(ownedPids)
  await sleep(1000)
}

async function killProcessTree(child) {
  if (!child || child.killed) return

  if (isWindows && child.pid) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.on('exit', () => resolve())
      killer.on('error', () => resolve())
    })
    return
  }

  child.kill('SIGTERM')
}

async function main() {
  const reuseServers = process.env.E2E_REUSE_SERVERS === '1'
  const watcherUrl = 'http://127.0.0.1:8081/api/run/status'
  const clientUrl = 'http://127.0.0.1:4173'

  if (!reuseServers) {
    await clearTestPorts(testPorts)
  }

  const watcherAlreadyRunning = reuseServers && await isUrlReady(watcherUrl)
  const clientAlreadyRunning = reuseServers && await isUrlReady(clientUrl)
  const watcher = watcherAlreadyRunning
    ? null
    : spawnLogged(npxCommand, ['tsx', 'server/watcher.ts'], { label: 'watcher' })
  const client = clientAlreadyRunning
    ? null
    : spawnLogged(npxCommand, ['vite', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
        label: 'vite',
      })

  if (watcherAlreadyRunning) {
    console.log(`[watcher] Reusing existing watcher at ${watcherUrl} because E2E_REUSE_SERVERS=1`)
  }
  if (clientAlreadyRunning) {
    console.log(`[vite] Reusing existing client at ${clientUrl} because E2E_REUSE_SERVERS=1`)
  }

  const cleanup = async () => {
    await Promise.allSettled([killProcessTree(watcher), killProcessTree(client)])
  }

  process.on('SIGINT', async () => {
    await cleanup()
    process.exit(130)
  })
  process.on('SIGTERM', async () => {
    await cleanup()
    process.exit(143)
  })

  try {
    await waitForUrl(watcherUrl, 120_000, 'watcher server')
    await waitForUrl(clientUrl, 120_000, 'vite client')

    const runner = spawn(
      isWindows
        ? [npxCommand, 'playwright', 'test', ...process.argv.slice(2)].map(quoteArg).join(' ')
        : npxCommand,
      isWindows ? [] : ['playwright', 'test', ...process.argv.slice(2)],
      {
        cwd: process.cwd(),
        stdio: 'inherit',
        windowsHide: true,
        shell: isWindows,
        env: {
          ...process.env,
          PLAYWRIGHT_SKIP_WEBSERVER: '1',
        },
      },
    )

    const exitCode = await new Promise((resolve, reject) => {
      runner.on('exit', (code) => resolve(code ?? 1))
      runner.on('error', reject)
    })

    await cleanup()
    process.exit(Number(exitCode))
  } catch (error) {
    await cleanup()
    throw error
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
