import spireLogo from './assets/spire-logo.png'
import { SPIRE_CREDITS } from '../../shared/credits'

interface CreditsDialogProps {
  onClose: () => void
}

export default function CreditsDialog({ onClose }: CreditsDialogProps): React.JSX.Element {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        className="modal credits-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-title"
        onClick={(e) => e.stopPropagation()}
      >
        <img className="credits-logo" src={spireLogo} alt="" />
        <h2 id="credits-title">Spire</h2>
        <p className="credits-byline">{SPIRE_CREDITS.displayLine}</p>
        <p className="muted credits-blurb">
          Local-first Hytale instance launcher. No Spire account, no cloud sync.
        </p>
        <div className="row modal-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void window.spire.openExternal(SPIRE_CREDITS.githubUrl)}
          >
            GitHub — {SPIRE_CREDITS.githubUser}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void window.spire.openExternal(SPIRE_CREDITS.repoUrl)}
          >
            Project repo
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
