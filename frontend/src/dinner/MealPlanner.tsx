import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { labelStyle, primaryBtnStyle, ghostBtnStyle } from '../lib/styles'
import {
  arrangePlan,
  deleteLeftover,
  fetchPlan,
  fetchPlans,
  fetchPreferences,
  fetchTagRegistry,
  generatePlan,
  moveLeftover,
  pickRecipe,
  savePlan,
  savePreferences,
  swapDinner,
  type Meal,
  type PlanSlot,
  type Recipe,
  type SavedPlan,
  type TagCategory,
} from './lib/api'
import PreferencesDrawer from './PreferencesDrawer'
import { cellKey, discard, drop, toCells, toSlots, unplaced, type Cells, type Lift } from './lib/arrange'
import { addDays, dayLabel, isoDate, upcomingSunday } from './lib/week'

// Window: Sunday dinner (day 0) → the following Sunday's lunch (day 7).
const blankSlots = (): PlanSlot[] => [
  ...[0, 1, 2, 3, 4, 5, 6].map((day) => blankSlot(day, 'dinner')),
  ...[1, 2, 3, 4, 5, 6, 7].map((day) => blankSlot(day, 'lunch')),
]

function blankSlot(day: number, meal: Meal): PlanSlot {
  return { day, meal, servings: 0, recipe_id: null, source: null, source_day: null, batch_servings: null, flagged: false }
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

const stepBtnStyle: CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  padding: 0,
  border: '1px solid #e5e7eb',
  borderRadius: 0,
  background: '#fff',
  color: '#111827',
  fontSize: 20,
  fontFamily: 'inherit',
  lineHeight: 1,
  cursor: 'pointer',
  touchAction: 'manipulation',
}

const metaStyle: CSSProperties = { fontSize: 11, color: '#6b7280' }

const outlineBtnStyle: CSSProperties = { ...primaryBtnStyle, padding: '10px 18px', background: '#fff', color: '#111827', border: '1px solid #111827' }

// Large − / + around the number so servings are easy to set one-handed on a phone. 0 = skip the slot.
function ServingsStepper({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: string) => void }) {
  const off: CSSProperties = { color: '#d1d5db', cursor: 'default' }
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minWidth: 0 }}>
      <button
        type="button"
        aria-label="Fewer servings"
        style={{ ...stepBtnStyle, ...((disabled || value <= 0) && off) }}
        disabled={disabled || value <= 0}
        onClick={() => onChange(String(value - 1))}
      >
        −
      </button>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label="Servings"
        style={{ ...servingsInputStyle, flex: 1, width: 'auto', minWidth: 0, borderLeft: 'none', borderRight: 'none', fontSize: 14, textAlign: 'center' }}
        value={value || ''}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" aria-label="More servings" style={{ ...stepBtnStyle, ...(disabled && off) }} disabled={disabled} onClick={() => onChange(String(value + 1))}>
        +
      </button>
    </div>
  )
}

// Drag and drop: the first drag enters arrange mode, a scratchpad applied once (see lib/arrange.ts).
// A cell is a drop target for its own meal when it has servings; other cells dim while dragging.
function DropCell({ id, meal, open, dragging, style, children }: { id: string; meal: Meal; open: boolean; dragging: Meal | null; style: CSSProperties; children: ReactNode }) {
  const target = open && dragging === meal
  const { setNodeRef, isOver } = useDroppable({ id, data: { key: id, meal }, disabled: !target })
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...(dragging && !target && { opacity: 0.45 }), ...(isOver && { outline: '2px solid #111827', outlineOffset: -2 }) }}
    >
      {children}
    </div>
  )
}

function DragHandle({ id, lift, disabled, children }: { id: string; lift: Lift; disabled: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data: lift, disabled })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={`Drag ${lift.meal}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: 1,
        minWidth: 0,
        cursor: disabled ? 'default' : isDragging ? 'grabbing' : 'grab',
        touchAction: 'manipulation',
        borderRadius: 0,
        ...(transform && { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }),
        ...(isDragging && { position: 'relative', zIndex: 10, background: '#fff', outline: '1px solid #111827', boxShadow: '0 4px 12px rgba(17,24,39,0.15)' }),
      }}
    >
      {children}
    </div>
  )
}

const grip = (
  <span aria-hidden style={{ color: '#9ca3af', marginRight: 4 }}>
    ⋮⋮
  </span>
)

// A card bumped by a drop: half size and muted, still draggable; × discards it from the plan.
function HalfCard({ lift, name, onDiscard }: { lift: Lift & { index: number }; name: string; onDiscard: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', borderRadius: 0, background: '#f9fafb', padding: '2px 6px' }}>
      <DragHandle id={`${lift.key}-b${lift.index}`} lift={lift} disabled={false}>
        <span style={{ fontSize: 11, color: '#6b7280', overflowWrap: 'anywhere' }}>
          {grip}
          {name}
        </span>
      </DragHandle>
      <button type="button" aria-label={`Discard ${name}`} style={{ ...ghostBtnStyle, fontSize: 14, lineHeight: 1, padding: '2px 4px' }} onClick={onDiscard}>
        ×
      </button>
    </div>
  )
}

export default function MealPlanner({ recipes, onAccept }: { recipes: Recipe[]; onAccept: (weekStart: string) => void }) {
  const [weekStart, setWeekStart] = useState(upcomingSunday)
  const [slots, setSlots] = useState<PlanSlot[]>(blankSlots)
  const [saved, setSaved] = useState<SavedPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<Meal | null>(null)
  // Arrange mode: the scratchpad's cells, null when not arranging. `slots` stays untouched meanwhile,
  // so it is the snapshot Cancel returns to.
  const [cells, setCells] = useState<Cells | null>(null)
  const [confirmEdit, setConfirmEdit] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const [leftoverDay, setLeftoverDay] = useState<number | null>(null)
  const [moving, setMoving] = useState(false)
  // Preferences: `prefs` is this draft's picks, seeded from the standing `defaults`.
  const [prefCategories, setPrefCategories] = useState<TagCategory[]>([])
  const [defaults, setDefaults] = useState<number[]>([])
  const [prefs, setPrefs] = useState<number[]>([])

  const byId = new Map(recipes.map((r) => [r.id, r]))
  // Lunch picker lists `lunch`-tagged recipes first (any recipe can still be picked).
  const isLunch = (r: Recipe) => r.tags.some((t) => t.trim().toLowerCase() === 'lunch')
  const lunchFirst = [...recipes.filter(isLunch), ...recipes.filter((r) => !isLunch(r))]
  const slot = (day: number, meal: Meal) => slots.find((s) => s.day === day && s.meal === meal)
  const hasPicks = slots.some((s) => s.recipe_id !== null)
  const hasEmpties = slots.some((s) => s.servings > 0 && s.recipe_id === null)
  const locked = busy || cells !== null
  const unplacedCount = cells ? unplaced(cells) : 0

  // Touch waits for a short press so the page still scrolls; keyboard: space to lift, arrows, space to drop.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  // The grid starts blank every time; the week's latest saved plan is offered for Edit, not auto-loaded.
  useEffect(() => {
    let live = true
    fetchPlans(weekStart)
      .then((plans) => live && setSaved(plans[0] ?? null))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [weekStart])

  // The `meal` category (protected) isn't a preference: lunch/dinner pools are the planner's rule.
  useEffect(() => {
    Promise.all([fetchTagRegistry(), fetchPreferences()])
      .then(([registry, { tag_ids }]) => {
        setPrefCategories(registry.categories.filter((c) => !c.protected && c.tags.length > 0))
        setDefaults(tag_ids)
        setPrefs(tag_ids)
      })
      .catch(() => {})
  }, [])

  const saveDefault = async () => {
    setBusy(true)
    setError(null)
    try {
      const { tag_ids } = await savePreferences(prefs)
      setDefaults(tag_ids)
      setPrefs(tag_ids)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const shiftWeek = (days: number) => {
    setWeekStart(isoDate(addDays(weekStart, days)))
    setSlots(blankSlots())
    setPrefs(defaults)
    setSaved(null)
    setPicking(null)
    setConfirmEdit(false)
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

  // Accepting saves the week (a new history row) and hands off to its shopping list.
  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      setSaved(await savePlan(weekStart, slots))
      onAccept(weekStart)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Edit: the week's latest saved plan (fetched fresh) becomes the draft; Accept then saves a new row.
  const edit = async () => {
    setConfirmEdit(false)
    setPicking(null)
    await run(async () => {
      const [latest] = await fetchPlans(weekStart)
      if (!latest) throw new Error('No saved plan for this week.')
      setSaved(latest)
      return (await fetchPlan(latest.id)).slots
    })
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    setDragging((active.data.current as Lift).meal)
    setPicking(null)
    setCells((prev) => prev ?? toCells(slots))
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    const from = active.data.current as Lift
    const to = over?.data.current as { key: string; meal: Meal } | undefined
    if (!to || to.meal !== from.meal) return
    setCells((prev) => prev && drop(prev, from, to.key))
  }

  const apply = async () => {
    if (cells && (await run(() => arrangePlan(toSlots(slots, cells))))) setCells(null)
  }

  const closeLeftover = () => {
    setLeftoverDay(null)
    setMoving(false)
    setError(null)
  }

  const renderCell = (day: number, meal: Meal) => {
    const s = slot(day, meal)
    if (!s) return <div />
    const key = cellKey(day, meal)
    const needed = s.servings > 0
    // Arranging shows the scratchpad's cards; otherwise the draft's pick.
    const cell = cells?.[key]
    const card = cell ? cell.main : needed && s.recipe_id !== null ? { recipe_id: s.recipe_id, source: s.source, source_day: s.source_day } : null
    const recipe = card ? byId.get(card.recipe_id) : undefined
    const leftover = card?.source === 'leftover'
    const style: CSSProperties = {
      ...cellStyle,
      ...(leftover && { border: '1px dashed #9ca3af', background: '#f9fafb' }),
      ...(!cells && needed && s.flagged && { border: '1px solid #b45309' }),
    }

    return (
      <DropCell key={key} id={key} meal={meal} open={needed} dragging={dragging} style={style}>
        <span style={metaStyle}>Servings</span>
        <ServingsStepper value={s.servings} disabled={cells !== null} onChange={(v) => setServings(day, meal, v)} />

        {!needed && <span style={{ color: '#d1d5db' }}>—</span>}

        {card && (
          // Leftovers are never dragged: they follow their dinner (the Move button moves one by hand).
          <DragHandle id={key} lift={{ key, index: null, meal }} disabled={busy || leftover}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...(cells && leftover && { opacity: 0.45 }) }}>
              <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                {!leftover && grip}
                {recipe?.name ?? 'Deleted recipe'}
              </span>
              {leftover && card.source_day !== null && (
                <span style={metaStyle}>Leftovers from {dayLabel(weekStart, card.source_day)} dinner</span>
              )}
              {!cells && meal === 'dinner' && s.batch_servings !== null && (
                <span style={metaStyle}>
                  Cook {s.batch_servings}
                  {recipe && ` · ×${+(s.batch_servings / recipe.servings).toFixed(2)}`}
                </span>
              )}
              {card.source === 'manual' && <span style={metaStyle}>Manual pick</span>}
            </div>
          </DragHandle>
        )}

        {cell?.bumped.map((b, i) => (
          <HalfCard
            key={`${b.origin}-${b.recipe_id}`}
            lift={{ key, index: i, meal }}
            name={byId.get(b.recipe_id)?.name ?? 'Deleted recipe'}
            onDiscard={() => setCells((prev) => prev && discard(prev, key, i))}
          />
        ))}

        {cells && needed && !card && <span style={metaStyle}>Empty</span>}
        {!cells && needed && s.flagged && <span style={{ ...metaStyle, color: '#b45309' }}>Needs manual pick</span>}

        {needed && (
          <div style={{ display: 'flex', gap: 12 }}>
            {meal === 'dinner' && s.recipe_id !== null && (
              <button style={ghostBtnStyle} disabled={locked} onClick={() => run(() => swapDinner(slots, day, prefs))}>
                Swap
              </button>
            )}
            {s.source === 'leftover' ? (
              <button style={ghostBtnStyle} disabled={locked} onClick={() => setLeftoverDay(day)}>
                Swap
              </button>
            ) : (
              <button style={ghostBtnStyle} disabled={locked} onClick={() => setPicking(picking === key ? null : key)}>
                Pick
              </button>
            )}
          </div>
        )}

        {picking === key && !cells && (
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
            {(meal === 'lunch' ? lunchFirst : recipes).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </DropCell>
    )
  }

  const popupLunch = leftoverDay !== null ? slot(leftoverDay, 'lunch') : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button style={ghostBtnStyle} disabled={cells !== null} onClick={() => shiftWeek(-7)}>
          ‹ Prev
        </button>
        <span style={labelStyle}>Week of {dayLabel(weekStart, 0)}</span>
        <button style={ghostBtnStyle} disabled={cells !== null} onClick={() => shiftWeek(7)}>
          Next ›
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={{ ...primaryBtnStyle, padding: '10px 18px' }} disabled={locked} onClick={() => run(() => generatePlan(slots, 'generate', prefs))}>
          Generate
        </button>
        {hasPicks && hasEmpties && (
          <button style={outlineBtnStyle} disabled={locked} onClick={() => run(() => generatePlan(slots, 'fill', prefs))}>
            Fill empties
          </button>
        )}
        <button style={outlineBtnStyle} disabled={locked || !hasPicks} onClick={accept}>
          Accept plan
        </button>
        {saved && !confirmEdit && (
          <span style={{ ...metaStyle, marginLeft: 'auto' }}>
            Saved {saved.created_at}{' '}
            <button style={ghostBtnStyle} disabled={locked} onClick={() => (hasPicks ? setConfirmEdit(true) : edit())}>
              Edit
            </button>
          </span>
        )}
        {saved && confirmEdit && (
          <span style={{ ...metaStyle, marginLeft: 'auto', color: '#111827' }}>
            Replace this draft with the saved plan?{' '}
            <button style={ghostBtnStyle} disabled={locked} onClick={edit}>
              Replace
            </button>{' '}
            <button style={ghostBtnStyle} onClick={() => setConfirmEdit(false)}>
              Keep draft
            </button>
          </span>
        )}
      </div>

      {error && leftoverDay === null && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      <PreferencesDrawer
        categories={prefCategories}
        selected={prefs}
        defaults={defaults}
        busy={busy}
        onChange={setPrefs}
        onSaveDefault={saveDefault}
      />

      {cells && (
        <div
          style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', background: '#fff', border: '1px solid #111827', borderRadius: 0 }}
        >
          <span style={labelStyle}>Arranging — Apply or Cancel</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
            {unplacedCount > 0 && (
              <span style={{ ...metaStyle, color: '#b45309' }}>
                {unplacedCount} {unplacedCount === 1 ? 'card' : 'cards'} unplaced
              </span>
            )}
            <button style={{ ...primaryBtnStyle, padding: '10px 18px' }} disabled={busy || unplacedCount > 0} onClick={apply}>
              Apply
            </button>
            <button style={outlineBtnStyle} disabled={busy} onClick={() => setCells(null)}>
              Cancel
            </button>
          </span>
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
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
      </DndContext>

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
                <button style={outlineBtnStyle} onClick={() => setMoving(true)}
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
