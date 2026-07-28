import { useCallback, useEffect, useState } from 'react'
import type { InstalledMod, ModListing, ModSource } from '../../shared/types'

interface ModsBrowserProps {
  instanceId: string
  instanceName: string
  onToast: (message: string) => void
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function ModsBrowser({
  instanceId,
  instanceName,
  onToast
}: ModsBrowserProps): React.JSX.Element {
  const [source, setSource] = useState<ModSource>('curseforge')
  const [query, setQuery] = useState('')
  const [nxmLink, setNxmLink] = useState('')
  const [results, setResults] = useState<ModListing[]>([])
  const [installed, setInstalled] = useState<InstalledMod[]>([])
  const [loading, setLoading] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nxmHint, setNxmHint] = useState(false)

  const refreshInstalled = useCallback(async () => {
    setInstalled(await window.spire.listInstalledMods(instanceId))
  }, [instanceId])

  useEffect(() => {
    void refreshInstalled()
  }, [refreshInstalled])

  const runSearch = useCallback(
    async (nextQuery = query) => {
      setLoading(true)
      setError(null)
      try {
        const result = await window.spire.searchMods(source, nextQuery)
        setResults(result.mods)
      } catch (err) {
        setResults([])
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [query, source]
  )

  useEffect(() => {
    void runSearch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  const handleNxm = useCallback(
    async (url: string) => {
      setInstallingId('nxm')
      setNxmHint(true)
      try {
        const result = await window.spire.installFromNxm(instanceId, url)
        onToast(result.message)
        if (result.ok) {
          setNxmLink('')
          setNxmHint(false)
          await refreshInstalled()
        }
      } finally {
        setInstallingId(null)
      }
    },
    [instanceId, onToast, refreshInstalled]
  )

  useEffect(() => {
    return window.spire.onNxmReceived((url) => {
      void handleNxm(url)
    })
  }, [handleNxm])

  async function onInstall(mod: ModListing): Promise<void> {
    const key = `${mod.source}:${mod.id}`
    setInstallingId(key)
    try {
      const result = await window.spire.installMod(instanceId, mod.source, mod.id)
      onToast(result.message)
      if (result.needsManualNxm) {
        setNxmHint(true)
        setSource('nexus')
      }
      if (result.ok) await refreshInstalled()
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err))
    } finally {
      setInstallingId(null)
    }
  }

  async function onRemove(mod: InstalledMod): Promise<void> {
    await window.spire.removeInstalledMod(instanceId, mod.source, mod.modId)
    await refreshInstalled()
    onToast(`Removed “${mod.name}”`)
  }

  async function onImportFile(): Promise<void> {
    const result = await window.spire.importLocalMod(instanceId)
    if (!result) return
    onToast(result.message)
    if (result.ok) await refreshInstalled()
  }

  const installedKeys = new Set(installed.map((m) => `${m.source}:${m.modId}`))

  return (
    <div className="mods">
      <div className="mods-toolbar">
        <strong>{instanceName}</strong>
        <div className="source-tabs" role="tablist">
          <button
            type="button"
            className={`source-tab${source === 'curseforge' ? ' active' : ''}`}
            onClick={() => setSource('curseforge')}
          >
            CurseForge
          </button>
          <button
            type="button"
            className={`source-tab${source === 'nexus' ? ' active' : ''}`}
            onClick={() => setSource('nexus')}
          >
            Nexus
          </button>
        </div>
        <form
          className="mods-search-inline"
          onSubmit={(e) => {
            e.preventDefault()
            void runSearch()
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mods…"
          />
          <button className="btn" type="submit" disabled={loading}>
            {loading ? '…' : 'Search'}
          </button>
        </form>
        <button className="btn" type="button" onClick={() => void onImportFile()}>
          Import file
        </button>
      </div>

      {source === 'nexus' || nxmHint ? (
        <div className="nxm-box">
          <p>
            Free Nexus accounts: click Install → Files tab opens → use{' '}
            <strong>Mod Manager Download</strong> (Spire handles <code>nxm://</code>), or paste the
            link here.
          </p>
          <form
            className="mods-search-inline"
            onSubmit={(e) => {
              e.preventDefault()
              if (nxmLink.trim()) void handleNxm(nxmLink.trim())
            }}
          >
            <input
              value={nxmLink}
              onChange={(e) => setNxmLink(e.target.value)}
              placeholder="nxm://hytale/mods/…/files/…?key=…&expires=…"
            />
            <button className="btn btn-primary" type="submit" disabled={installingId === 'nxm'}>
              Install nxm
            </button>
          </form>
        </div>
      ) : null}

      {error ? <p className="mods-error">{error}</p> : null}

      <div className="mods-columns">
        <div className="mods-results">
          {results.length === 0 && !loading && !error ? (
            <p className="muted" style={{ padding: 12 }}>
              No mods found.
            </p>
          ) : (
            results.map((mod) => {
              const key = `${mod.source}:${mod.id}`
              const isInstalled = installedKeys.has(key)
              return (
                <article key={key} className="mod-row">
                  {mod.logoUrl ? (
                    <img className="mod-logo" src={mod.logoUrl} alt="" loading="lazy" />
                  ) : (
                    <div className="mod-logo placeholder" />
                  )}
                  <div className="mod-body">
                    <h3>{mod.name}</h3>
                    <p className="mod-summary">{mod.summary || 'No summary.'}</p>
                    <span className="mod-meta">
                      {mod.author} · {formatDownloads(mod.downloads)}
                    </span>
                  </div>
                  <div className="mod-actions">
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => void window.spire.openExternal(mod.pageUrl)}
                    >
                      Web
                    </button>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={isInstalled || installingId === key}
                      onClick={() => void onInstall(mod)}
                    >
                      {isInstalled ? 'In' : installingId === key ? '…' : 'Install'}
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </div>

        <aside className="mods-installed">
          <h2>Installed</h2>
          {installed.length === 0 ? (
            <p className="muted">None</p>
          ) : (
            <ul>
              {installed.map((mod) => (
                <li key={`${mod.source}:${mod.modId}:${mod.fileName}`}>
                  <div>
                    <strong>{mod.name}</strong>
                    <span className="mod-meta">{mod.fileName}</span>
                  </div>
                  <button className="btn btn-danger" type="button" onClick={() => void onRemove(mod)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
