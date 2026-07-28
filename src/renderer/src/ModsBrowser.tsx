import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type {
  ContentCategory,
  ContentDownloadProgress,
  ContentKind,
  DownloadWatchStatus,
  InstalledMod,
  ModDetails,
  ModInstallMode,
  ModListing,
  ModSort,
  ModSource
} from '../../shared/types'
import ContextMenu, { useContextMenu } from './ContextMenu'
import DownloadProgressPanel from './DownloadProgressPanel'
import RichContent, { type RichContentMode } from './ui/RichContent'
import { useResizableSplit } from './ui/useResizableSplit'

const PAGE_SIZE = 40
const DESC_MODE_KEY = 'spire.mods.descMode'

interface ModsBrowserProps {
  instanceId: string
  instanceName: string
  onToast: (message: string) => void
  showModPhotos: boolean
  onShowModPhotosChange: (show: boolean) => void
  /** Locked content class for this browser surface. */
  kind?: ContentKind
  /** Start on download browse instead of installed list. */
  initialView?: 'installed' | 'download'
}

function kindLabel(kind: ContentKind): string {
  switch (kind) {
    case 'prefabs':
      return 'Prefabs'
    case 'worlds':
      return 'Worlds'
    case 'bootstrap':
      return 'Bootstraps'
    case 'translations':
      return 'Translations'
    default:
      return 'Mods'
  }
}

function kindInstallHint(kind: ContentKind): string {
  switch (kind) {
    case 'worlds':
      return 'World packs install into this instance’s Saves folder (same place Hytale looks).'
    case 'prefabs':
      return 'Prefabs install into prefabs/. Copy into a world save’s prefabs/ folder to place in-game.'
    case 'bootstrap':
      return 'Bootstraps / early plugins install into mods/ so the client can load them.'
    case 'translations':
      return 'Translations install into mods/ as loadable packs.'
    default:
      return 'Mods install into mods/.'
  }
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

function readDescMode(): RichContentMode {
  try {
    const raw = localStorage.getItem(DESC_MODE_KEY)
    if (raw === 'auto' || raw === 'markdown' || raw === 'html' || raw === 'plain') return raw
  } catch {
    // ignore
  }
  return 'auto'
}

export default function ModsBrowser({
  instanceId,
  instanceName,
  onToast,
  showModPhotos,
  onShowModPhotosChange,
  kind = 'mods',
  initialView = 'installed'
}: ModsBrowserProps): React.JSX.Element {
  const contentKind = kind
  const kindOnlyCurseForge = contentKind !== 'mods'
  const [source, setSource] = useState<ModSource>(kindOnlyCurseForge ? 'curseforge' : 'curseforge')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ModSort>('downloads')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [categories, setCategories] = useState<ContentCategory[]>([])
  const [nxmLink, setNxmLink] = useState('')
  const [results, setResults] = useState<ModListing[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [installed, setInstalled] = useState<InstalledMod[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ModListing | null>(null)
  const [details, setDetails] = useState<ModDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [watchStatus, setWatchStatus] = useState<DownloadWatchStatus | null>(null)
  const [contentProgress, setContentProgress] = useState<ContentDownloadProgress | null>(null)
  const [view, setView] = useState<'installed' | 'download'>(initialView)
  const [descMode, setDescMode] = useState<RichContentMode>(() => readDescMode())
  const { menu, openMenu, closeMenu } = useContextMenu()
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const detailRef = useRef<HTMLElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const {
    width: detailWidth,
    setWidth: setDetailWidth,
    isDragging: isResizingDetail,
    onResizeStart
  } = useResizableSplit({
    storageKey: 'spire.mods.detailWidth',
    defaultWidth: 400,
    minWidth: 280,
    maxWidth: 780
  })
  const stateRef = useRef({
    query,
    source,
    sort,
    categoryId,
    kind: contentKind,
    resultsLength: 0,
    hasMore: false,
    loading: false,
    loadingMore: false
  })
  stateRef.current = {
    query,
    source,
    sort,
    categoryId,
    kind: contentKind,
    resultsLength: results.length,
    hasMore,
    loading,
    loadingMore
  }

  const refreshInstalled = useCallback(async () => {
    const all = await window.spire.listInstalledMods(instanceId)
    setInstalled(all.filter((m) => (m.kind ?? 'mods') === contentKind))
  }, [instanceId, contentKind])

  useEffect(() => {
    void refreshInstalled()
  }, [refreshInstalled])

  useEffect(() => {
    let cancelled = false
    void window.spire.listContentCategories(contentKind).then((list) => {
      if (!cancelled) setCategories(list)
    })
    return () => {
      cancelled = true
    }
  }, [contentKind])

  useEffect(() => {
    if (kindOnlyCurseForge && source !== 'curseforge') setSource('curseforge')
  }, [kindOnlyCurseForge, source])

  useEffect(() => {
    setCategoryId(null)
  }, [contentKind])

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

  const mergeUnique = useCallback((prev: ModListing[], next: ModListing[]): ModListing[] => {
    const seen = new Set(prev.map((m) => `${m.source}:${m.id}`))
    const merged = [...prev]
    for (const mod of next) {
      const key = `${mod.source}:${mod.id}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(mod)
    }
    return merged
  }, [])

  const runSearch = useCallback(
    async (nextQuery: string, mode: 'replace' | 'append' = 'replace') => {
      const snap = stateRef.current
      if (mode === 'append') {
        if (snap.loadingMore || snap.loading || !snap.hasMore) return
        setLoadingMore(true)
        stateRef.current.loadingMore = true
      } else {
        setLoading(true)
        stateRef.current.loading = true
        setError(null)
        setNotice(null)
      }

      const offset = mode === 'append' ? snap.resultsLength : 0

      try {
        const result = await window.spire.searchMods(snap.source, {
          query: nextQuery,
          sort: snap.sort,
          offset,
          limit: PAGE_SIZE,
          kind: snap.kind,
          categoryId: snap.categoryId
        })
        const nextHasMore =
          result.mods.length === 0
            ? false
            : (result.hasMore ??
              (result.total > 0 && offset + result.mods.length < result.total))
        setTotal(result.total)
        setHasMore(nextHasMore)
        stateRef.current.hasMore = nextHasMore
        setNotice(result.notice ?? null)
        setResults((prev) => {
          const next = mode === 'append' ? mergeUnique(prev, result.mods) : result.mods
          stateRef.current.resultsLength = next.length
          return next
        })

        if (mode === 'replace' && result.notice && result.mods.length === 0 && nextQuery.trim()) {
          const browse =
            snap.source === 'curseforge'
              ? `https://www.curseforge.com/hytale/${snap.kind === 'mods' ? 'mods' : snap.kind}?search=${encodeURIComponent(nextQuery.trim())}`
              : snap.source === 'modtale'
                ? `https://modtale.net/?search=${encodeURIComponent(nextQuery.trim())}`
                : snap.source === 'modifold'
                  ? `https://modifold.com/mods?search=${encodeURIComponent(nextQuery.trim())}`
                  : snap.source === 'thunderstore'
                    ? 'https://thunderstore.io/c/hytale/'
                    : 'https://www.nexusmods.com/hytale/mods/'
          void window.spire.openExternal(browse)
        }
      } catch (err) {
        if (mode === 'replace') {
          setResults([])
          setTotal(0)
          setHasMore(false)
          stateRef.current.resultsLength = 0
          stateRef.current.hasMore = false
        }
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
        setLoadingMore(false)
        stateRef.current.loading = false
        stateRef.current.loadingMore = false
      }
    },
    [mergeUnique]
  )

  useEffect(() => {
    if (view !== 'download') return
    setSelected(null)
    setDetails(null)
    setResults([])
    setTotal(0)
    setHasMore(false)
    stateRef.current.resultsLength = 0
    stateRef.current.hasMore = false
    void runSearch('', 'replace')
  }, [source, runSearch, view, contentKind, categoryId])

  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 })
  }, [selected?.id, selected?.source])

  useEffect(() => {
    if (view !== 'download') return
    const root = resultsRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        void runSearch(stateRef.current.query, 'append')
      },
      { root, rootMargin: '320px', threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [runSearch, source, results.length, hasMore, view])

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
      try {
        const result = await window.spire.installFromNxm(instanceId, url)
        onToast(result.message)
        if (result.ok) {
          setNxmLink('')
          await refreshInstalled()
        }
      } finally {
        setInstallingId(null)
      }
    },
    [instanceId, onToast, refreshInstalled]
  )

  useEffect(() => {
    void window.spire.getContentDownloadProgress().then(setContentProgress)
    return window.spire.onContentDownloadProgress(setContentProgress)
  }, [])

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
        mod.name,
        contentKind
      )
      onToast(result.message)
      if (result.needsManualDownload || result.needsManualNxm) {
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

  async function onToggleEnabled(mod: InstalledMod): Promise<void> {
    const enabled = mod.enabled !== false
    await window.spire.setModEnabled(instanceId, mod.source, mod.modId, !enabled)
    await refreshInstalled()
    onToast(!enabled ? `Enabled “${mod.name}”` : `Disabled “${mod.name}”`)
  }

  async function onImportFile(): Promise<void> {
    const result = await window.spire.importLocalMod(instanceId)
    if (!result) return
    onToast(result.message)
    if (result.ok) await refreshInstalled()
  }

  const installedKeys = new Set(installed.map((m) => `${m.source}:${m.modId}`))
  const listing = details?.listing ?? selected
  const isCurseForge = source === 'curseforge'
  const isNexus = source === 'nexus'
  const isDirectInstall =
    source === 'curseforge' ||
    source === 'modtale' ||
    source === 'modifold' ||
    source === 'thunderstore'
  const quickAvailable =
    details?.quickDownloadAvailable ?? (isNexus ? false : !isCurseForge)
  const enabledCount = installed.filter((m) => m.enabled !== false).length

  if (view === 'installed') {
    return (
      <div className="mods mods-manage">
        <div className="mods-manage-header">
          <div>
            <h1 className="page-title">{kindLabel(contentKind)}</h1>
            <p className="page-sub">
              {installed.length === 0
                ? `No ${kindLabel(contentKind).toLowerCase()} on ${instanceName} yet.`
                : `${enabledCount} active · ${installed.length} installed on ${instanceName}`}
            </p>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              {kindInstallHint(contentKind)}
            </p>
          </div>
          <div className="mods-manage-actions">
            {contentKind === 'mods' ? (
              <button className="btn" type="button" onClick={() => void onImportFile()}>
                Import file
              </button>
            ) : null}
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setView('download')}
            >
              Download
            </button>
          </div>
        </div>

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

        {installed.length === 0 ? (
          <div className="empty-state mods-empty">
            <p>Browse CurseForge {kindLabel(contentKind).toLowerCase()} and install into this instance.</p>
            <button className="btn btn-primary" type="button" onClick={() => setView('download')}>
              Download {kindLabel(contentKind).toLowerCase()}
            </button>
          </div>
        ) : (
          <div className="mods-installed-list">
            <p className="muted mods-installed-hint">
              Uncheck Active to disable without removing (files move to <code>mods/disabled/</code>).
            </p>
            {installed.map((mod) => {
              const on = mod.enabled !== false
              return (
                <div
                  key={`${mod.source}:${mod.modId}:${mod.fileName}`}
                  className={`manage-row${!on ? ' is-disabled' : ''}`}
                  onContextMenu={(e) =>
                    openMenu(e, [
                      {
                        id: 'toggle',
                        label: on ? 'Disable' : 'Enable',
                        onSelect: () => void onToggleEnabled(mod)
                      },
                      { id: 'sep', label: '', separator: true },
                      {
                        id: 'remove',
                        label: 'Remove',
                        danger: true,
                        onSelect: () => void onRemove(mod)
                      }
                    ])
                  }
                >
                  <div className="manage-row-main">
                    <strong>{mod.name}</strong>
                    <span className="muted">
                      {mod.source} · {mod.fileName}
                      {!on ? ' · disabled' : ''}
                    </span>
                  </div>
                  <div className="manage-row-actions">
                    {contentKind === 'mods' ||
                    contentKind === 'bootstrap' ||
                    contentKind === 'translations' ? (
                      <label className="check-inline">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => void onToggleEnabled(mod)}
                        />
                        Active
                      </label>
                    ) : null}
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => void onRemove(mod)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <ContextMenu menu={menu} onClose={closeMenu} />
      </div>
    )
  }

  const providerOptions = (
    kindOnlyCurseForge
      ? ([['curseforge', 'CurseForge']] as const)
      : ([
          ['curseforge', 'CurseForge'],
          ['nexus', 'Nexus'],
          ['modtale', 'Modtale'],
          ['modifold', 'Modifold'],
          ['thunderstore', 'Thunderstore']
        ] as const)
  )

  return (
    <div className="mods">
      <div className="mods-toolbar">
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => {
            setSelected(null)
            setDetails(null)
            setView('installed')
            void refreshInstalled()
          }}
        >
          ← Installed
        </button>
        {providerOptions.length > 1 ? (
          <label className="mods-provider-field">
            <span className="sr-only">Provider</span>
            <select
              className="mods-sort mods-provider-select"
              value={source}
              onChange={(e) => setSource(e.target.value as ModSource)}
              aria-label="Mod provider"
            >
              {providerOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="mods-provider-label">{providerOptions[0][1]}</span>
        )}
        <form
          className="mods-search-inline"
          onSubmit={(e) => {
            e.preventDefault()
            void runSearch(query, 'replace')
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${kindLabel(contentKind).toLowerCase()}…`}
          />
          {source === 'curseforge' && categories.length > 0 ? (
            <select
              className="mods-sort"
              value={categoryId ?? ''}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : null
                setCategoryId(next)
                stateRef.current.categoryId = next
              }}
              aria-label="Filter category"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null}
          <select
            className="mods-sort"
            value={sort}
            onChange={(e) => {
              const next = e.target.value as ModSort
              setSort(next)
              stateRef.current.sort = next
              void runSearch(query, 'replace')
            }}
            aria-label="Sort"
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
        <div className="mods-toolbar-actions">
          <button className="btn" type="button" onClick={() => void onImportFile()}>
            Import file
          </button>
        </div>
      </div>

      {isNexus ? (
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

      {isCurseForge ? (
        <p className="mods-notice">
          CurseForge installs download straight into this instance (no browser). Pick a mod, choose a
          version, then Install.
        </p>
      ) : null}

      {source === 'modtale' || source === 'modifold' ? (
        <p className="mods-notice">
          Community catalog — installs download straight into this instance. Pick a version, then
          Install.
        </p>
      ) : null}

      {source === 'thunderstore' ? (
        <p className="mods-notice">
          Thunderstore packages are zip archives. Spire extracts the .jar into your mods folder on
          Install.
        </p>
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

      <div
        className={`mods-columns mods-columns-download${selected ? ' with-detail' : ''}${
          isResizingDetail ? ' is-resizing' : ''
        }`}
        style={
          {
            '--mods-detail-width': `${detailWidth}px`
          } as CSSProperties
        }
      >
        <div className="mods-results" ref={resultsRef}>
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
                  onContextMenu={(e) =>
                    openMenu(e, [
                      {
                        id: 'open',
                        label: 'Download options',
                        onSelect: () => setSelected(mod)
                      },
                      {
                        id: 'site',
                        label: 'Open on site',
                        onSelect: () => void window.spire.openExternal(mod.pageUrl)
                      }
                    ])
                  }
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
          <div ref={sentinelRef} className="mods-scroll-sentinel" aria-hidden />
          {loadingMore ? (
            <p className="muted mods-scroll-status">Loading more…</p>
          ) : null}
          {!loading && !loadingMore && results.length > 0 ? (
            <p className="muted mods-scroll-status">
              {hasMore
                ? `Showing ${results.length}${total > 0 ? ` of ${total}` : ''} — scroll for more`
                : `Showing ${results.length}${total > 0 ? ` of ${total}` : ''} mods`}
            </p>
          ) : null}
        </div>

        <div
          className="mods-split-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize mod list and details"
          aria-valuenow={Math.round(detailWidth)}
          tabIndex={0}
          onPointerDown={onResizeStart}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              setDetailWidth(detailWidth + 24)
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              setDetailWidth(detailWidth - 24)
            }
          }}
        />

        {selected && listing ? (
          <section className="mod-detail" aria-label="Download options" ref={detailRef}>
            <div className="mod-detail-header">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setSelected(null)
                  setDetails(null)
                }}
              >
                ← Results
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
              <p className="muted">Loading download options…</p>
            ) : (
              <>
                {details?.notice ? <p className="mods-notice">{details.notice}</p> : null}

                {details?.versions && details.versions.length > 0 ? (
                  <label className="field mod-version-field">
                    <span>Version</span>
                    <select
                      className="mod-version-select"
                      value={selectedFileId ?? details.versions[0]?.fileId ?? ''}
                      onChange={(e) => setSelectedFileId(e.target.value)}
                      aria-label="Choose mod version"
                    >
                      {details.versions.map((v) => {
                        const meta = [
                          v.releaseType,
                          v.fileDate ? new Date(v.fileDate).toLocaleDateString() : null
                        ]
                          .filter(Boolean)
                          .join(' · ')
                        return (
                          <option key={v.fileId} value={v.fileId}>
                            {v.displayName}
                            {meta ? ` — ${meta}` : ''}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                ) : (
                  <p className="muted" style={{ marginTop: 4 }}>
                    {isDirectInstall
                      ? 'Loading versions… If this stays empty, the project may have no published files yet.'
                      : 'Version list needs an API key when available; Download opens the site Files page.'}
                  </p>
                )}

                <h3 className="mod-detail-section">Download</h3>
                <div className="mod-detail-actions">
                  {isDirectInstall ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={Boolean(
                        installingId?.startsWith('quick:') || installingId?.startsWith('slow:')
                      )}
                      onClick={() => void onDownload(listing, 'quick', selectedFileId)}
                    >
                      {installingId?.startsWith('quick:') || installingId?.startsWith('slow:')
                        ? 'Installing…'
                        : 'Install'}
                    </button>
                  ) : (
                    <>
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
                            ? 'Premium CDN one-click when your Nexus API key allows it'
                            : 'Needs optional Nexus Premium API key'
                        }
                        disabled={!quickAvailable || Boolean(installingId?.startsWith('quick:'))}
                        onClick={() => void onDownload(listing, 'quick', selectedFileId)}
                      >
                        {installingId?.startsWith('quick:') ? '…' : 'Download quickly'}
                      </button>
                    </>
                  )}
                  <button className="btn" type="button" onClick={() => void onImportFile()}>
                    Import file
                  </button>
                </div>
                <DownloadProgressPanel progress={contentProgress} />

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

                <div className="mod-detail-section-row">
                  <h3 className="mod-detail-section">Description</h3>
                  <label className="field mod-desc-mode">
                    <span className="sr-only">Description format</span>
                    <select
                      value={descMode}
                      onChange={(e) => {
                        const next = e.target.value as RichContentMode
                        setDescMode(next)
                        try {
                          localStorage.setItem(DESC_MODE_KEY, next)
                        } catch {
                          // ignore
                        }
                      }}
                      title="How to render the description"
                    >
                      <option value="auto">Auto</option>
                      <option value="markdown">Markdown</option>
                      <option value="html">HTML</option>
                      <option value="plain">Plain text</option>
                    </select>
                  </label>
                </div>
                <RichContent
                  className="mod-description"
                  text={details?.description || listing.summary || ''}
                  mode={descMode}
                />
              </>
            )}
          </section>
        ) : (
          <aside className="mods-download-hint">
            <h2>Download options</h2>
            <p className="muted">
              Select a mod from the list to choose a version and download or install it into this
              instance.
            </p>
          </aside>
        )}
      </div>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  )
}
