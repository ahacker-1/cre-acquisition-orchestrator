import React, { useState } from 'react'
import type { DealCheckpoint, PhaseInfo, AgentCheckpoint } from '../types/checkpoint'
import PhaseDetail from './PhaseDetail'

interface PipelineViewProps {
  dealCheckpoint: DealCheckpoint
  agentCheckpoints: Map<string, AgentCheckpoint>
}

const PHASE_ORDER = [
  'due-diligence',
  'due_diligence',
  'dueDiligence',
  'underwriting',
  'financing',
  'legal',
  'closing',
]

const PHASE_DISPLAY_NAMES: Record<string, string> = {
  'due-diligence': 'Due Diligence',
  'due_diligence': 'Due Diligence',
  'dueDiligence': 'Due Diligence',
  underwriting: 'Underwriting',
  financing: 'Financing',
  legal: 'Legal',
  closing: 'Closing',
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'complete':
      return 'bg-cre-success'
    case 'running':
      return 'bg-cre-info'
    case 'failed':
      return 'bg-cre-danger'
    case 'blocked':
      return 'bg-cre-warning'
    case 'skipped':
      return 'bg-gray-500'
    default:
      return 'bg-gray-600'
  }
}

function getStatusBorderClass(status: string): string {
  switch (status) {
    case 'running':
      return 'border-cre-info shadow-[0_0_12px_rgba(49,130,206,0.3)]'
    case 'complete':
      return 'border-cre-success/50'
    case 'failed':
      return 'border-cre-danger/50'
    case 'skipped':
      return 'border-gray-600/60'
    default:
      return 'border-cre-border'
  }
}

function PhaseCard({
  phaseKey,
  phase,
  onClick,
}: {
  phaseKey: string
  phase: PhaseInfo
  onClick: () => void
}) {
  const progress = phase.progress ?? 0
  const progressPercent = Math.round(progress * 100)
  const displayName = PHASE_DISPLAY_NAMES[phaseKey] || phase.name || phaseKey
  const agents = phase.agents || { total: 0, completed: 0, running: 0, failed: 0, pending: 0 }

  return (
    <button
      onClick={onClick}
      className={`card border-2 ${getStatusBorderClass(
        phase.status || 'pending'
      )} min-w-[180px] flex-1 text-left hover:bg-cre-surface/80 transition-colors cursor-pointer`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">{displayName}</h3>
        <span className={`status-badge status-${phase.status || 'pending'}`}>
          {phase.status || 'pending'}
        </span>
      </div>

      <div className="progress-bar mb-2">
        <div
          className={`progress-fill ${getStatusColor(phase.status || 'pending')}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mb-2">{progressPercent}% complete</div>

      <div className="text-xs text-gray-400">
        Agents: {agents.completed}/{agents.total}
        {agents.running > 0 && (
          <span className="text-cre-info ml-1">({agents.running} active)</span>
        )}
        {agents.failed > 0 && (
          <span className="text-cre-danger ml-1">({agents.failed} failed)</span>
        )}
        {(agents.skipped || 0) > 0 && (
          <span className="text-gray-500 ml-1">({agents.skipped} skipped)</span>
        )}
      </div>
    </button>
  )
}

export default function PipelineView({ dealCheckpoint, agentCheckpoints }: PipelineViewProps) {
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null)
  const overallPercent = Math.round(dealCheckpoint.overallProgress * 100)

  const orderedPhases = PHASE_ORDER.filter((key) => key in dealCheckpoint.phases)
  // Include any phases not in the predefined order
  const extraPhases = Object.keys(dealCheckpoint.phases).filter(
    (key) => !PHASE_ORDER.includes(key)
  )
  const allPhases = [...orderedPhases, ...extraPhases]

  return (
    <div>
      {/* Overall progress */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-300">Overall Pipeline Progress</span>
          <span className="text-sm font-bold text-white">{overallPercent}%</span>
        </div>
        <div className="progress-bar h-3">
          <div
            className="progress-fill bg-cre-accent"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      {/* Phase pipeline */}
      <div className="flex items-stretch gap-2 overflow-x-auto pb-4">
        {allPhases.map((phaseKey, index) => (
          <React.Fragment key={phaseKey}>
            <PhaseCard
              phaseKey={phaseKey}
              phase={dealCheckpoint.phases[phaseKey]}
              onClick={() =>
                setSelectedPhase(selectedPhase === phaseKey ? null : phaseKey)
              }
            />
            {index < allPhases.length - 1 && (
              <div className="flex items-center text-gray-600 text-xl font-light select-none px-1">
                &rarr;
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Phase detail drill-down */}
      {selectedPhase && dealCheckpoint.phases[selectedPhase] && (
        <div className="mt-4">
          <PhaseDetail
            phase={dealCheckpoint.phases[selectedPhase]}
            phaseName={
              PHASE_DISPLAY_NAMES[selectedPhase] ||
              dealCheckpoint.phases[selectedPhase].name ||
              selectedPhase
            }
            agentCheckpoints={agentCheckpoints}
          />
        </div>
      )}
    </div>
  )
}
