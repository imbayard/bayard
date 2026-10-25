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

// Meal plan. Day 0 is the plan's Sunday: dinners are days 0-6, lunches days 1-7.
export type Meal = 'lunch' | 'dinner'

export interface PlanSlot {
  day: number
  meal: Meal
  servings: number
  recipe_id: number | null
  source: 'generated' | 'leftover' | 'manual' | null
  source_day: number | null
  batch_servings: number | null
  flagged: boolean
  swapped_out?: number[]
}

export interface SavedPlan {
  id: number
  week_start: string
  created_at: string
}

function post<T>(path: string, body: unknown) {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function generatePlan(slots: PlanSlot[], mode: 'generate' | 'fill') {
  return post<PlanSlot[]>('/dinner/plan/generate', { slots, mode })
}

export function swapDinner(slots: PlanSlot[], day: number) {
  return post<PlanSlot[]>('/dinner/plan/swap', { slots, day })
}

export function deleteLeftover(slots: PlanSlot[], day: number) {
  return post<PlanSlot[]>('/dinner/plan/leftover/delete', { slots, day })
}

export function moveLeftover(slots: PlanSlot[], day: number, toDay: number) {
  return post<PlanSlot[]>('/dinner/plan/leftover/move', { slots, day, to_day: toDay })
}

export function pickRecipe(slots: PlanSlot[], day: number, meal: Meal, recipeId: number) {
  return post<PlanSlot[]>('/dinner/plan/pick', { slots, day, meal, recipe_id: recipeId })
}

export function savePlan(weekStart: string, slots: PlanSlot[]) {
  return post<SavedPlan & { slots: PlanSlot[] }>('/dinner/plans', { week_start: weekStart, slots })
}

export function fetchPlans(week: string) {
  return request<SavedPlan[]>(`/dinner/plans?week=${week}`)
}

export function fetchPlan(id: number) {
  return request<SavedPlan & { slots: PlanSlot[] }>(`/dinner/plans/${id}`)
}
