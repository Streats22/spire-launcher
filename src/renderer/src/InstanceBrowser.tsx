import { useMemo, useState, type MouseEvent } from 'react'
import type { InstanceGroup, SpireHomeLayout, SpireInstance } from '../../shared/types'
import spireLogo from './assets/spire-logo.png'

const DRAG_MIME = 'application/x-spire-instance'

interface InstanceBrowserProps {
  instances: SpireInstance[]
  groups: InstanceGroup[]
  activeId: string | null
  homeLayout: SpireHomeLayout
  busy: boolean
  onSelect: (id: string) => void
  onLaunch: (id: string) => void
  onContextMenu: (e: MouseEvent, instance: SpireInstance) => void
  onCreateInstance: () => void
  onImportPack: () => void
  onChanged: () => Promise<void>
  onToast: (message: string) => void
  onOpenInstall: () => void
}

interface DropTarget {
  groupId: string | null
  index: number
}

function sortGroups(groups: InstanceGroup[]): InstanceGroup[] {
  return [...groups].sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name))
}

function instancesInGroup(instances: SpireInstance[], groupId: string | null): SpireInstance[] {
  return instances
    .filter((i) => (i.groupId ?? null) === groupId)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0) || a.name.localeCompare(b.name))
}

export default function InstanceBrowser({
  instances,
  groups,
  activeId,
  homeLayout,
  busy,
  onSelect,
  onLaunch,
  onContextMenu,
  onCreateInstance,
  onImportPack,
  onChanged,
  onToast,
  onOpenInstall
}: InstanceBrowserProps): React.JSX.Element {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('New group')

  const orderedGroups = useMemo(() => sortGroups(groups), [groups])
  const knownGroupIds = useMemo(() => new Set(orderedGroups.map((g) => g.id)), [orderedGroups])

  const orphaned = useMemo(
    () =>
      instances.filter(
        (i) => i.groupId != null && i.groupId !== '' && !knownGroupIds.has(i.groupId)
      ),
    [instances, knownGroupIds]
  )

  const sections = useMemo(() => {
    const rows: Array<{ groupId: string | null; title: string; items: SpireInstance[] }> = []
    for (const g of orderedGroups) {
      rows.push({
        groupId: g.id,
        title: g.name,
        items: instancesInGroup(instances, g.id)
      })
    }
    const ungrouped = [
      ...instancesInGroup(instances, null),
      ...orphaned
    ].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0) || a.name.localeCompare(b.name))

    // Hide empty Ungrouped when real groups exist; keep a section when there are no groups.
    if (orderedGroups.length === 0) {
      rows.push({ groupId: null, title: 'Instances', items: ungrouped })
    } else if (ungrouped.length > 0) {
      rows.push({ groupId: null, title: 'Ungrouped', items: ungrouped })
    }
    return rows
  }, [instances, orderedGroups, orphaned])

  async function applyDrop(target: DropTarget): Promise<void> {
    if (!dragId) return
    if (!instances.some((i) => i.id === dragId)) return

    const byGroup = new Map<string | null, string[]>()
    for (const g of orderedGroups) {
      byGroup.set(
        g.id,
        instancesInGroup(instances, g.id)
          .map((i) => i.id)
          .filter((id) => id !== dragId)
      )
    }
    byGroup.set(
      null,
      [
        ...instancesInGroup(instances, null).map((i) => i.id),
        ...orphaned.map((i) => i.id)
      ].filter((id) => id !== dragId)
    )

    const dest = [...(byGroup.get(target.groupId) ?? [])]
    const index = Math.max(0, Math.min(target.index, dest.length))
    dest.splice(index, 0, dragId)
    byGroup.set(target.groupId, dest)

    const items = [...byGroup.entries()].flatMap(([groupId, ids]) =>
      ids.map((id, sortIndex) => ({ id, groupId, sortIndex }))
    )
    await window.spire.organizeInstances(items)
    await onChanged()
  }

  async function onAddGroup(): Promise<void> {
    const name = newGroupName.trim()
    if (!name) {
      onToast('Enter a group name.')
      return
    }
    setAddingGroup(false)
    setNewGroupName('New group')
    await window.spire.createInstanceGroup(name)
    await onChanged()
    onToast('Group created')
  }

  function startAddGroup(): void {
    setAddingGroup(true)
    setNewGroupName('New group')
    setRenamingGroupId(null)
  }

  function cancelAddGroup(): void {
    setAddingGroup(false)
    setNewGroupName('New group')
  }

  async function onRenameGroup(group: InstanceGroup): Promise<void> {
    const next = renameValue.trim()
    setRenamingGroupId(null)
    if (!next || next === group.name) return
    await window.spire.renameInstanceGroup(group.id, next)
    await onChanged()
  }

  async function onDeleteGroup(group: InstanceGroup): Promise<void> {
    if (
      !confirm(
        `Delete group “${group.name}”? Instances move to Ungrouped (they are not deleted).`
      )
    ) {
      return
    }
    await window.spire.deleteInstanceGroup(group.id)
    await onChanged()
    onToast('Group removed')
  }

  const layoutClass =
    homeLayout === 'list' ? 'instance-grid layout-list' : 'instance-grid'

  const toolbar = (
    <div className="group-header">
      <div className="group-label">Instances</div>
      <div className="group-header-actions">
        {addingGroup ? (
          <>
            <input
              className="group-rename-input"
              autoFocus
              value={newGroupName}
              disabled={busy}
              aria-label="Group name"
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onAddGroup()
                if (e.key === 'Escape') cancelAddGroup()
              }}
            />
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => void onAddGroup()}
            >
              Create
            </button>
            <button className="btn" type="button" disabled={busy} onClick={cancelAddGroup}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn" type="button" disabled={busy} onClick={startAddGroup}>
            Add group
          </button>
        )}
        <button
          className="btn"
          type="button"
          disabled={busy || addingGroup}
          onClick={onImportPack}
        >
          Import pack…
        </button>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy || addingGroup}
          onClick={onCreateInstance}
        >
          Add Instance
        </button>
      </div>
    </div>
  )

  if (instances.length === 0 && orderedGroups.length === 0) {
    return (
      <div className="instance-view">
        {toolbar}
        <div className="empty-state">
          <p style={{ margin: '0 0 8px', color: 'var(--ink)', fontWeight: 600 }}>
            No instances yet
          </p>
          <p style={{ margin: '0 0 14px' }}>
            Create a profile, then install the full client under Install (or point Settings at an
            official install).
          </p>
          <div className="row">
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={onCreateInstance}
            >
              Add Instance
            </button>
            <button className="btn" type="button" disabled={busy} onClick={onImportPack}>
              Import pack…
            </button>
            <button className="btn" type="button" onClick={onOpenInstall}>
              Install
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="instance-view">
      {toolbar}
      <p className="muted instance-dnd-hint">
        Drag instances to reorder or move between groups. They sit side by side in grid layout.
      </p>

      {sections.map((section) => {
        const groupMeta =
          section.groupId == null
            ? null
            : orderedGroups.find((g) => g.id === section.groupId) ?? null
        const isDropSection =
          dropTarget?.groupId === section.groupId ||
          (dropTarget?.groupId == null && section.groupId == null)

        return (
          <section
            key={section.groupId ?? '__ungrouped'}
            className={`instance-group${isDropSection ? ' is-drop-target' : ''}`}
            onDragOver={(e) => {
              if (![...e.dataTransfer.types].includes(DRAG_MIME)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              const items = section.items.filter((i) => i.id !== dragId)
              setDropTarget({ groupId: section.groupId, index: items.length })
            }}
            onDrop={(e) => {
              e.preventDefault()
              const target = dropTarget ?? {
                groupId: section.groupId,
                index: section.items.length
              }
              void applyDrop(target).finally(() => {
                setDragId(null)
                setDropTarget(null)
              })
            }}
          >
            {orderedGroups.length > 0 || groupMeta ? (
              <div className="group-header instance-group-header">
                {renamingGroupId && groupMeta && renamingGroupId === groupMeta.id ? (
                  <input
                    className="group-rename-input"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void onRenameGroup(groupMeta)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void onRenameGroup(groupMeta)
                      if (e.key === 'Escape') setRenamingGroupId(null)
                    }}
                  />
                ) : (
                  <div className="group-label">{section.title}</div>
                )}
                {groupMeta ? (
                  <div className="group-header-actions">
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => {
                        setRenamingGroupId(groupMeta.id)
                        setRenameValue(groupMeta.name)
                      }}
                    >
                      Rename
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => void onDeleteGroup(groupMeta)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className={layoutClass}>
              {section.items.map((instance, index) => {
                const showGap =
                  dropTarget?.groupId === section.groupId &&
                  dropTarget.index === index &&
                  dragId != null &&
                  dragId !== instance.id
                return (
                  <div key={instance.id} className="instance-slot">
                    {showGap ? <div className="instance-drop-gap" aria-hidden /> : null}
                    <button
                      type="button"
                      draggable
                      className={`instance-card${activeId === instance.id ? ' selected' : ''}${
                        dragId === instance.id ? ' is-dragging' : ''
                      }`}
                      onClick={() => onSelect(instance.id)}
                      onDoubleClick={() => {
                        onSelect(instance.id)
                        onLaunch(instance.id)
                      }}
                      onContextMenu={(e) => onContextMenu(e, instance)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_MIME, instance.id)
                        e.dataTransfer.effectAllowed = 'move'
                        setDragId(instance.id)
                      }}
                      onDragEnd={() => {
                        setDragId(null)
                        setDropTarget(null)
                      }}
                      onDragOver={(e) => {
                        if (![...e.dataTransfer.types].includes(DRAG_MIME)) return
                        e.preventDefault()
                        e.stopPropagation()
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const mid =
                          homeLayout === 'list'
                            ? rect.top + rect.height / 2
                            : rect.left + rect.width / 2
                        const after =
                          homeLayout === 'list' ? e.clientY > mid : e.clientX > mid
                        setDropTarget({
                          groupId: section.groupId,
                          index: after ? index + 1 : index
                        })
                      }}
                    >
                      <img className="instance-icon" src={spireLogo} alt="" draggable={false} />
                      <span className="instance-card-body">
                        <span className="instance-card-name">{instance.name}</span>
                        <span className="instance-card-meta muted">
                          {instance.channel}
                          {instance.gameVersion ? ` · ${instance.gameVersion}` : ''}
                        </span>
                      </span>
                    </button>
                  </div>
                )
              })}
              {section.items.length === 0 ? (
                <div className="instance-group-empty muted">
                  Drop instances here{section.groupId ? '' : ' — or add a new one'}
                </div>
              ) : null}
              {dropTarget?.groupId === section.groupId &&
              dropTarget.index >= section.items.filter((i) => i.id !== dragId).length ? (
                <div className="instance-drop-gap" aria-hidden />
              ) : null}
            </div>
          </section>
        )
      })}
    </div>
  )
}
