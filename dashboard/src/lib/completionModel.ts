import type { DealCheckpoint, DocumentArtifact } from '../types/checkpoint'
import type { ProofPathStep } from '../components/ProofPathStrip'
import { isCompleteDealStatus } from './stageModel'

type ProofCoverage = NonNullable<NonNullable<DealCheckpoint['inputSnapshot']>['sourceCoverage']>

export function sourceReadinessPresentation(
  readiness?: { status?: string | null } | null,
): { status: string; label: string } {
  const status = readiness?.status?.trim()
  return status
    ? { status, label: status }
    : { status: 'pending', label: 'not captured' }
}

export function buildPackageProofSteps(
  sourceCoverage: ProofCoverage | undefined,
  documentArtifacts: DocumentArtifact[],
  dealCheckpoint: DealCheckpoint | null,
): ProofPathStep[] {
  const sourceDocCount = sourceCoverage?.sourceDocumentCount ?? 0
  const approvedFieldCount = sourceCoverage?.approvedFieldCount ?? 0
  const workpaperCount = documentArtifacts.length
  const packageReady = Boolean(dealCheckpoint && isCompleteDealStatus(dealCheckpoint.status))
  const packageDetail = packageReady ? 'Complete' : workpaperCount > 0 ? 'In progress' : 'Pending'
  return [
    {
      key: 'source-doc',
      label: 'Source doc',
      status: sourceDocCount > 0 ? 'ready' : 'pending',
      detail: sourceDocCount > 0 ? `${sourceDocCount} captured` : 'Pending',
    },
    {
      key: 'approved-field',
      label: 'Approved field',
      status: approvedFieldCount > 0 ? 'ready' : 'pending',
      detail: approvedFieldCount > 0 ? `${approvedFieldCount} approved` : 'Pending',
    },
    {
      key: 'agent-workpaper',
      label: 'Agent workpaper',
      status: workpaperCount > 0 ? 'ready' : 'pending',
      detail: workpaperCount > 0 ? `${workpaperCount} filed` : 'Pending',
    },
    {
      key: 'ic-package',
      label: 'IC package',
      status: packageReady ? 'ready' : 'pending',
      detail: packageDetail,
    },
  ]
}
