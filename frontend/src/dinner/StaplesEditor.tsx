import { useEffect, useState, type CSSProperties } from 'react'
import { labelStyle, ghostBtnStyle } from '../lib/styles'
import { createStaple, deleteStaple, fetchStaples, updateStaple, type Staple, type StapleInput } from './lib/api'

const inputStyle: CSSProperties = {
  padding: '10px 8px',
  border: '1px solid #e5e7eb',
  borderRadius: 0,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  minWidth: 0,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 44,
  borderBottom: '1px solid #e5e7eb',
}

const EMPTY: StapleInput = { name: '', quantity: '', unit: '' }

const toInput = (s: Staple): StapleInput => ({ name: s.name, quantity: s.quantity ?? '', unit: s.unit ?? '' })

// The standing week-to-week list (coffee, yogurt). Changes show on every saved week's list.
export default function StaplesEditor({ onChange }: { onChange: () => void }) {
  const [staples, setStaples] = useState<Staple[]>([])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<StapleInput>(EMPTY)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStaples()
      .then(setStaples)
      .catch((e) => setError((e as Error).message))
  }, [])

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      setStaples(await fetchStaples())
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const save = () => {
    if (!draft.name.trim()) return
    run(async () => {
      await (editingId === null ? createStaple(draft) : updateStaple(editingId, draft))
      setDraft(EMPTY)
      setEditingId(null)
    })
  }

  const field = (key: keyof StapleInput, placeholder: string, style: CSSProperties) => (
    <input
      style={{ ...inputStyle, ...style }}
      placeholder={placeholder}
      value={draft[key]}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      onKeyDown={(e) => e.key === 'Enter' && save()}
    />
  )

  return (
    <div style={{ borderTop: '2px solid #111827', paddingTop: 12 }}>
      <button style={{ ...ghostBtnStyle, color: '#111827' }} onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Edit'} staples · {staples.length}
      </button>
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}>{error}</div>}
      {open && (
        <div style={{ marginTop: 8 }}>
          {staples.map((s) => (
            <div key={s.id} style={rowStyle}>
              <span style={{ flex: 1, fontSize: 14, color: editingId === s.id ? '#9ca3af' : '#111827', overflowWrap: 'anywhere' }}>
                {s.name}
                {(s.quantity || s.unit) && <span style={{ color: '#6b7280' }}> · {[s.quantity, s.unit].filter(Boolean).join(' ')}</span>}
              </span>
              <button
                style={{ ...ghostBtnStyle, padding: '12px 4px' }}
                onClick={() => {
                  setEditingId(s.id)
                  setDraft(toInput(s))
                }}
              >
                Edit
              </button>
              <button style={{ ...ghostBtnStyle, padding: '12px 4px' }} onClick={() => run(() => deleteStaple(s.id))}>
                Delete
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {field('quantity', 'Qty', { width: 56 })}
            {field('unit', 'Unit', { width: 72 })}
            {field('name', 'Staple, e.g. coffee', { flex: 1 })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <button style={{ ...ghostBtnStyle, color: '#111827', padding: '8px 0' }} onClick={save}>
              {editingId === null ? 'Add staple' : 'Save staple'}
            </button>
            {editingId !== null && (
              <button
                style={{ ...ghostBtnStyle, padding: '8px 0' }}
                onClick={() => {
                  setEditingId(null)
                  setDraft(EMPTY)
                }}
              >
                Cancel
              </button>
            )}
          </div>
          <span style={{ ...labelStyle, color: '#9ca3af', fontWeight: 600, marginTop: 8 }}>Added to every saved week's list</span>
        </div>
      )}
    </div>
  )
}
