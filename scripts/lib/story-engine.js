const fs = require('fs');
const path = require('path');
const { nowIso, ensureDir, safeString } = require('./runtime-core');

function toSlug(value) {
  return safeString(value, 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function requireSafeRunId(runId) {
  const value = String(runId || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) || value.includes('..')) {
    throw new Error('StoryEngine runId must be a safe slug without path separators or "..".');
  }
  return value;
}

function normalizePhase(phase) {
  if (!phase) return 'general';
  return String(phase)
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

class StoryEngine {
  constructor({ baseDir, dealId, runId }) {
    this.baseDir = baseDir;
    this.dealId = dealId;
    this.runId = requireSafeRunId(runId);

    this.statusDealDir = path.join(baseDir, 'data', 'status', dealId);
    this.reportsDealDir = path.join(baseDir, 'data', 'reports', dealId);
    this.eventsPath = path.join(this.statusDealDir, `run-${this.runId}-events.ndjson`);
    this.documentsPath = path.join(this.statusDealDir, `run-${this.runId}-documents.json`);
    this.manifestPath = path.join(this.statusDealDir, `run-${this.runId}-manifest.json`);

    ensureDir(this.statusDealDir);
    ensureDir(this.reportsDealDir);

    this.documents = readJsonIfExists(this.documentsPath, {
      runId: this.runId,
      dealId,
      updatedAt: nowIso(),
      documents: []
    });
    if (!Array.isArray(this.documents.documents)) {
      this.documents.documents = [];
    }
    this.documentVersions = new Map();
    this.documents.documents.forEach((doc) => {
      const baseKey = `${doc.phase || 'general'}:${doc.agent || 'system'}:${doc.docType || doc.title || 'doc'}`;
      const current = this.documentVersions.get(baseKey) || 0;
      this.documentVersions.set(baseKey, Math.max(current, Number(doc.version || 1)));
    });

    this.seq = this.loadLastSeq();
    this.persistManifest({
      runId: this.runId,
      dealId,
      startedAt: nowIso(),
      status: 'RUNNING',
      eventsPath: this.rel(this.eventsPath),
      documentsPath: this.rel(this.documentsPath)
    });
    this.persistDocuments();
  }

  loadLastSeq() {
    if (!fs.existsSync(this.eventsPath)) return 0;
    const lines = fs
      .readFileSync(this.eventsPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    if (lines.length === 0) return 0;
    try {
      const last = JSON.parse(lines[lines.length - 1]);
      return Number(last.seq || 0);
    } catch {
      return lines.length;
    }
  }

  rel(filePath) {
    return path.relative(this.baseDir, filePath).replace(/\\/g, '/');
  }

  persistDocuments() {
    this.documents.updatedAt = nowIso();
    fs.writeFileSync(this.documentsPath, JSON.stringify(this.documents, null, 2));
  }

  persistManifest(patch) {
    const existing = readJsonIfExists(this.manifestPath, {});
    const merged = {
      ...existing,
      ...patch,
      runId: this.runId,
      dealId: this.dealId,
      lastUpdatedAt: nowIso()
    };
    fs.writeFileSync(this.manifestPath, JSON.stringify(merged, null, 2));
  }

  emit(kind, payload = {}) {
    const event = {
      runId: this.runId,
      dealId: this.dealId,
      seq: ++this.seq,
      ts: nowIso(),
      kind,
      ...payload
    };
    fs.appendFileSync(this.eventsPath, `${JSON.stringify(event)}\n`);
    return event;
  }

  emitMilestone(title, subtitle, emphasis = 'info') {
    return this.emit('milestone', { title, subtitle, emphasis });
  }

  emitDecision({ phase, title, rationale, inputs = [], impact = [] }) {
    return this.emit('decision_made', {
      phase: normalizePhase(phase),
      title,
      rationale,
      inputs,
      impact
    });
  }

  createDocument({
    phase,
    agent = 'system',
    title,
    docType,
    summary,
    content,
    mime = 'text/markdown',
    extension = 'md',
    dependsOn = [],
    tags = []
  }) {
    const normalizedPhase = normalizePhase(phase);
    const safeAgent = toSlug(agent || 'system');
    const safeDocType = toSlug(docType || title || 'artifact');
    const baseKey = `${normalizedPhase}:${safeAgent}:${safeDocType}`;
    const version = (this.documentVersions.get(baseKey) || 0) + 1;
    this.documentVersions.set(baseKey, version);

    const docId = `${baseKey}-v${version}`;
    const fileName = `${safeAgent}-${safeDocType}-v${version}.${extension}`;
    const phaseDir = path.join(this.reportsDealDir, normalizedPhase);
    ensureDir(phaseDir);
    const filePath = path.join(phaseDir, fileName);
    fs.writeFileSync(filePath, content);

    const artifact = {
      docId,
      runId: this.runId,
      dealId: this.dealId,
      phase: normalizedPhase,
      agent,
      docType: safeDocType,
      title: title || docType || 'Document',
      path: this.rel(filePath),
      mime,
      version,
      summary: summary || '',
      dependsOn,
      tags: [normalizedPhase, safeAgent, safeDocType, ...tags],
      status: 'final',
      createdAt: nowIso()
    };

    this.documents.documents.push(artifact);
    this.persistDocuments();
    this.emit('document_created', {
      docId: artifact.docId,
      phase: artifact.phase,
      agent: artifact.agent,
      docType: artifact.docType,
      title: artifact.title,
      path: artifact.path,
      mime: artifact.mime,
      version: artifact.version,
      summary: artifact.summary,
      tags: artifact.tags
    });

    return artifact;
  }

  registerExternalDocument({
    phase,
    agent = 'system',
    title,
    docType = 'external',
    absolutePath,
    summary,
    mime = 'text/markdown',
    dependsOn = [],
    tags = []
  }) {
    if (!absolutePath || !fs.existsSync(absolutePath)) return null;
    const normalizedPhase = normalizePhase(phase);
    const safeAgent = toSlug(agent || 'system');
    const safeDocType = toSlug(docType || title || 'external');
    const baseKey = `${normalizedPhase}:${safeAgent}:${safeDocType}`;
    const version = (this.documentVersions.get(baseKey) || 0) + 1;
    this.documentVersions.set(baseKey, version);

    const artifact = {
      docId: `${baseKey}-v${version}`,
      runId: this.runId,
      dealId: this.dealId,
      phase: normalizedPhase,
      agent,
      docType: safeDocType,
      title: title || path.basename(absolutePath),
      path: this.rel(absolutePath),
      mime,
      version,
      summary: summary || '',
      dependsOn,
      tags: [normalizedPhase, safeAgent, safeDocType, ...tags],
      status: 'final',
      createdAt: nowIso()
    };

    this.documents.documents.push(artifact);
    this.persistDocuments();
    this.emit('document_created', {
      docId: artifact.docId,
      phase: artifact.phase,
      agent: artifact.agent,
      docType: artifact.docType,
      title: artifact.title,
      path: artifact.path,
      mime: artifact.mime,
      version: artifact.version,
      summary: artifact.summary,
      tags: artifact.tags
    });

    return artifact;
  }

  finalize(status, extras = {}) {
    this.persistManifest({
      status,
      completedAt: nowIso(),
      ...extras
    });
    this.emit('run_completed', { status });
  }
}

module.exports = {
  StoryEngine
};
