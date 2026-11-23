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

// Registry tags first (category null when uncategorized), then free-form tags seen on recipes.
export interface TagSuggestion {
  name: string
  category: string | null
}

export function suggestTags(q: string, signal?: AbortSignal) {
  return request<TagSuggestion[]>(`/dinner/tags?q=${encodeURIComponent(q)}`, { signal })
}

// Tag registry. Protected rows (built-in tags, the `meal` category) are refused server-side.
export interface RegistryTag {
  id: number
  name: string
  category_id: number | null
  protected: boolean
  recipe_count: number
}

export interface TagCategory {
  id: number
  name: string
  protected: boolean
  tags: RegistryTag[]
}

export interface TagRegistry {
  categories: TagCategory[]
  uncategorized: RegistryTag[]
  free_form: { name: string; recipe_count: number }[] // in use on recipes, not registered
}

// Every registry write answers with the fresh registry.
function send(path: string, method: string, body?: unknown) {
  return request<TagRegistry>(`/dinner/tag-registry${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function fetchTagRegistry() {
  return request<TagRegistry>('/dinner/tag-registry')
}

export function createTag(name: string, categoryId: number | null = null) {
  return send('/tags', 'POST', { name, category_id: categoryId })
}

// Omit a field to leave it unchanged; category_id null = uncategorized.
export function updateTag(id: number, patch: { name?: string; category_id?: number | null }) {
  return send(`/tags/${id}`, 'PATCH', patch)
}

export function deleteTag(id: number) {
  return send(`/tags/${id}`, 'DELETE')
}

export function createCategory(name: string) {
  return send('/categories', 'POST', { name })
}

export function renameCategory(id: number, name: string) {
  return send(`/categories/${id}`, 'PATCH', { name })
}

export function deleteCategory(id: number) {
  return send(`/categories/${id}`, 'DELETE')
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

// Preferences: selected registry tag ids. The server keeps the standing defaults; each week's
// draft holds its own copy, sent with Generate/Fill/Swap (never with Accept or manual picks).
export function fetchPreferences() {
  return request<{ tag_ids: number[] }>('/dinner/preferences')
}

export function savePreferences(tagIds: number[]) {
  return request<{ tag_ids: number[] }>('/dinner/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_ids: tagIds }),
  })
}

export function generatePlan(slots: PlanSlot[], mode: 'generate' | 'fill', prefs: number[] = []) {
  return post<PlanSlot[]>('/dinner/plan/generate', { slots, mode, prefs })
}

export function swapDinner(slots: PlanSlot[], day: number, prefs: number[] = []) {
  return post<PlanSlot[]>('/dinner/plan/swap', { slots, day, prefs })
}

export function deleteLeftover(slots: PlanSlot[], day: number) {
  return post<PlanSlot[]>('/dinner/plan/leftover/delete', { slots, day })
}

export function moveLeftover(slots: PlanSlot[], day: number, toDay: number) {
  return post<PlanSlot[]>('/dinner/plan/leftover/move', { slots, day, to_day: toDay })
}

// Drag and drop: apply the browser's arrangement once — leftovers re-chain, flags recompute.
export function arrangePlan(slots: PlanSlot[]) {
  return post<PlanSlot[]>('/dinner/plan/arrange', { slots })
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

// Shopping list: the week's latest saved plan, scaled and combined; status is check-off state.
export type ShoppingStatus = 'checked' | 'removed' | null

export interface ShoppingItem {
  key: string
  name: string
  unit: string
  qty: string
  optional: boolean
  sources: { recipe: string; qty: string }[] // this line's share per recipe; empty for staples
  staple?: boolean // from the staples list: never scaled or merged with recipe lines
  status: ShoppingStatus
}

export function fetchShoppingList(week: string) {
  return request<{ plan_id: number | null; recipes: string[]; items: ShoppingItem[] }>(`/dinner/shopping-list?week=${week}`)
}

export function setShoppingStatus(week: string, key: string, status: ShoppingStatus) {
  return request<{ ok: true }>('/dinner/shopping-list/item', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ week, key, status }),
  })
}

// Staples: week-to-week items outside any recipe, appended to every saved week's list.
export interface Staple {
  id: number
  name: string
  quantity: string | null
  unit: string | null
}

export type StapleInput = { name: string; quantity: string; unit: string }

export function fetchStaples() {
  return request<Staple[]>('/dinner/staples')
}

export function createStaple(staple: StapleInput) {
  return post<Staple>('/dinner/staples', staple)
}

export function updateStaple(id: number, staple: StapleInput) {
  return request<Staple>(`/dinner/staples/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(staple),
  })
}

export function deleteStaple(id: number) {
  return request<{ ok: true }>(`/dinner/staples/${id}`, { method: 'DELETE' })
}
