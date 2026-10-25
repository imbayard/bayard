import { useEffect, useState, type CSSProperties } from 'react'
import { labelStyle, primaryBtnStyle, ghostBtnStyle } from '../lib/styles'
import {
  deleteLeftover,
  fetchPlan,
  fetchPlans,
  generatePlan,
  moveLeftover,
  pickRecipe,
  savePlan,
  swapDinner,
  type Meal,
  type PlanSlot,
  type Recipe,
  type SavedPlan,
} from './lib/api'

// Window: Sunday dinner (day 0) → the following Sunday's lunch (day 7).
const blankSlots = (): PlanSlot[] => [
  ...[0, 1, 2, 3, 4, 5, 6].map((day) => blankSlot(day, 'dinner')),
  ...[1, 2, 3, 4, 5, 6, 7].map((day) => blankSlot(day, 'lunch')),
]

function blankSlot(day: number, meal: Meal): PlanSlot {
  return { day, meal, servings: 0, recipe_id: null, source: null, source_day: null, batch_servings: null, flagged: false }
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d
}

// Today if it's Sunday, otherwise the next one.
function upcomingSunday() {
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return isoDate(d)
}

function dayLabel(weekStart: string, day: number) {
  const d = addDays(weekStart, day)
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`
}

const cellStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 0,
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
  fontSize: 13,
}

const servingsInputStyle: CSSProperties = {
  width: 48,
  padding: '2px 4px',
  border: '1px solid #e5e7eb',
  borderRadius: 0,
  fontSize: 12,
  fontFamily: 'inherit',
}

const metaStyle: CSSProperties = { fontSize: 11, color: '#6b7280' }

export default function MealPlanner({ recipes }: { recipes: Recipe[] }) {
  const [weekStart, setWeekStart] = useState(upcomingSunday)
  const [slots, setSlots] = useState<PlanSlot[]>(blankSlots)
  const [saved, setSaved] = useState<SavedPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const [leftoverDay, setLeftoverDay] = useState<number | null>(null)
  const [moving, setMoving] = useState(false)

  const byId = new Map(recipes.map((r) => [r.id, r]))
  const slot = (day: number, meal: Meal) => slots.find((s) => s.day === day && s.meal === meal)
  const hasPicks = slots.some((s) => s.recipe_id !== null)
  const hasEmpties = slots.some((s) => s.servings > 0 && s.recipe_id === null)

  // The grid starts blank every time; a saved plan for the week is offered, not auto-loaded.
  useEffect(() => {
    fetchPlans(weekStart)
      .then((plans) => setSaved(plans[0] ?? null))
      .catch(() => {})
  }, [weekStart])

  const shiftWeek = (days: number) => {
    setWeekStart(isoDate(addDays(weekStart, days)))
    setSlots(blankSlots())
    setSaved(null)
    setPicking(null)
    setError(null)
  }

  const run = async (action: () => Promise<PlanSlot[]>) => {
    setBusy(true)
    setError(null)
    try {
      setSlots(await action())
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const setServings = (day: number, meal: Meal, value: string) => {
    const servings = Math.max(0, Math.floor(Number(value) || 0))
    setSlots((prev) => prev.map((s) => (s.day === day && s.meal === meal ? { ...s, servings } : s)))
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const plan = await savePlan(weekStart, slots)
      setSlots(plan.slots)
      setSaved(plan)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const load = async (id: number) => {
    await run(async () => (await fetchPlan(id)).slots)
  }

  const closeLeftover = () => {
    setLeftoverDay(null)
    setMoving(false)
    setError(null)
  }

  const renderCell = (day: number, meal: Meal) => {
    const s = slot(day, meal)
    if (!s) return <div />
    const key = `${day}-${meal}`
    const recipe = s.recipe_id !== null ? byId.get(s.recipe_id) : undefined
    const needed = s.servings > 0
    const leftover = needed && s.source === 'leftover'
    const style: CSSProperties = {
      ...cellStyle,
      ...(leftover && { border: '1px dashed #9ca3af', background: '#f9fafb' }),
      ...(needed && s.flagged && { border: '1px solid #b45309' }),
    }

    return (
      <div key={key} style={style}>
        <label style={{ ...metaStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number"
            min={0}
            style={servingsInputStyle}
            value={s.servings || ''}
            placeholder="0"
            onChange={(e) => setServings(day, meal, e.target.value)}
          />
          servings
        </label>

        {!needed && <span style={{ color: '#d1d5db' }}>—</span>}

        {needed && s.recipe_id !== null && (
          <>
            <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{recipe?.name ?? 'Deleted recipe'}</span>
            {leftover && s.source_day !== null && (
              <span style={metaStyle}>Leftovers from {dayLabel(weekStart, s.source_day)} dinner</span>
            )}
            {meal === 'dinner' && s.batch_servings !== null && (
              <span style={metaStyle}>
                Cook {s.batch_servings}
                {recipe && ` · ×${+(s.batch_servings / recipe.servings).toFixed(2)}`}
              </span>
            )}
            {s.source === 'manual' && <span style={metaStyle}>Manual pick</span>}
          </>
        )}

        {needed && s.flagged && <span style={{ ...metaStyle, color: '#b45309' }}>Needs manual pick</span>}

        {needed && (
          <div style={{ display: 'flex', gap: 12 }}>
            {meal === 'dinner' && s.recipe_id !== null && (
              <button style={ghostBtnStyle} disabled={busy} onClick={() => run(() => swapDinner(slots, day))}>
                Swap
              </button>
            )}
            {leftover ? (
              <button style={ghostBtnStyle} disabled={busy} onClick={() => setLeftoverDay(day)}>
                Swap
              </button>
            ) : (
              <button style={ghostBtnStyle} disabled={busy} onClick={() => setPicking(picking === key ? null : key)}>
                Pick
              </button>
            )}
          </div>
        )}

        {picking === key && (
          <select
            style={{ ...servingsInputStyle, width: '100%' }}
            value=""
            onChange={async (e) => {
              if (await run(() => pickRecipe(slots, day, meal, Number(e.target.value)))) setPicking(null)
            }}
          >
            <option value="" disabled>
              Choose recipe…
            </option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>
    )
  }

  const popupLunch = leftoverDay !== null ? slot(leftoverDay, 'lunch') : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button style={ghostBtnStyle} onClick={() => shiftWeek(-7)}>
          ‹ Prev
        </button>
        <span style={labelStyle}>Week of {dayLabel(weekStart, 0)}</span>
        <button style={ghostBtnStyle} onClick={() => shiftWeek(7)}>
          Next ›
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={{ ...primaryBtnStyle, padding: '10px 18px' }} disabled={busy} onClick={() => run(() => generatePlan(slots, 'generate'))}>
          Generate
        </button>
        {hasPicks && hasEmpties && (
          <button
            style={{ ...primaryBtnStyle, padding: '10px 18px', background: '#fff', color: '#111827', border: '1px solid #111827' }}
            disabled={busy}
            onClick={() => run(() => generatePlan(slots, 'fill'))}
          >
            Fill empties
          </button>
        )}
        <button
          style={{ ...primaryBtnStyle, padding: '10px 18px', background: '#fff', color: '#111827', border: '1px solid #111827' }}
          disabled={busy}
          onClick={save}
        >
          Save
        </button>
        {saved && (
          <span style={{ ...metaStyle, marginLeft: 'auto' }}>
            Saved {saved.created_at}{' '}
            <button style={ghostBtnStyle} disabled={busy} onClick={() => load(saved.id)}>
              Load
            </button>
          </span>
        )}
      </div>

      {error && leftoverDay === null && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) minmax(0, 1fr)', gap: 6 }}>
        <span />
        <span style={labelStyle}>Lunch</span>
        <span style={labelStyle}>Dinner</span>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((day) => (
          <div key={day} style={{ display: 'contents' }}>
            <span style={{ ...metaStyle, paddingTop: 10, color: '#111827' }}>{dayLabel(weekStart, day)}</span>
            {renderCell(day, 'lunch')}
            {renderCell(day, 'dinner')}
          </div>
        ))}
      </div>

      {popupLunch && leftoverDay !== null && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={closeLeftover}
        >
          <div
            style={{ background: '#fff', border: '1px solid #111827', borderRadius: 0, padding: 20, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={labelStyle}>{dayLabel(weekStart, leftoverDay)} lunch · leftovers</span>
            <span style={{ fontSize: 13 }}>
              {popupLunch.recipe_id !== null && byId.get(popupLunch.recipe_id)?.name}
              {popupLunch.source_day !== null && ` from ${dayLabel(weekStart, popupLunch.source_day)} dinner`}
            </span>
            {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
            {moving ? (
              <>
                <span style={metaStyle}>Move to which lunch?</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[1, 2, 3, 4, 5, 6, 7]
                    .filter((d) => d !== leftoverDay)
                    .map((d) => (
                      <button
                        key={d}
                        style={{ ...ghostBtnStyle, color: '#111827', border: '1px solid #e5e7eb', padding: '6px 8px' }}
                        disabled={busy}
                        onClick={async () => {
                          if (await run(() => moveLeftover(slots, leftoverDay, d))) closeLeftover()
                        }}
                      >
                        {dayLabel(weekStart, d)}
                      </button>
                    ))}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ ...primaryBtnStyle, padding: '10px 18px' }}
                  disabled={busy}
                  onClick={async () => {
                    if (await run(() => deleteLeftover(slots, leftoverDay))) closeLeftover()
                  }}
                >
                  Delete
                </button>
                <button
                  style={{ ...primaryBtnStyle, padding: '10px 18px', background: '#fff', color: '#111827', border: '1px solid #111827' }}
                  onClick={() => setMoving(true)}
                >
                  Move
                </button>
              </div>
            )}
            <button style={{ ...ghostBtnStyle, alignSelf: 'flex-start' }} onClick={closeLeftover}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
