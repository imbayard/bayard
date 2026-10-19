import { API_BASE } from '../../lib/config'

export interface Ingredient {
  qty: string
  unit: string
  name: string
  optional?: boolean
}

export interface Recipe {
  id: number
  name: string
  servings: number
  ingredients: Ingredient[]
  steps: string[]
  tags: string[]
  created_at: string
}

export type RecipeInput = Omit<Recipe, 'id' | 'created_at'>

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.detail ?? `${response.status} ${response.statusText}`)
  }
  return response.json()
}

export function fetchRecipes(signal?: AbortSignal) {
  return request<Recipe[]>('/dinner/recipes', { signal })
}

export function createRecipe(recipe: RecipeInput) {
  return request<Recipe>('/dinner/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe),
  })
}

export function updateRecipe(id: number, recipe: RecipeInput) {
  return request<Recipe>(`/dinner/recipes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe),
  })
}

export function deleteRecipe(id: number) {
  return request<{ ok: true }>(`/dinner/recipes/${id}`, { method: 'DELETE' })
}

export function suggestIngredients(q: string, signal?: AbortSignal) {
  return request<string[]>(`/dinner/ingredients?q=${encodeURIComponent(q)}`, { signal })
}

export function suggestTags(q: string, signal?: AbortSignal) {
  return request<string[]>(`/dinner/tags?q=${encodeURIComponent(q)}`, { signal })
}
