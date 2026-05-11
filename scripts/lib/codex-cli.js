const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

function findOnPath(command, extensions) {
  const pathDirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${command}${extension}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function windowsInvocation(command, args) {
  if (command === 'node') return { file: process.execPath, args };

  const exe = findOnPath(command, ['.exe']);
  if (exe) return { file: exe, args };

  const commandScript = findOnPath(command, ['.cmd', '.bat']);
  if (commandScript) {
    return {
      file: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/c', 'call', commandScript, ...args]
    };
  }

  return { file: command, args };
}

function resolveInvocation(command, args) {
  if (process.platform !== 'win32') return { file: command, args };
  return windowsInvocation(command, args);
}

function normalizeOutput(result) {
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

function runSync(command, args = [], options = {}) {
  const invocation = resolveInvocation(command, args);
  return spawnSync(invocation.file, invocation.args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    shell: false,
    stdio: options.stdio || 'pipe',
    env: {
      ...process.env,
      ...(options.env || {})
    }
  });
}

function runSyncInherited(command, args = [], options = {}) {
  const invocation = resolveInvocation(command, args);
  return spawnSync(invocation.file, invocation.args, {
    cwd: options.cwd || process.cwd(),
    shell: false,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(options.env || {})
    }
  });
}

function runDetached(command, args = [], options = {}) {
  const invocation = resolveInvocation(command, args);
  const child = spawn(invocation.file, invocation.args, {
    cwd: options.cwd || process.cwd(),
    shell: false,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      ...(options.env || {})
    }
  });
  child.unref();
  return child.pid || null;
}

function getCodexStatus(cwd = process.cwd()) {
  const versionResult = runSync('codex', ['--version'], { cwd });
  if (versionResult.error || versionResult.status !== 0) {
    return {
      installed: false,
      loggedIn: false,
      version: null,
      loginStatus: null,
      error: versionResult.error ? versionResult.error.message : normalizeOutput(versionResult)
    };
  }

  const loginResult = runSync('codex', ['login', 'status'], { cwd });
  const loginStatus = normalizeOutput(loginResult);
  const loggedIn = loginResult.status === 0 && /Logged in/i.test(loginStatus);
  const usingChatGpt = /ChatGPT/i.test(loginStatus);

  return {
    installed: true,
    loggedIn,
    usingChatGpt,
    version: normalizeOutput(versionResult),
    loginStatus,
    error: loginResult.status === 0 ? null : loginStatus
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function runStreaming(command, args = [], options = {}) {
  const cwd = options.cwd || process.cwd();
  const logFile = options.logFile || null;
  if (logFile) ensureDir(path.dirname(logFile));

  return new Promise((resolve) => {
    const invocation = resolveInvocation(command, args);
    const child = spawn(invocation.file, invocation.args, {
      cwd,
      shell: false,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        ...(options.env || {})
      }
    });

    let stdout = '';
    let stderr = '';

    function writeLog(chunk) {
      if (logFile) fs.appendFileSync(logFile, chunk);
    }

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      writeLog(text);
      if (options.onStdout) options.onStdout(text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      writeLog(text);
      if (options.onStderr) options.onStderr(text);
    });

    child.on('error', (error) => {
      stderr += error.message;
      writeLog(error.message);
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    if (options.input) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

module.exports = {
  getCodexStatus,
  runDetached,
  runStreaming,
  runSync,
  runSyncInherited
};
