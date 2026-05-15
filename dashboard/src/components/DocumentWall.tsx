import { useMemo } from 'react'
import type { DocumentArtifact } from '../types/checkpoint'

interface DocumentWallProps {
  documentArtifacts: DocumentArtifact[]
}

function prettyTs(value?: string): string {
  if (!value) return '--'
  const t = Date.parse(value)
  if (!Number.isFinite(t)) return value
  return new Date(t).toLocaleTimeString('en-US', { hour12: false })
}

const PHASE_ORDER = ['due-diligence', 'underwriting', 'financing', 'legal', 'closing', 'general']

function displayPhase(phase: string): string {
  return phase
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function DocumentWall({ documentArtifacts }: DocumentWallProps) {
  const grouped = useMemo(() => {
    const byPhase = new Map<string, DocumentArtifact[]>()
    for (const doc of documentArtifacts) {
      const phase = doc.phase || 'general'
      if (!byPhase.has(phase)) byPhase.set(phase, [])
      byPhase.get(phase)!.push(doc)
    }
    const orderedKeys = [
      ...PHASE_ORDER.filter((phase) => byPhase.has(phase)),
      ...[...byPhase.keys()].filter((phase) => !PHASE_ORDER.includes(phase)),
    ]
    return orderedKeys.map((phase) => ({
      phase,
      docs: (byPhase.get(phase) || []).sort((a, b) => {
        return Date.parse(a.createdAt || '') - Date.parse(b.createdAt || '')
      }),
    }))
  }, [documentArtifacts])

  if (documentArtifacts.length === 0) {
    return (
      <div className="card flex items-center justify-center h-64 text-center">
        <div>
          <p className="text-gray-400">No workpapers assembled yet.</p>
          <p className="text-xs text-gray-600 mt-1">
            As agents produce memos, risk registers, extracts, and package sections, they will appear here with source context.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Workpapers & Evidence
          </h3>
          <span className="status-badge status-complete">
            {documentArtifacts.length} workpapers
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-gray-500">
          Team-produced deliverables, evidence traces, and package materials grouped by workstream.
        </p>
      </div>

      {grouped.map(({ phase, docs }) => (
        <div key={phase} className="card">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-200">{displayPhase(phase)}</h4>
            <span className="text-xs text-gray-500">{docs.length} workpapers</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {docs.map((doc) => (
              <div key={doc.docId} className="rounded-lg border border-cre-border bg-black/20 p-3">
                <div className="flex items-center gap-2 text-xs mb-1">
                  <span className="status-badge bg-cre-info/20 text-cre-info">
                    v{doc.version}
                  </span>
                  <span className="text-gray-500">{doc.docType}</span>
                  <span className="text-gray-600 ml-auto">{prettyTs(doc.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-200 font-medium">{doc.title}</p>
                {doc.summary && <p className="text-xs text-gray-500 mt-1">{doc.summary}</p>}
                <div className="text-xs text-gray-600 mt-2 space-y-1">
                  <p>Produced by: {doc.agent}</p>
                  <p>Evidence path: {doc.path}</p>
                  {doc.dependsOn && doc.dependsOn.length > 0 && <p>Uses: {doc.dependsOn.join(', ')}</p>}
                  {doc.tags && doc.tags.length > 0 && <p>Tags: {doc.tags.join(', ')}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
