import { useEffect, useState } from 'react'
import type { Module } from '../types'

interface Props {
  module: Module
  position: number
  onOpen?: () => void
}

const API_BASE = import.meta.env.VITE_API_BASE_URL

const TYPE_COLORS: Record<string, string> = {
  physical: '#7c3aed',
  conceptual: '#2563eb',
  applicable: '#16a34a',
}

const STATUS_COLORS: Record<string, string> = {
  locked: '#6b7280',
  active: '#d97706',
  completed: '#16a34a',
}

const STATUS_ICONS: Record<string, string> = {
  locked: '🔒',
  active: '▶',
  completed: '✓',
}

export default function ModuleCard({ module, position, onOpen }: Props) {
  const [artifactTypes, setArtifactTypes] = useState<string[]>([])

  useEffect(() => {
    if (!module.id) return
    fetch(`${API_BASE}/module/${module.id}/artifacts`)
      .then((r) => r.json())
      .then((d) =>
        setArtifactTypes(
          (d.artifacts ?? []).map((a: { type: string }) => a.type),
        ),
      )
      .catch(() => {})
  }, [module.id])

  const locked = module.status === 'locked'
  const typeColor = locked ? '#4b5563' : (TYPE_COLORS[module.type] ?? '#6b7280')
  const statusColor = locked
    ? '#4b5563'
    : (STATUS_COLORS[module.status] ?? '#6b7280')
  const statusIcon = STATUS_ICONS[module.status] ?? ''

  return (
    <div
      style={{ ...s.card, ...(onOpen ? { cursor: 'pointer' } : {}) }}
      onClick={onOpen}
    >
      <div style={{ ...s.header, ...(locked ? s.headerLocked : {}) }}>
        <span style={{ ...s.badge, ...(locked ? s.dimmed : {}) }}>
          Module {position}
        </span>
        <span style={{ ...s.typeBadge, background: typeColor }}>
          {module.type}
        </span>
        <h4 style={{ ...s.name, ...(locked ? s.dimmed : {}) }}>
          {module.name}
        </h4>
        <span style={{ ...s.statusChip, color: statusColor }}>
          {statusIcon} {module.status}
        </span>
      </div>
      <div style={{ ...s.body, ...(locked ? s.bodyLocked : {}) }}>
        <p style={s.description}>{module.description}</p>
        {artifactTypes.length > 0 && (
          <div style={s.artifactRow}>
            {artifactTypes.map((t, i) => (
              <span key={i} style={s.artifactChip}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid #111827',
    borderRadius: 0,
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    background: '#111827',
    borderBottom: '2px solid #111827',
    flexWrap: 'wrap',
  },
  badge: {
    fontSize: 10,
    fontWeight: 800,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    whiteSpace: 'nowrap',
  },
  typeBadge: {
    fontSize: 10,
    fontWeight: 800,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    padding: '2px 6px',
    borderRadius: 0,
    whiteSpace: 'nowrap',
  },
  name: { margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', flex: 1 },
  statusChip: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    whiteSpace: 'nowrap',
    color: '#9ca3af',
  },
  body: {
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  bodyLocked: {
    filter: 'blur(3px)',
    userSelect: 'none',
  },
  headerLocked: {
    background: '#374151',
    borderBottomColor: '#374151',
    filter: 'blur(.75px)',
  },
  dimmed: {
    color: '#8d8f92',
  },
  description: { margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 },
  artifactRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  artifactChip: {
    background: '#f3f4f6',
    color: '#374151',
    fontSize: 11,
    borderRadius: 0,
    padding: '2px 8px',
  },
}
