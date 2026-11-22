import { useState, type CSSProperties } from 'react'
import { labelStyle, ghostBtnStyle } from '../lib/styles'
import type { TagCategory } from './lib/api'

const metaStyle: CSSProperties = { fontSize: 11, color: '#6b7280' }

// Narrow what Generate / Fill / Swap may pick. Per category: none ticked = anything goes;
// several ticked = any of them. `selected` is this week's draft; `defaults` the standing picks.
export default function PreferencesDrawer({
  categories,
  selected,
  defaults,
  busy,
  onChange,
  onSaveDefault,
}: {
  categories: TagCategory[]
  selected: number[]
  defaults: number[]
  busy: boolean
  onChange: (ids: number[]) => void
  onSaveDefault: () => void
}) {
  const [open, setOpen] = useState(false)
  const shown = new Set(categories.flatMap((c) => c.tags.map((t) => t.id)))
  const active = selected.filter((id) => shown.has(id))
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id))
  const isDefault = same(active, defaults.filter((id) => shown.has(id)))
  const toggle = (id: number) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 0 }}>
      <button
        style={{ ...ghostBtnStyle, color: '#111827', width: '100%', padding: '10px 12px', display: 'flex', justifyContent: 'space-between' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          Preferences · {active.length ? `${active.length} active` : 'none'}
          {!isDefault && <span style={{ color: '#9ca3af' }}> · this week only</span>}
        </span>
        <span>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {categories.map((c) => (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>{c.name}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                {c.tags.map((t) => (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      style={{ borderRadius: 0, margin: 0 }}
                      checked={selected.includes(t.id)}
                      onChange={() => toggle(t.id)}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {categories.length === 0 && <span style={metaStyle}>No tag categories yet — add some under Manage tags.</span>}
          <span style={metaStyle}>Nothing ticked in a category means any recipe goes. Manual picks ignore preferences.</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <button style={{ ...ghostBtnStyle, color: isDefault ? '#d1d5db' : '#111827' }} disabled={busy || isDefault} onClick={onSaveDefault}>
              Save as default
            </button>
            <button style={{ ...ghostBtnStyle, ...(isDefault && { color: '#d1d5db' }) }} disabled={busy || isDefault} onClick={() => onChange(defaults)}>
              Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
