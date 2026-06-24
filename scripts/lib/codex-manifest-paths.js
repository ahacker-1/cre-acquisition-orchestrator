const path = require('path');
const safePaths = require('./safe-paths');

function normalizeRepoRelativePath(value, label = 'manifest path') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Unsafe ${label}: repo-relative path is required`);
  }
  if (value.includes('\0')) {
    throw new Error(`Unsafe ${label}: path contains a null byte`);
  }
  if (value.includes('\\')) {
    throw new Error(`Unsafe ${label}: use repo-relative paths with forward slashes`);
  }
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new Error(`Unsafe ${label}: absolute paths are not allowed`);
  }

  const parts = value.split('/');
  if (parts.some((part) => part === '..')) {
    throw new Error(`Unsafe ${label}: path must not contain ".." segments`);
  }

  const normalized = path.posix.normalize(value);
  if (normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error(`Unsafe ${label}: path must stay repo-relative`);
  }
  return normalized;
}

function resolveRepoRelativePath(repoRoot, repoPath, label = 'manifest path') {
  const normalized = normalizeRepoRelativePath(repoPath, label);
  return safePaths.assertWithinBase(repoRoot, path.resolve(repoRoot, normalized), label);
}

function resolveCodexRunArtifactPath(repoRoot, runDir, repoPath, label = 'Codex run artifact path') {
  const absolutePath = resolveRepoRelativePath(repoRoot, repoPath, label);
  return safePaths.assertWithinBase(runDir, absolutePath, label);
}

module.exports = {
  normalizeRepoRelativePath,
  resolveCodexRunArtifactPath,
  resolveRepoRelativePath,
};
