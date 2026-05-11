import { spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'
const npxCommand = 'npx'

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
  const watcherUrl = 'http://127.0.0.1:8081/api/run/status'
  const clientUrl = 'http://127.0.0.1:4173'
  const watcherAlreadyRunning = await isUrlReady(watcherUrl)
  const clientAlreadyRunning = await isUrlReady(clientUrl)
  const watcher = watcherAlreadyRunning
    ? null
    : spawnLogged(npxCommand, ['tsx', 'server/watcher.ts'], { label: 'watcher' })
  const client = clientAlreadyRunning
    ? null
    : spawnLogged(npxCommand, ['vite', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
        label: 'vite',
      })

  if (watcherAlreadyRunning) {
    console.log(`[watcher] Reusing existing watcher at ${watcherUrl}`)
  }
  if (clientAlreadyRunning) {
    console.log(`[vite] Reusing existing client at ${clientUrl}`)
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
