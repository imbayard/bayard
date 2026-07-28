import { useState, useEffect } from 'react'
import type { AllModule } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toLocalDatetimeString(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toTimeString(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  slotStart: Date
  slotEnd: Date
  onSaved: () => void
  onClose: () => void
}

export default function EventModal({ slotStart, slotEnd, onSaved, onClose }: Props) {
  const [mode, setMode] = useState<'module' | 'habit'>('module')

  // Module block fields
  const [modules, setModules] = useState<AllModule[]>([])
  const [moduleId, setModuleId] = useState<number | ''>('')
  const [blockStart, setBlockStart] = useState(toLocalDatetimeString(slotStart))
  const [blockEnd, setBlockEnd] = useState(toLocalDatetimeString(slotEnd))

  // Habit fields
  const [habitTitle, setHabitTitle] = useState('')
  const [days, setDays] = useState<number[]>([])
  const [habitTime, setHabitTime] = useState(toTimeString(slotStart))
  const [duration, setDuration] = useState(60)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/modules`)
      .then((r) => r.json())
      .then((d) => setModules(d.modules))
      .catch(() => setError('Could not load modules.'))
  }, [])

  function toggleDay(i: number) {
    setDays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i])
  }

  async function save() {
    setError(null)
    setSaving(true)
    try {
      if (mode === 'module') {
        if (!moduleId) { setError('Select a module.'); setSaving(false); return }
        const res = await fetch(`${API_BASE}/calendar/module-blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module_id: moduleId, start_time: blockStart, end_time: blockEnd }),
        })
        if (!res.ok) throw new Error()
      } else {
        if (!habitTitle.trim()) { setError('Enter a title.'); setSaving(false); return }
        if (days.length === 0) { setError('Select at least one day.'); setSaving(false); return }
        const res = await fetch(`${API_BASE}/calendar/habits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: habitTitle.trim(), days_of_week: days, start_time: habitTime, duration_minutes: duration }),
        })
        if (!res.ok) throw new Error()
      }
      onSaved()
    } catch {
      setError('Could not save. Is the backend running?')
    } finally {
      setSaving(false)
    }
  }

  // Group modules by plan for the dropdown
  const byPlan: Record<string, AllModule[]> = {}
  for (const m of modules) {
    if (!byPlan[m.plan_title]) byPlan[m.plan_title] = []
    byPlan[m.plan_title].push(m)
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.headerTitle}>Add Event</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.tabs}>
          <button style={{ ...s.tab, ...(mode === 'module' ? s.tabActive : {}) }} onClick={() => setMode('module')}>Module Block</button>
          <button style={{ ...s.tab, ...(mode === 'habit' ? s.tabActive : {}) }} onClick={() => setMode('habit')}>Habit</button>
        </div>

        <div style={s.body}>
          {mode === 'module' ? (
            <>
              <label style={s.label}>Module</label>
              <select style={s.select} value={moduleId} onChange={(e) => setModuleId(Number(e.target.value))}>
                <option value="">— select —</option>
                {Object.entries(byPlan).map(([plan, mods]) => (
                  <optgroup key={plan} label={plan}>
                    {mods.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <label style={s.label}>Start</label>
              <input style={s.input} type="datetime-local" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
              <label style={s.label}>End</label>
              <input style={s.input} type="datetime-local" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
            </>
          ) : (
            <>
              <label style={s.label}>Title</label>
              <input style={s.input} type="text" value={habitTitle} onChange={(e) => setHabitTitle(e.target.value)} placeholder="e.g. Morning run" />
              <label style={s.label}>Days</label>
              <div style={s.dayRow}>
                {DAYS.map((d, i) => (
                  <button
                    key={d}
                    style={{ ...s.dayBtn, ...(days.includes(i) ? s.dayBtnActive : {}) }}
                    onClick={() => toggleDay(i)}
                  >
                    {d.slice(0, 1)}
                  </button>
                ))}
              </div>
              <label style={s.label}>Time</label>
              <input style={s.input} type="time" value={habitTime} onChange={(e) => setHabitTime(e.target.value)} />
              <label style={s.label}>Duration (minutes)</label>
              <input style={s.input} type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </>
          )}

          {error && <p style={s.error}>{error}</p>}
        </div>

        <div style={s.footer}>
          <button style={s.saveBtn} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Add Event'}
          </button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modal: {
    background: '#fff',
    width: 360,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#111827',
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: 800,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
  },
  closeBtn: {
    border: 'none',
    background: 'transparent',
    color: '#9ca3af',
    fontSize: 14,
    cursor: 'pointer',
    padding: '2px 4px',
  },
  tabs: {
    display: 'flex',
    borderBottom: '2px solid #111827',
  },
  tab: {
    flex: 1,
    padding: '9px 0',
    border: 'none',
    background: '#f9fafb',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#9ca3af',
    cursor: 'pointer',
  },
  tabActive: {
    background: '#fff',
    color: '#111827',
  },
  body: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#6b7280',
    marginTop: 6,
  },
  input: {
    padding: '7px 10px',
    border: '1px solid #e5e7eb',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    padding: '7px 10px',
    border: '1px solid #e5e7eb',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    background: '#fff',
  },
  dayRow: {
    display: 'flex',
    gap: 4,
  },
  dayBtn: {
    flex: 1,
    padding: '6px 0',
    border: '1px solid #e5e7eb',
    background: '#fff',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    color: '#6b7280',
  },
  dayBtnActive: {
    background: '#111827',
    color: '#fff',
    border: '1px solid #111827',
  },
  error: {
    margin: '4px 0 0',
    fontSize: 12,
    color: '#dc2626',
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  saveBtn: {
    padding: '8px 18px',
    background: '#111827',
    color: '#fff',
    border: 'none',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    cursor: 'pointer',
  },
}
