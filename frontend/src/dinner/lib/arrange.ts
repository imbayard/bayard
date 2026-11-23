import type { Meal, PlanSlot } from './api'

// Arrange mode: a browser-only scratchpad for drag and drop, applied once by the server.
// Each cell holds a main card plus any cards bumped by a drop; `origin` is the cell a card started in.
export interface Card {
  recipe_id: number
  source: PlanSlot['source']
  source_day: number | null
  origin: string
}

export interface Cell {
  main: Card | null
  bumped: Card[]
}

export type Cells = Record<string, Cell>

// The card being dragged: its cell, and its index among the bumped cards (null = the main card).
export interface Lift {
  key: string
  index: number | null
  meal: Meal
}

export const cellKey = (day: number, meal: Meal) => `${day}-${meal}`

export function toCells(slots: PlanSlot[]): Cells {
  return Object.fromEntries(
    slots.map((s) => {
      const key = cellKey(s.day, s.meal)
      const main = s.servings > 0 && s.recipe_id !== null ? { recipe_id: s.recipe_id, source: s.source, source_day: s.source_day, origin: key } : null
      return [key, { main, bumped: [] }]
    }),
  )
}

// The dropped card becomes the cell's main card; the one there shrinks to a bumped card in the same cell.
// Leftovers aren't bumped — they're re-derived on Apply anyway. A main card leaving its cell gives the
// spot back to a card bumped from that same cell, so dropping a card back where it came from undoes a bump.
export function drop(cells: Cells, from: Lift, to: string): Cells {
  if (from.key === to && from.index === null) return cells
  const next: Cells = Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, { main: c.main, bumped: [...c.bumped] }]))
  const src = next[from.key]
  let card: Card
  if (from.index === null) {
    card = src.main!
    const back = src.bumped.findIndex((c) => c.origin === from.key)
    src.main = back >= 0 ? src.bumped.splice(back, 1)[0] : null
  } else {
    card = src.bumped.splice(from.index, 1)[0]
  }
  const dest = next[to]
  if (dest.main && dest.main.source !== 'leftover') dest.bumped.push(dest.main)
  dest.main = card
  return next
}

export function discard(cells: Cells, key: string, index: number): Cells {
  return { ...cells, [key]: { ...cells[key], bumped: cells[key].bumped.filter((_, i) => i !== index) } }
}

export const unplaced = (cells: Cells) => Object.values(cells).reduce((n, c) => n + c.bumped.length, 0)

// The arrangement as a draft for the server: each slot takes its cell's main card.
export function toSlots(slots: PlanSlot[], cells: Cells): PlanSlot[] {
  return slots.map((s) => {
    const main = cells[cellKey(s.day, s.meal)]?.main
    return { ...s, recipe_id: main?.recipe_id ?? null, source: main?.source ?? null, source_day: main?.source_day ?? null }
  })
}
