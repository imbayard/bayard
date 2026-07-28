import { useState, useEffect } from 'react'
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
// react-big-calendar requires its own CSS baseline; overrideCSS below patches it
// to match the project's sharp-UI conventions (borderRadius: 0, etc.)
import 'react-big-calendar/lib/css/react-big-calendar.css'
import EventModal from './EventModal'
import type { CalendarEvent } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS },
})

const overrideCSS = `
  .rbc-calendar, .rbc-calendar * { border-radius: 0 !important; }
  .rbc-toolbar button { border-radius: 0 !important; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; border-color: #e5e7eb; }
  .rbc-toolbar button.rbc-active, .rbc-toolbar button:active { background: #111827 !important; color: #fff !important; border-color: #111827 !important; }
  .rbc-toolbar button:hover { background: #f3f4f6 !important; color: #111827 !important; }
  .rbc-toolbar-label { font-size: 13px; font-weight: 700; color: #111827; letter-spacing: 0.04em; }
  .rbc-allday-cell { display: none; }
  .rbc-time-header-content { border-top: none; }
  .rbc-header { background: #111827; color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; padding: 8px 4px 10px; border-color: #374151 !important; }
  .rbc-time-header-gutter, .rbc-time-gutter { font-size: 11px; color: #9ca3af; }
  .rbc-timeslot-group { border-color: #e5e7eb; }
  .rbc-time-content { border-color: #e5e7eb; }
  .rbc-day-slot .rbc-time-slot { border-color: #f3f4f6; }
  .rbc-time-view { border-color: #e5e7eb; }
  .rbc-time-header { border-color: #e5e7eb; }
  .rbc-current-time-indicator { background: #111827; }
  .rbc-event { border: none !important; border-radius: 0 !important; font-size: 11px; }
  .rbc-event.event-module { background: #111827 !important; }
  .rbc-event.event-habit  { background: #374151 !important; }
  .rbc-event.event-external { background: #9ca3af !important; }
`

let styleInjected = false

const MIN_TIME = new Date()
MIN_TIME.setHours(8, 0, 0, 0)

export default function ScheduleCalendar() {
  useEffect(() => {
    if (styleInjected) return
    const tag = document.createElement('style')
    tag.textContent = overrideCSS
    document.head.appendChild(tag)
    styleInjected = true
  }, [])

  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [view, setView] = useState<View>('week')
  const [date, setDate] = useState(new Date())
  const [range, setRange] = useState<{ start: Date; end: Date }>(() => {
    const start = startOfWeek(new Date(), { locale: enUS })
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return { start, end }
  })
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/oauth/status`)
      .then((r) => r.json())
      .then((d) => setAuthenticated(d.authenticated))
      .catch(() => setAuthenticated(false))
  }, [])

  async function fetchEvents(start: Date, end: Date) {
    try {
      const res = await fetch(
        `${API_BASE}/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`
      )
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      if (!res.ok) return
      const data = await res.json()
      setEvents(
        data.events.map((e: { id: string; title: string; start: string; end: string; type: CalendarEvent['type']; series_id?: string; module_id?: number }) => ({
          ...e,
          start: new Date(e.start),
          end: new Date(e.end),
        }))
      )
    } catch { /* backend may not be running */ }
  }

  useEffect(() => {
    if (authenticated) fetchEvents(range.start, range.end)
  }, [authenticated, range])

  function onRangeChange(r: Date[] | { start: Date; end: Date }) {
    if (Array.isArray(r)) {
      setRange({ start: r[0], end: r[r.length - 1] })
    } else {
      setRange({ start: r.start, end: r.end })
    }
  }

  async function onSelectEvent(event: CalendarEvent) {
    if (event.type === 'external') return  // can't delete external events

    const label = event.type === 'habit'
      ? `Delete habit "${event.title}"? This removes all occurrences.`
      : `Delete this "${event.title}" block?`
    if (!window.confirm(label)) return

    // For habits, delete the base recurring event (series_id) to remove all instances
    const idToDelete = event.type === 'habit' && event.series_id
      ? event.series_id
      : event.id

    try {
      const res = await fetch(`${API_BASE}/calendar/events/${encodeURIComponent(idToDelete)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      fetchEvents(range.start, range.end)
    } catch {
      window.alert('Could not delete the event. Please try again.')
    }
  }

  if (authenticated === null) return null

  if (!authenticated) {
    return (
      <div style={s.authPrompt}>
        <p style={s.authText}>Connect Google Calendar to use the scheduler.</p>
        <a href={`${API_BASE}/oauth/start`} style={s.authBtn}>
          Connect Google Calendar
        </a>
      </div>
    )
  }

  return (
    <>
      <Calendar
        localizer={localizer}
        events={events}
        view={view}
        onView={setView}
        date={date}
        onNavigate={setDate}
        views={['week', 'day']}
        min={MIN_TIME}
        selectable
        onSelectSlot={(s) => setSlot({ start: s.start, end: s.end })}
        onSelectEvent={onSelectEvent}
        onRangeChange={onRangeChange}
        eventPropGetter={(event) => ({ className: `event-${event.type}` })}
        style={{ height: 500, maxWidth: '100%' }}
      />
      {slot && (
        <EventModal
          slotStart={slot.start}
          slotEnd={slot.end}
          onSaved={() => { setSlot(null); fetchEvents(range.start, range.end) }}
          onClose={() => setSlot(null)}
        />
      )}
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  authPrompt: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
    padding: '20px',
    border: '1px solid #e5e7eb',
  },
  authText: {
    margin: 0,
    fontSize: 13,
    color: '#6b7280',
  },
  authBtn: {
    padding: '7px 14px',
    background: '#111827',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    textDecoration: 'none',
    display: 'inline-block',
  },
}
