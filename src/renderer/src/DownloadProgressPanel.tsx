import type { HytaleDownloadProgress } from '../../shared/types'

/** Shared transfer shape for client + content (mods/worlds) progress bars. */
export interface TransferProgressView {
  phase: string
  message: string
  bytesReceived: number
  bytesTotal: number
}

interface DownloadProgressPanelProps {
  progress: TransferProgressView | HytaleDownloadProgress | null
  /** Hide when idle/done/error (Profiles + Create). Install page keeps terminal states. */
  hideTerminal?: boolean
  className?: string
  style?: React.CSSProperties
}

const WORKING_PHASES = new Set(['resolving', 'downloading', 'verifying', 'extracting'])

function progressPercent(progress: TransferProgressView): number | null {
  if (progress.phase !== 'downloading' || progress.bytesTotal <= 0) return null
  return Math.min(100, Math.floor((progress.bytesReceived / progress.bytesTotal) * 100))
}

export function isDownloadProgressActive(
  progress: TransferProgressView | null,
  hideTerminal = true
): boolean {
  if (!progress || progress.phase === 'idle') return false
  if (hideTerminal && (progress.phase === 'done' || progress.phase === 'error')) return false
  return true
}

/** Shared download/install progress — message + determinate or indeterminate bar. */
export default function DownloadProgressPanel({
  progress,
  hideTerminal = true,
  className = '',
  style
}: DownloadProgressPanelProps): React.JSX.Element | null {
  if (!isDownloadProgressActive(progress, hideTerminal) || !progress) return null

  const percent = progressPercent(progress)
  const showBar = WORKING_PHASES.has(progress.phase)
  const classes = ['download-progress', className].filter(Boolean).join(' ')

  return (
    <div className={classes} style={style} role="status" aria-live="polite">
      <div className="muted">{progress.message || 'Working…'}</div>
      {showBar ? (
        <div className="progress-bar">
          {percent != null ? (
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          ) : (
            <div className="progress-fill indeterminate" />
          )}
        </div>
      ) : null}
    </div>
  )
}
