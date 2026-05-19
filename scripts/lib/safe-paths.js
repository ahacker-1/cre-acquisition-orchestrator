const path = require('path');

function normalizedPath(filePath) {
  return path.resolve(filePath);
}

function assertWithinBase(base, candidate, label = 'path') {
  if (typeof base !== 'string' || base.trim().length === 0) {
    throw new Error('Safe path base is required');
  }
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    throw new Error(`Safe ${label} is required`);
  }

  const resolvedBase = normalizedPath(base);
  const resolvedCandidate = normalizedPath(candidate);
  const relativePath = path.relative(resolvedBase, resolvedCandidate);
  const insideBase =
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));

  if (!insideBase) {
    throw new Error(`Unsafe ${label}: resolved path escapes ${resolvedBase}`);
  }

  return resolvedCandidate;
}

function assertSafeSegment(value, label = 'path segment') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9._-]{1,160}$/.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function toRelativePath(base, candidate, label = 'path') {
  return path.relative(normalizedPath(base), assertWithinBase(base, candidate, label)).replace(/\\/g, '/');
}

module.exports = {
  assertSafeSegment,
  assertWithinBase,
  toRelativePath,
};
