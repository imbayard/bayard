import { useEffect, useState, type CSSProperties } from 'react'
import { labelStyle, primaryBtnStyle, ghostBtnStyle } from '../lib/styles'
import {
  createRecipe,
  deleteRecipe,
  fetchRecipes,
  suggestIngredients,
  suggestTags,
  type Ingredient,
  type Recipe,
} from './lib/api'

const EMPTY_INGREDIENT: Ingredient = { qty: '', unit: '', name: '' }

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid #e5e7eb',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  borderRadius: 0,
  width: '100%',
}

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
  const [tagNames, setTagNames] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

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

  const resetForm = () => {
    setName('')
    setServings('4')
    setIngredients([{ ...EMPTY_INGREDIENT }])
    setSteps([''])
    setTags('')
  }

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const recipe = await createRecipe({
        name,
        servings: Number(servings) || 1,
        ingredients: ingredients.filter((i) => i.name.trim()),
        steps: steps.map((s) => s.trim()).filter(Boolean),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      setRecipes((prev) => [...prev, recipe].sort((a, b) => a.name.localeCompare(b.name)))
      setIngredientNames((prev) =>
        Array.from(new Set([...prev, ...recipe.ingredients.map((i) => i.name)])).sort(),
      )
      setTagNames((prev) => Array.from(new Set([...prev, ...recipe.tags])).sort())
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
          <option key={t} value={t} />
        ))}
      </datalist>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          What's4Dinner
        </h1>
        <button style={ghostBtnStyle} onClick={onExitToHome}>Home</button>
      </div>

      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 16 }}>
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

        <button
          style={{ ...primaryBtnStyle, padding: '12px 24px', alignSelf: 'flex-start' }}
          disabled={saving || !name.trim()}
          onClick={submit}
        >
          {saving ? 'Saving…' : 'Save recipe'}
        </button>
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
    </div>
  )
}
