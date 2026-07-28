import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ModuleCard from './ModuleCard'
import ModuleModal from './ModuleModal'
import ScheduleCalendar from './ScheduleCalendar'
import type { Module, LessonPlan } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL

export default function Dashboard({
  onLessonComplete,
  onLearnNew,
}: {
  onLessonComplete?: (title: string) => void
  onLearnNew?: () => void
}) {
  const [plans, setPlans] = useState<LessonPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<LessonPlan | null>(null)
  const [selectedModules, setSelectedModules] = useState<Module[]>([])
  const [planCollapsed, setPlanCollapsed] = useState(true)
  const [planCopied, setPlanCopied] = useState(false)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedModule, setSelectedModule] = useState<Module | null>(null)
  const [sortBy, setSortBy] = useState<'date' | 'status'>('date')
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const sortedPlans =
    sortBy === 'date'
      ? plans
      : [...plans].sort((a, b) => {
          const aComplete = a.status === 'completed'
          const bComplete = b.status === 'completed'
          if (aComplete !== bComplete) return aComplete ? 1 : -1
          const aPct =
            a.total_modules > 0 ? a.completed_modules / a.total_modules : 0
          const bPct =
            b.total_modules > 0 ? b.completed_modules / b.total_modules : 0
          return bPct - aPct
        })

  async function fetchPlans() {
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/lesson-plans`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setPlans(data.plans)
    } catch {
      setError('Could not load plans. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlans()
  }, [])

  async function openPlan(plan: LessonPlan) {
    setSelectedPlan(plan)
    setSelectedModules([])
    setPlanCollapsed(true)
    try {
      const res = await fetch(`${API_BASE}/lesson-plan/${plan.id}/modules`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSelectedModules(data.modules ?? [])
    } catch {
      setError('Could not load modules.')
    }
  }

  function closePlan() {
    setSelectedPlan(null)
    setSelectedModules([])
    setPlanCollapsed(true)
  }

  const allModulesDone =
    selectedModules.length > 0 &&
    selectedModules.every((m) => m.status === 'completed')

  const viewerPct =
    selectedModules.length > 0
      ? selectedModules.filter((m) => m.status === 'completed').length / selectedModules.length
      : 0

  async function completePlan() {
    if (!selectedPlan) return
    try {
      const res = await fetch(`${API_BASE}/lesson-plan/${selectedPlan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      if (!res.ok) {
        setError('Could not complete lesson. Please try again.')
        return
      }
    } catch {
      setError('Could not complete lesson. Is the backend running?')
      return
    }
    const title = selectedPlan.title
    closePlan()
    onLessonComplete?.(title)
  }

  function copyPlan() {
    navigator.clipboard.writeText(selectedPlan?.plan ?? '')
    setPlanCopied(true)
    setTimeout(() => setPlanCopied(false), 2000)
  }

  async function deletePlan(id: number) {
    try {
      const res = await fetch(`${API_BASE}/lesson-plan/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setConfirmDeleteId(null)
      setPlans((prev) => prev.filter((p) => p.id !== id))
    } catch {
      setError('Could not delete plan.')
      setConfirmDeleteId(null)
    }
  }

  return (
    <div style={s.dashboard}>
      <section style={s.section}>
        <div style={s.sectionHeader}>
          <h2 style={s.sectionTitle}>Goals</h2>
          <div style={s.sortControls}>
            <button
              style={{
                ...s.sortBtn,
                ...(sortBy === 'date' ? s.sortBtnActive : {}),
              }}
              onClick={() => setSortBy('date')}
            >
              Date
            </button>
            <button
              style={{
                ...s.sortBtn,
                ...(sortBy === 'status' ? s.sortBtnActive : {}),
              }}
              onClick={() => setSortBy('status')}
            >
              Status
            </button>
          </div>
        </div>

        {error && (
          <div style={s.errorBar}>
            <span>{error}</span>
            <button style={s.errorDismiss} onClick={() => setError(null)}>
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div style={s.emptyBox}>
            <p style={s.empty}>Loading…</p>
          </div>
        ) : plans.length === 0 ? (
          <div style={s.emptyBox}>
            <p style={s.empty}>No goals yet.</p>
          </div>
        ) : (
          <div style={s.planList}>
            {sortedPlans.map((plan) => (
              <div
                key={plan.id}
                style={s.planCard}
                onMouseEnter={() => setHoveredId(plan.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div style={s.planCardHeader}>
                  <button
                    style={s.planCardInner}
                    onClick={() => openPlan(plan)}
                  >
                    <span style={s.planTitle}>{plan.title}</span>
                    <span
                      style={{
                        ...s.statusBadge,
                        ...(plan.status === 'completed'
                          ? s.statusCompleted
                          : s.statusActive),
                      }}
                    >
                      {plan.status}
                    </span>
                  </button>
                  {hoveredId === plan.id && confirmDeleteId !== plan.id && (
                    <button
                      style={s.deleteBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteId(plan.id)
                      }}
                      title="Delete"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {plan.total_modules > 0 && (
                  <div style={s.progressTrack}>
                    <div
                      style={{
                        ...s.progressFill,
                        width: `${(plan.completed_modules / plan.total_modules) * 100}%`,
                      }}
                    />
                  </div>
                )}
                <div style={s.planCardBody}>
                  <span style={s.planDate}>
                    {new Date(plan.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                {confirmDeleteId === plan.id && (
                  <div style={s.confirmRow}>
                    <span style={s.confirmText}>Delete this plan?</span>
                    <button
                      style={s.confirmYes}
                      onClick={() => deletePlan(plan.id)}
                    >
                      Yes
                    </button>
                    <button
                      style={s.confirmNo}
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <button
        style={s.learnBtn}
        onClick={onLearnNew}
      >
        + Learn something new
      </button>

      <section style={s.section}>
        <div style={{ ...s.sectionHeader, cursor: 'pointer' }} onClick={() => setScheduleOpen((o) => !o)}>
          <h2 style={s.sectionTitle}>Schedule</h2>
          <span style={{ ...s.chevron, transform: scheduleOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
        </div>
        {scheduleOpen && <ScheduleCalendar />}
      </section>

      {selectedModule && (
        <ModuleModal
          module={selectedModule}
          onClose={() => setSelectedModule(null)}
          onComplete={() => {
            setSelectedModule(null)
            openPlan(selectedPlan!)
          }}
        />
      )}

      {selectedPlan && (
        <div style={s.overlay} onClick={closePlan}>
          <div style={s.viewer} onClick={(e) => e.stopPropagation()}>
            <div style={s.viewerHeader}>
              <h3 style={s.viewerTitle}>{selectedPlan.title}</h3>
              <div style={s.viewerHeaderRight}>
                <span
                  style={{
                    ...s.statusBadge,
                    ...(selectedPlan.status === 'completed'
                      ? s.statusCompleted
                      : s.statusActive),
                  }}
                >
                  {selectedPlan.status}
                </span>
                <button style={s.closeBtn} onClick={closePlan}>
                  ✕
                </button>
              </div>
            </div>
            {selectedModules.length > 0 && (
              <div style={s.progressTrack}>
                <div style={{ ...s.progressFill, width: `${viewerPct * 100}%` }} />
              </div>
            )}
            <div style={s.viewerBody}>
              <div style={s.planHeader}>
                <button
                  style={s.collapseBtn}
                  onClick={() => setPlanCollapsed((c) => !c)}
                >
                  <span
                    style={{
                      ...s.chevron,
                      transform: planCollapsed
                        ? 'rotate(-90deg)'
                        : 'rotate(0deg)',
                    }}
                  >
                    ▾
                  </span>
                  Agent instructions
                </button>
                <button style={s.copyBtn} onClick={copyPlan}>
                  {planCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              {!planCollapsed && (
                <div style={s.planSection}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedPlan.plan}
                  </ReactMarkdown>
                </div>
              )}
              {selectedModules.length > 0 && (
                <div style={s.modulesSection}>
                  <p style={s.modulesSectionTitle}>Modules</p>
                  {selectedModules.map((m, i) => (
                    <ModuleCard
                      key={m.id ?? i}
                      module={m}
                      position={i + 1}
                      onOpen={
                        m.status !== 'locked'
                          ? () => setSelectedModule(m)
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
              {allModulesDone && selectedPlan?.status !== 'completed' && (
                <div style={s.completePlanRow}>
                  <button style={s.completePlanBtn} onClick={completePlan}>
                    Complete Lesson →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  dashboard: {
    flex: 1,
    minHeight: 0,
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    overflowY: 'auto',
  },
  section: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
  errorBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderRadius: 0,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    fontSize: 13,
    color: '#991b1b',
  },
  errorDismiss: {
    border: 'none',
    background: 'transparent',
    color: '#991b1b',
    cursor: 'pointer',
    fontSize: 13,
    padding: '0 4px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottom: '2px solid #111827',
  },
  sortControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  sortBtn: {
    fontSize: 10,
    fontWeight: 800,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.14em',
    color: '#9ca3af',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
  sortBtnActive: {
    color: '#111827',
  },
  sectionTitle: {
    margin: 0,
    fontSize: 10,
    fontWeight: 800,
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
  },
  emptyBox: {
    minHeight: 80,
    border: '1px solid #e5e7eb',
    borderRadius: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { margin: 0, fontSize: 13, color: '#9ca3af' },
  planList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  planCard: {
    border: '1px solid #111827',
    borderRadius: 0,
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    overflow: 'hidden',
  },
  planCardHeader: {
    display: 'flex',
    alignItems: 'stretch',
    background: '#111827',
    borderBottom: '2px solid #111827',
  },
  planCardInner: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '9px 14px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  planCardBody: {
    padding: '8px 14px',
  },
  planTitle: { fontSize: 13, fontWeight: 700, color: '#fff' },
  statusBadge: {
    fontSize: 10,
    fontWeight: 800,
    padding: '1px 6px',
    borderRadius: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    whiteSpace: 'nowrap',
  },
  statusActive: {
    background: 'transparent',
    color: '#6ee7b7',
    outline: '1px solid #6ee7b7',
  },
  statusCompleted: {
    background: 'transparent',
    color: '#93c5fd',
    outline: '1px solid #93c5fd',
  },
  planDate: { fontSize: 12, color: '#6b7280' },
  deleteBtn: {
    padding: '0 14px',
    alignSelf: 'stretch',
    border: 'none',
    borderLeft: '1px solid #374151',
    background: 'transparent',
    color: '#6b7280',
    fontSize: 13,
    cursor: 'pointer',
  },
  confirmRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: '#fff7ed',
    borderLeft: '1px solid #fed7aa',
    whiteSpace: 'nowrap',
  },
  confirmText: { fontSize: 13, color: '#92400e' },
  confirmYes: {
    padding: '4px 10px',
    borderRadius: 0,
    border: 'none',
    background: '#ef4444',
    color: '#fff',
    fontWeight: 600,
    fontSize: 12,
    cursor: 'pointer',
  },
  confirmNo: {
    padding: '4px 10px',
    borderRadius: 0,
    border: '1px solid #d1d5db',
    background: 'transparent',
    fontWeight: 600,
    fontSize: 12,
    cursor: 'pointer',
    color: '#374151',
  },
  learnBtn: {
    alignSelf: 'flex-start',
    padding: '4px 0',
    border: 'none',
    background: 'transparent',
    color: '#9ca3af',
    fontWeight: 400,
    fontSize: 13,
    cursor: 'pointer',
  },
  // Plan viewer modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  viewer: {
    background: '#fff',
    borderRadius: 0,
    width: 600,
    height: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
    overflow: 'hidden',
  },
  viewerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    background: '#111827',
    borderBottom: '2px solid #111827',
    flexShrink: 0,
  },
  viewerHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  viewerTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.01em',
  },
  closeBtn: {
    border: 'none',
    background: 'transparent',
    fontSize: 16,
    cursor: 'pointer',
    color: '#9ca3af',
    padding: '4px 8px',
    borderRadius: 0,
  },
  progressTrack: {
    height: 3,
    background: '#e5e7eb',
    flexShrink: 0,
  },
  progressFill: {
    height: '100%',
    background: '#111827',
  },
  viewerBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
    fontSize: 14,
    lineHeight: 1.7,
    color: '#111827',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  planHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexShrink: 0,
  },
  collapseBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: 0,
  },
  chevron: {
    fontSize: 14,
    display: 'inline-block',
    transition: 'transform 0.15s ease',
    color: '#9ca3af',
  },
  copyBtn: {
    padding: '3px 10px',
    borderRadius: 0,
    border: '1px solid #d1d5db',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
  },
  planSection: {
    maxHeight: 300,
    overflowY: 'auto',
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: 16,
    marginBottom: 16,
    flexShrink: 0,
  },
  modulesSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingBottom: 8,
  },
  modulesSectionTitle: {
    margin: '0 0 8px 0',
    fontSize: 10,
    fontWeight: 800,
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    paddingBottom: 8,
    borderBottom: '2px solid #111827',
  },
  completePlanRow: {
    marginTop: 16,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  completePlanBtn: {
    padding: '8px 18px',
    borderRadius: 0,
    border: 'none',
    background: '#16a34a',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
}
