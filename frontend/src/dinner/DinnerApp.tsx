import { useEffect, useState, type CSSProperties } from 'react'
import { labelStyle, primaryBtnStyle, ghostBtnStyle } from '../lib/styles'
import {
  createRecipe,
  deleteRecipe,
  fetchRecipes,
  suggestIngredients,
  suggestTags,
  updateRecipe,
  type Ingredient,
  type Recipe,
  type TagSuggestion,
} from './lib/api'
import MealPlanner from './MealPlanner'
import TagEditor from './TagEditor'
import ShoppingList from './ShoppingList'
import { upcomingSunday } from './lib/week'

const EMPTY_INGREDIENT: Ingredient = { qty: '', unit: '', name: '', optional: false }

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid #e5e7eb',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  borderRadius: 0,
  width: '100%',
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const drawerMotion = reducedMotion
  ? 'none'
  : 'grid-template-rows 320ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 240ms ease, transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)'

const cardStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 0,
  padding: 16,
}

export default function DinnerApp({ onExitToHome }: { onExitToHome: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const [name, setName] = useState('')
  const [servings, setServings] = useState('4')
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ ...EMPTY_INGREDIENT }])
  const [steps, setSteps] = useState<string[]>([''])
  const [tags, setTags] = useState('')
  const [ingredientNames, setIngredientNames] = useState<string[]>([])
  const [tagNames, setTagNames] = useState<TagSuggestion[]>([])
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [listWeek, setListWeek] = useState(upcomingSunday)
  const [view, setView] = useState<'recipes' | 'plan' | 'list'>('recipes')

  const load = () => {
    fetchRecipes()
      .then(setRecipes)
      .catch((e) => setError((e as Error).message))
  }

  useEffect(() => {
    load()
    suggestIngredients('').then(setIngredientNames).catch(() => {})
    suggestTags('').then(setTagNames).catch(() => {})
  }, [])

  // Close first; fields clear once the drawer finishes collapsing so it doesn't jump mid-animation.
  const resetForm = () => {
    setFormOpen(false)
    if (reducedMotion) clearForm()
  }

  const clearForm = () => {
    setEditingId(null)
    setName('')
    setServings('4')
    setIngredients([{ ...EMPTY_INGREDIENT }])
    setSteps([''])
    setTags('')
  }

  const startEdit = (recipe: Recipe) => {
    setEditingId(recipe.id)
    setFormOpen(true)
    setName(recipe.name)
    setServings(String(recipe.servings))
    setIngredients(recipe.ingredients.length ? recipe.ingredients : [{ ...EMPTY_INGREDIENT }])
    setSteps(recipe.steps.length ? recipe.steps : [''])
    setTags(recipe.tags.join(', '))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name,
        servings: Number(servings) || 1,
        ingredients: ingredients.filter((i) => i.name.trim()),
        steps: steps.map((s) => s.trim()).filter(Boolean),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      }
      const recipe = editingId ? await updateRecipe(editingId, payload) : await createRecipe(payload)
      setRecipes((prev) =>
        [...prev.filter((r) => r.id !== recipe.id), recipe].sort((a, b) => a.name.localeCompare(b.name)),
      )
      setIngredientNames((prev) =>
        Array.from(new Set([...prev, ...recipe.ingredients.map((i) => i.name)])).sort(),
      )
      suggestTags('').then(setTagNames).catch(() => {}) // server keeps registry tags first
      resetForm()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const removeRecipe = async (id: number) => {
    try {
      await deleteRecipe(id)
      setRecipes((prev) => prev.filter((r) => r.id !== id))
      if (editingId === id) resetForm()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <datalist id="dinner-ingredient-names">
        {ingredientNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="dinner-tag-names">
        {tagNames.map((t) => (
          <option key={t.name} value={t.name} label={t.category ?? undefined} />
        ))}
      </datalist>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          What's4Dinner
        </h1>
        <div style={{ display: 'flex', gap: 16 }}>
          {(['recipes', 'plan', 'list'] as const).map((v) => (
            <button key={v} style={{ ...ghostBtnStyle, color: view === v ? '#111827' : '#9ca3af' }} onClick={() => setView(v)}>
              {{ recipes: 'Recipes', plan: 'Plan', list: 'List' }[v]}
            </button>
          ))}
          <button style={ghostBtnStyle} onClick={onExitToHome}>Home</button>
        </div>
      </div>

      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {view === 'plan' && (
        <MealPlanner
          recipes={recipes}
          onAccept={(week) => {
            setListWeek(week)
            setView('list')
          }}
        />
      )}
      {view === 'list' && <ShoppingList initialWeek={listWeek} />}

      {view === 'recipes' && (
      <>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={labelStyle}>{tagsOpen ? 'Tags' : 'Recipe box'}</span>
        <button style={ghostBtnStyle} onClick={() => setTagsOpen((v) => !v)}>
          {tagsOpen ? 'Back to recipes' : 'Manage tags'}
        </button>
      </div>

      {tagsOpen && (
        <TagEditor
          onChanged={() => {
            load() // renames/deletes rewrite recipe tags
            suggestTags('').then(setTagNames).catch(() => {})
          }}
        />
      )}

      {!tagsOpen && (
      <>
      <div>
      <button
        style={{ ...primaryBtnStyle, padding: '12px 24px', minWidth: 160 }}
        onClick={() => (formOpen ? resetForm() : setFormOpen(true))}
      >
        {formOpen ? 'Close' : '+ Add recipe'}
      </button>

      {/* Drawer: grid rows 0fr ⇄ 1fr animates to the form's natural height. */}
      <div
        inert={!formOpen}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows' && !formOpen) clearForm()
        }}
        style={{
          display: 'grid',
          gridTemplateRows: formOpen ? '1fr' : '0fr',
          opacity: formOpen ? 1 : 0,
          transition: drawerMotion,
        }}
      >
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
      <div
        style={{
          ...cardStyle,
          marginTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          transform: formOpen ? 'translateY(0)' : 'translateY(-12px)',
          transition: drawerMotion,
        }}
      >
        <span style={labelStyle}>{editingId ? 'Edit recipe' : 'New recipe'}</span>

        <div>
          <label style={labelStyle}>Recipe name</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div style={{ maxWidth: 160 }}>
          <label style={labelStyle}>Servings</label>
          <input
            style={inputStyle}
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>Ingredients</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ ...inputStyle, maxWidth: 60 }}
                  placeholder="qty"
                  value={ing.qty}
                  onChange={(e) =>
                    setIngredients((prev) => prev.map((p, j) => (j === i ? { ...p, qty: e.target.value } : p)))
                  }
                />
                <input
                  style={{ ...inputStyle, maxWidth: 80 }}
                  placeholder="unit"
                  value={ing.unit}
                  onChange={(e) =>
                    setIngredients((prev) => prev.map((p, j) => (j === i ? { ...p, unit: e.target.value } : p)))
                  }
                />
                <input
                  style={inputStyle}
                  placeholder="ingredient"
                  list="dinner-ingredient-names"
                  value={ing.name}
                  onChange={(e) =>
                    setIngredients((prev) => prev.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))
                  }
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280', flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={ing.optional ?? false}
                    onChange={(e) =>
                      setIngredients((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, optional: e.target.checked } : p)),
                      )
                    }
                  />
                  optional
                </label>
                <button
                  style={ghostBtnStyle}
                  onClick={() => setIngredients((prev) => prev.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            style={{ ...ghostBtnStyle, marginTop: 8 }}
            onClick={() => setIngredients((prev) => [...prev, { ...EMPTY_INGREDIENT }])}
          >
            + Add ingredient
          </button>
        </div>

        <div>
          <label style={labelStyle}>Steps</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <textarea
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 36 }}
                  value={step}
                  onChange={(e) => setSteps((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
                />
                <button style={ghostBtnStyle} onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button style={{ ...ghostBtnStyle, marginTop: 8 }} onClick={() => setSteps((prev) => [...prev, ''])}>
            + Add step
          </button>
        </div>

        <div>
          <label style={labelStyle}>Tags (comma-separated)</label>
          <input
            style={inputStyle}
            list="dinner-tag-names"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button
            style={{ ...primaryBtnStyle, padding: '12px 24px', alignSelf: 'flex-start' }}
            disabled={saving || !name.trim()}
            onClick={submit}
          >
            {saving ? 'Saving…' : editingId ? 'Update recipe' : 'Save recipe'}
          </button>
          <button style={ghostBtnStyle} onClick={resetForm}>
            Cancel
          </button>
        </div>
      </div>
      </div>
      </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recipes.map((r) => (
          <div key={r.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <button
                style={{ ...ghostBtnStyle, color: '#111827', fontSize: 14, textTransform: 'none', letterSpacing: 0 }}
                onClick={() => setExpanded((prev) => (prev === r.id ? null : r.id))}
              >
                {r.name}
              </button>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>serves {r.servings}</span>
                <button style={ghostBtnStyle} onClick={() => startEdit(r)}>Edit</button>
                <button style={ghostBtnStyle} onClick={() => removeRecipe(r.id)}>Delete</button>
              </div>
            </div>
            {expanded === r.id && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Ingredients</label>
                  <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: 14 }}>
                    {r.ingredients.map((ing, i) => (
                      <li key={i}>
                        {ing.qty} {ing.unit} {ing.name}
                        {ing.optional && <span style={{ color: '#9ca3af' }}> (optional)</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <label style={labelStyle}>Steps</label>
                  <ol style={{ margin: '4px 0', paddingLeft: 20, fontSize: 14 }}>
                    {r.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
                {r.tags.length > 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>{r.tags.join(', ')}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
      </>
      )}
      </>
      )}
    </div>
  )
}
