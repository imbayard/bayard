import { useEffect, useState, type CSSProperties } from 'react'
import { labelStyle, ghostBtnStyle } from '../lib/styles'
import { fetchShoppingList, setShoppingStatus, type ShoppingItem, type ShoppingStatus } from './lib/api'
import { addDays, dayLabel, isoDate } from './lib/week'
import StaplesEditor from './StaplesEditor'

// Rows are big tap targets: this screen gets used one-handed in a store aisle.
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  minHeight: 52,
  padding: '6px 0',
  borderBottom: '1px solid #e5e7eb',
}

const boxStyle: CSSProperties = {
  width: 22,
  height: 22,
  flexShrink: 0,
  border: '1px solid #111827',
  borderRadius: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  lineHeight: 1,
}

const metaStyle: CSSProperties = { fontSize: 11, color: '#6b7280' }

type View = 'items' | 'recipes'
const VIEW_KEY = 'dinner.shoppingView'

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'recipes' ? 'recipes' : 'items'
  } catch {
    return 'items'
  }
}

export default function ShoppingList({ initialWeek }: { initialWeek: string }) {
  const [weekStart, setWeekStart] = useState(initialWeek)
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [recipes, setRecipes] = useState<string[]>([])
  const [view, setView] = useState<View>(savedView)
  const [planId, setPlanId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRemoved, setShowRemoved] = useState(false)
  const [reload, setReload] = useState(0) // bumped when staples change

  useEffect(() => {
    fetchShoppingList(weekStart)
      .then((list) => {
        setItems(list.items)
        setRecipes(list.recipes)
        setPlanId(list.plan_id)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [weekStart, reload])

  const shiftWeek = (days: number) => {
    setWeekStart(isoDate(addDays(weekStart, days)))
    setLoading(true)
    setError(null)
  }

  // Optimistic: flip locally, roll back if the save fails.
  const setStatus = async (key: string, status: ShoppingStatus) => {
    const before = items
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status } : i)))
    try {
      await setShoppingStatus(weekStart, key, status)
    } catch (e) {
      setItems(before)
      setError((e as Error).message)
    }
  }

  const chooseView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // per-device nicety only
    }
  }

  const toBuy = items.filter((i) => i.status === null)
  const inCart = items.filter((i) => i.status === 'checked')
  const removed = items.filter((i) => i.status === 'removed')
  // Staples arrive after the recipe lines and keep their own section in both views.
  const staples = items.filter((i) => i.staple && i.status !== 'removed')
  const staplesToBuy = toBuy.filter((i) => i.staple)

  // Under a recipe, a row shows that recipe's share; checking it checks the combined line everywhere.
  const renderRow = (item: ShoppingItem, recipe?: string) => {
    const checked = item.status === 'checked'
    const qty = recipe ? item.sources.find((s) => s.recipe === recipe)?.qty : item.qty
    const amount = [qty, item.unit].filter(Boolean).join(' ')
    const others = item.sources.map((s) => s.recipe).filter((r) => r !== recipe)
    const meta = [recipe ? others.length > 0 && `also in ${others.join(', ')}` : others.join(', '), item.optional && 'optional']
      .filter(Boolean)
      .join(' · ')
    return (
      <div key={recipe ? `${recipe}:${item.key}` : item.key} style={rowStyle}>
        <button
          style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
          onClick={() => setStatus(item.key, checked ? null : 'checked')}
        >
          <span style={{ ...boxStyle, background: checked ? '#111827' : '#fff', color: '#fff' }}>{checked && '✓'}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 15, color: checked ? '#9ca3af' : '#111827', textDecoration: checked ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>
              {item.name}
              {amount && <span style={{ color: '#6b7280' }}> · {amount}</span>}
            </span>
            {meta && <span style={metaStyle}>{meta}</span>}
          </span>
        </button>
        {!checked && (
          <button style={{ ...ghostBtnStyle, padding: '12px 4px' }} onClick={() => setStatus(item.key, 'removed')}>
            Remove
          </button>
        )}
      </div>
    )
  }

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

      <div style={{ display: 'flex', gap: 16 }}>
        {(['items', 'recipes'] as const).map((v) => (
          <button key={v} style={{ ...ghostBtnStyle, color: view === v ? '#111827' : '#9ca3af' }} onClick={() => chooseView(v)}>
            {v === 'items' ? 'All items' : 'By recipe'}
          </button>
        ))}
      </div>

      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {!loading && !error && planId === null && <div style={metaStyle}>No saved plan for this week — save one on the Plan tab. Staples join the list once it exists.</div>}
      {!loading && planId !== null && items.length === 0 && <div style={metaStyle}>The plan's recipes have no ingredients.</div>}

      {planId !== null && items.length > 0 && toBuy.length === 0 && <div style={metaStyle}>Everything's in the cart.</div>}

      {view === 'items' && toBuy.some((i) => !i.staple) && <div>{toBuy.filter((i) => !i.staple).map((i) => renderRow(i))}</div>}
      {view === 'items' && staplesToBuy.length > 0 && (
        <div>
          <span style={labelStyle}>Staples</span>
          {staplesToBuy.map((i) => renderRow(i))}
        </div>
      )}
      {view === 'items' && inCart.length > 0 && (
        <div>
          <span style={labelStyle}>In cart · {inCart.length}</span>
          {inCart.map((i) => renderRow(i))}
        </div>
      )}

      {view === 'recipes' &&
        recipes.map((recipe) => {
          // Items arrive name-sorted; checked rows stay in place here rather than sinking.
          const mine = items.filter((i) => i.status !== 'removed' && i.sources.some((s) => s.recipe === recipe))
          if (mine.length === 0) return null
          const left = mine.filter((i) => i.status === null).length
          return (
            <div key={recipe}>
              <span style={labelStyle}>
                {recipe} · {left ? `${left} left` : 'done'}
              </span>
              {mine.map((i) => renderRow(i, recipe))}
            </div>
          )
        })}
      {view === 'recipes' && staples.length > 0 && (
        <div>
          <span style={labelStyle}>
            Staples · {staplesToBuy.length ? `${staplesToBuy.length} left` : 'done'}
          </span>
          {staples.map((i) => renderRow(i))}
        </div>
      )}

      {removed.length > 0 && (
        <div>
          <button style={ghostBtnStyle} onClick={() => setShowRemoved(!showRemoved)}>
            {showRemoved ? 'Hide' : 'Show'} removed · {removed.length}
          </button>
          {showRemoved &&
            removed.map((item) => (
              <div key={item.key} style={{ ...rowStyle, minHeight: 44 }}>
                <span style={{ flex: 1, fontSize: 14, color: '#9ca3af', overflowWrap: 'anywhere' }}>{item.name}</span>
                <button style={{ ...ghostBtnStyle, padding: '12px 4px' }} onClick={() => setStatus(item.key, null)}>
                  Restore
                </button>
              </div>
            ))}
        </div>
      )}

      <StaplesEditor onChange={() => setReload((n) => n + 1)} />
    </div>
  )
}
