import { useCallback, useEffect, useState } from 'react'
import type {
  DownloadWatchStatus,
  InstalledMod,
  ModDetails,
  ModInstallMode,
  ModListing,
  ModSort,
  ModSource
} from '../../shared/types'

interface ModsBrowserProps {
  instanceId: string
  instanceName: string
  onToast: (message: string) => void
  showModPhotos: boolean
  onShowModPhotosChange: (show: boolean) => void
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatBytes(n: number): string {
  if (!n) return ''
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default function ModsBrowser({
  instanceId,
  instanceName,
  onToast,
  showModPhotos,
  onShowModPhotosChange
}: ModsBrowserProps): React.JSX.Element {
  const [source, setSource] = useState<ModSource>('curseforge')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ModSort>('downloads')
  const [nxmLink, setNxmLink] = useState('')
  const [results, setResults] = useState<ModListing[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [installed, setInstalled] = useState<InstalledMod[]>([])
  const [loading, setLoading] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nxmHint, setNxmHint] = useState(false)
  const [selected, setSelected] = useState<ModListing | null>(null)
  const [details, setDetails] = useState<ModDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [watchStatus, setWatchStatus] = useState<DownloadWatchStatus | null>(null)

  const refreshInstalled = useCallback(async () => {
    setInstalled(await window.spire.listInstalledMods(instanceId))
  }, [instanceId])

  useEffect(() => {
    void refreshInstalled()
  }, [refreshInstalled])

  useEffect(() => {
    void window.spire.getDownloadWatchStatus().then(setWatchStatus)
    const offStatus = window.spire.onDownloadWatchStatus(setWatchStatus)
    const offImport = window.spire.onModAutoImported((result) => {
      onToast(result.message)
      if (result.ok) void refreshInstalled()
    })
    return () => {
      offStatus()
      offImport()
    }
  }, [onToast, refreshInstalled])

  const runSearch = useCallback(
    async (nextQuery = query) => {
      setLoading(true)
      setError(null)
      setNotice(null)
      try {
        const result = await window.spire.searchMods(source, {
          query: nextQuery,
          sort
        })
        setResults(result.mods)
        setNotice(result.notice ?? null)
        if (result.notice && result.mods.length === 0) {
          // Offer catalog in browser for keyless fallbacks
          const browse =
            source === 'curseforge'
              ? nextQuery.trim()
                ? `https://www.curseforge.com/hytale/mods?search=${encodeURIComponent(nextQuery.trim())}`
                : 'https://www.curseforge.com/hytale/mods'
              : 'https://www.nexusmods.com/hytale/mods/'
          // Don't auto-spam browser on every empty load — only when user searched
          if (nextQuery.trim()) {
            void window.spire.openExternal(browse)
          }
        }
      } catch (err) {
        setResults([])
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [query, source, sort]
  )

  useEffect(() => {
    setSelected(null)
    setDetails(null)
    void runSearch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  useEffect(() => {
    if (!selected) {
      setDetails(null)
      return
    }
    let cancelled = false
    setDetailsLoading(true)
    void window.spire
      .getModDetails(selected.source, selected.id)
      .then((d) => {
        if (cancelled) return
        setDetails(d)
        const primary = d.versions.find((v) => v.primary) ?? d.versions[0]
        setSelectedFileId(primary?.fileId ?? null)
      })
      .catch((err) => {
        if (!cancelled) {
          onToast(err instanceof Error ? err.message : String(err))
          setDetails(null)
        }
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected, onToast])

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

  async function onDownload(
    mod: ModListing,
    mode: ModInstallMode,
    fileId?: string | null
  ): Promise<void> {
    const key = `${mode}:${mod.source}:${mod.id}:${fileId || ''}`
    setInstallingId(key)
    try {
      const result = await window.spire.installMod(
        instanceId,
        mod.source,
        mod.id,
        fileId || undefined,
        mode,
        mod.name
      )
      onToast(result.message)
      if (result.needsManualDownload || result.needsManualNxm) {
        setNxmHint(true)
        if (mod.source === 'nexus') setSource('nexus')
      }
      if (result.watchingDownloads) {
        setWatchStatus(await window.spire.getDownloadWatchStatus())
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
  const listing = details?.listing ?? selected
  const quickAvailable =
    details?.quickDownloadAvailable ??
    (source === 'curseforge' || source === 'nexus' ? false : true)

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
          <select
            className="mods-sort"
            value={sort}
            onChange={(e) => {
              const next = e.target.value as ModSort
              setSort(next)
              void (async () => {
                setLoading(true)
                try {
                  const result = await window.spire.searchMods(source, {
                    query,
                    sort: next
                  })
                  setResults(result.mods)
                  setNotice(result.notice ?? null)
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err))
                } finally {
                  setLoading(false)
                }
              })()
            }}
            aria-label="Sort mods"
          >
            <option value="downloads">Downloads</option>
            <option value="updated">Updated</option>
            <option value="name">Name</option>
            <option value="relevance">Relevance</option>
          </select>
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
            Nexus free Slow download must start in the browser (their rules). Prefer{' '}
            <strong>Mod Manager Download</strong> so Spire gets an <code>nxm://</code> link and
            installs in-app. Or finish Slow download — Spire watches Downloads and auto-imports.
            Optional Premium API key unlocks <strong>Download quickly</strong>.
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

      {watchStatus?.active ? (
        <div className="nxm-box">
          <p style={{ marginBottom: 8 }}>{watchStatus.message}</p>
          <button
            className="btn"
            type="button"
            onClick={() => void window.spire.stopDownloadWatch().then(() => setWatchStatus(null))}
          >
            Stop watching
          </button>
        </div>
      ) : null}

      {error ? <p className="mods-error">{error}</p> : null}
      {notice && !error ? <p className="mods-notice">{notice}</p> : null}

      <div className={`mods-columns${selected ? ' with-detail' : ''}`}>
        <div className="mods-results">
          {results.length === 0 && !loading && !error ? (
            <p className="muted" style={{ padding: 12 }}>
              {notice
                ? 'No in-app results — use the browser catalog, then Import file.'
                : 'No mods found.'}
            </p>
          ) : (
            results.map((mod) => {
              const key = `${mod.source}:${mod.id}`
              const isInstalled = installedKeys.has(key)
              const isActive = selected?.id === mod.id && selected.source === mod.source
              return (
                <article
                  key={key}
                  className={`mod-row${isActive ? ' active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(mod)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelected(mod)
                    }
                  }}
                >
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
                      {isInstalled ? ' · Installed' : ''}
                    </span>
                  </div>
                </article>
              )
            })
          )}
        </div>

        {selected && listing ? (
          <section className="mod-detail" aria-label="Mod details">
            <div className="mod-detail-header">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setSelected(null)
                  setDetails(null)
                }}
              >
                ← Back
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => void window.spire.openExternal(listing.pageUrl)}
              >
                Open on site
              </button>
            </div>

            <div className="mod-detail-title-row">
              {listing.logoUrl ? (
                <img className="mod-detail-logo" src={listing.logoUrl} alt="" />
              ) : (
                <div className="mod-detail-logo placeholder" />
              )}
              <div>
                <h2>{listing.name}</h2>
                <p className="mod-meta">
                  {listing.author}
                  {listing.downloads ? ` · ${formatDownloads(listing.downloads)} downloads` : ''}
                  {listing.updatedAt
                    ? ` · Updated ${new Date(listing.updatedAt).toLocaleDateString()}`
                    : ''}
                </p>
              </div>
            </div>

            {detailsLoading ? (
              <p className="muted">Loading details…</p>
            ) : (
              <>
                {details?.notice ? <p className="mods-notice">{details.notice}</p> : null}

                <div className="mod-detail-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={installingId?.startsWith('slow:')}
                    onClick={() => void onDownload(listing, 'slow', selectedFileId)}
                  >
                    {installingId?.startsWith('slow:') ? '…' : 'Download'}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    title={
                      quickAvailable
                        ? 'API / CDN one-click when key & Premium (Nexus) allow it'
                        : 'Needs optional API key (Nexus Premium for CDN)'
                    }
                    disabled={!quickAvailable || Boolean(installingId?.startsWith('quick:'))}
                    onClick={() => void onDownload(listing, 'quick', selectedFileId)}
                  >
                    {installingId?.startsWith('quick:') ? '…' : 'Download quickly'}
                  </button>
                  <button className="btn" type="button" onClick={() => void onImportFile()}>
                    Import file
                  </button>
                </div>

                <label className="mod-photos-toggle">
                  <input
                    type="checkbox"
                    checked={showModPhotos}
                    onChange={(e) => onShowModPhotosChange(e.target.checked)}
                  />
                  <span>Show photos</span>
                </label>

                {showModPhotos && (details?.images?.length ?? 0) > 0 ? (
                  <div className="mod-gallery">
                    {details!.images!.map((img, i) => (
                      <a
                        key={`${img.url}-${i}`}
                        href={img.url}
                        onClick={(e) => {
                          e.preventDefault()
                          void window.spire.openExternal(img.url)
                        }}
                        title={img.title || 'Open image'}
                      >
                        <img src={img.thumbnailUrl || img.url} alt={img.title || ''} loading="lazy" />
                      </a>
                    ))}
                  </div>
                ) : null}

                <h3 className="mod-detail-section">Description</h3>
                <div className="mod-description">
                  {stripHtml(details?.description || listing.summary || 'No description.')}
                </div>

                {details?.versions && details.versions.length > 0 ? (
                  <>
                    <h3 className="mod-detail-section">Versions</h3>
                    <ul className="mod-versions">
                      {details.versions.map((v) => (
                        <li key={v.fileId}>
                          <label className={`mod-version-row${selectedFileId === v.fileId ? ' selected' : ''}`}>
                            <input
                              type="radio"
                              name="mod-version"
                              checked={selectedFileId === v.fileId}
                              onChange={() => setSelectedFileId(v.fileId)}
                            />
                            <span>
                              <strong>{v.displayName}</strong>
                              <span className="mod-meta">
                                {v.releaseType ? `${v.releaseType} · ` : ''}
                                {v.fileDate ? `${new Date(v.fileDate).toLocaleDateString()} · ` : ''}
                                {formatBytes(v.fileLength)}
                                {v.primary ? ' · primary' : ''}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="muted" style={{ marginTop: 12 }}>
                    Version list needs an API key when available; Download still opens the site Files
                    page.
                  </p>
                )}
              </>
            )}
          </section>
        ) : (
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
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => void onRemove(mod)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
