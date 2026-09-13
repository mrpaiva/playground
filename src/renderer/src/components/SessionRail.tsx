import type { JSX, MouseEvent } from 'react'
import type { AgentDef } from '../../../shared/agents'
import type { SessionView } from '../../../shared/config'
import type { PinnedTaskView } from '../../../shared/tasks'
import type { WorkspaceNode } from '../../../shared/tree'
import { agentTileStyle } from '../lib/agent-color'
import {
  buildRailGroups,
  statusClass,
  type RailGroup,
  type RailRow,
  type RowAction
} from '../lib/rail-groups'
import { badgeTypeOf, stateClass, typeClass } from '../lib/task-pills'
import { Icon } from './Icon'
import './SessionRail.css'

/** Above this many live sessions the rail warns about resource use (AGCF-06). */
const CONCURRENCY_WARN_AT = 4

interface SessionRailProps {
  sessions: SessionView[]
  tree: WorkspaceNode[]
  agents: AgentDef[]
  tasks: PinnedTaskView[]
  selectedId: string | null
  onSelect: (id: string) => void
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
  onNew: () => void
}

/** 344px master list (rail v2): header + one card per task group, one row per
 *  session. Every label, status, tooltip and action set comes from
 *  `buildRailGroups` — this component decides nothing. */
export function SessionRail({
  sessions,
  tree,
  agents,
  tasks,
  selectedId,
  onSelect,
  onStop,
  onRespawn,
  onRemove,
  onNew
}: SessionRailProps): JSX.Element {
  const runningCount = sessions.filter((s) => s.status === 'running').length
  const groups = buildRailGroups(sessions, tree, tasks)

  return (
    <aside className="session-rail">
      <header className="session-rail-header">
        <div className="session-rail-title-row">
          <span className="session-rail-title">AGENTS</span>
          <span className="session-rail-count">{runningCount} running</span>
        </div>
        <button type="button" className="session-rail-new" onClick={onNew}>
          <Icon name="plus" size={14} strokeWidth={2.2} /> New session
        </button>
      </header>
      {runningCount >= CONCURRENCY_WARN_AT && (
        <div className="session-rail-warning" role="status">
          <Icon name="alert" size={14} />
          <span>{runningCount} live sessions — each is a real OS process consuming resources.</span>
        </div>
      )}
      <div className="session-rail-list">
        {groups.length === 0 ? (
          <div className="session-rail-empty">No sessions yet.</div>
        ) : (
          groups.map((group) => (
            <TaskGroupCard
              key={group.key}
              group={group}
              agents={agents}
              selectedId={selectedId}
              onSelect={onSelect}
              onStop={onStop}
              onRespawn={onRespawn}
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </aside>
  )
}

interface TaskGroupCardProps {
  group: RailGroup
  agents: AgentDef[]
  selectedId: string | null
  onSelect: (id: string) => void
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
}

/** One group card: a header variant plus its rows. The card itself is never
 *  clickable — only its rows are (handoff §4.1). */
function TaskGroupCard({
  group,
  agents,
  selectedId,
  onSelect,
  onStop,
  onRespawn,
  onRemove
}: TaskGroupCardProps): JSX.Element {
  const holdsSelection = group.rows.some((row) => row.id === selectedId)

  return (
    <div className={`rail-group${holdsSelection ? ' selected' : ''}`}>
      {group.kind === 'task' ? (
        <div className="rail-group-header" title={group.branch}>
          <div className="rail-group-head-row">
            {group.details && (
              <span className={`task-pill ${typeClass(badgeTypeOf(group.details))}`}>
                <span className="task-pill-dot" />
                {badgeTypeOf(group.details)}
              </span>
            )}
            <span className="rail-group-id">#{group.taskId}</span>
            <span className="rail-group-spacer" />
            {group.details && (
              <span className={`task-pill ${stateClass(group.details.state)}`}>
                {group.details.state}
              </span>
            )}
          </div>
          {group.details ? (
            <span className="rail-group-title">{group.details.title}</span>
          ) : (
            <span className="rail-group-branch">{group.branch}</span>
          )}
        </div>
      ) : (
        <div className="rail-group-header" title={group.label}>
          <div className="rail-group-head-row">
            <Icon name="git-fork" size={12} />
            <span className="rail-group-name">{group.label}</span>
          </div>
          <span className={`rail-group-note ${group.reason}`}>{group.note}</span>
        </div>
      )}
      <div className="rail-group-rows">
        {group.rows.map((row) => (
          <SessionRow
            key={row.id}
            row={row}
            agents={agents}
            selected={row.id === selectedId}
            onSelect={onSelect}
            onStop={onStop}
            onRespawn={onRespawn}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  )
}

interface SessionRowProps {
  row: RailRow
  agents: AgentDef[]
  selected: boolean
  onSelect: (id: string) => void
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
}

/** Icon, glyph size and tooltip verb for each action the model can list. */
const ACTION_ICON = {
  stop: { name: 'stop-square', size: 10, verb: 'Stop' },
  respawn: { name: 'refresh', size: 12, verb: 'Respawn' },
  remove: { name: 'trash', size: 12, verb: 'Remove' }
} as const

function SessionRow({
  row,
  agents,
  selected,
  onSelect,
  onStop,
  onRespawn,
  onRemove
}: SessionRowProps): JSX.Element {
  const handlers: Record<RowAction, (id: string) => void> = {
    stop: onStop,
    respawn: onRespawn,
    remove: onRemove
  }

  // Action buttons live inside the selection control, so every one of them
  // stops the click from reaching the row (RAIL-17).
  const act = (event: MouseEvent, fn: () => void): void => {
    event.stopPropagation()
    fn()
  }

  return (
    <div
      className={`rail-row${selected ? ' selected' : ''}`}
      title={row.tooltip}
      onClick={() => onSelect(row.id)}
    >
      <span className="rail-row-tile" style={agentTileStyle(agents, row.session.agent)}>
        {row.session.agent.charAt(0)}
      </span>
      <span className="rail-row-label">{row.label}</span>
      <span className={`rail-row-status ${statusClass(row.status)}`}>{row.status}</span>
      <span className={`rail-row-dot ${statusClass(row.status)}`} />
      <span className="rail-row-actions">
        {row.actions.map((action) => (
          <button
            key={action}
            type="button"
            className={`rail-row-btn${action === 'remove' ? ' red' : ''}`}
            title={`${ACTION_ICON[action].verb} ${row.label}`}
            onClick={(e) => act(e, () => handlers[action](row.id))}
          >
            <Icon name={ACTION_ICON[action].name} size={ACTION_ICON[action].size} />
          </button>
        ))}
      </span>
    </div>
  )
}
