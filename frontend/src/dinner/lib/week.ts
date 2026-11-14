export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d
}

// Today if it's Sunday, otherwise the next one.
export function upcomingSunday() {
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return isoDate(d)
}

export function dayLabel(weekStart: string, day: number) {
  const d = addDays(weekStart, day)
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`
}
