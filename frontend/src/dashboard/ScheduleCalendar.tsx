import { useState, useEffect } from 'react'
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
// react-big-calendar requires its own CSS baseline; overrideCSS below patches it
// to match the project's sharp-UI conventions (borderRadius: 0, etc.)
import 'react-big-calendar/lib/css/react-big-calendar.css'

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
`

let styleInjected = false

const MIN_TIME = new Date()
MIN_TIME.setHours(8, 0, 0, 0)

export default function ScheduleCalendar() {
  const [view, setView] = useState<View>('week')

  useEffect(() => {
    if (styleInjected) return
    const tag = document.createElement('style')
    tag.textContent = overrideCSS
    document.head.appendChild(tag)
    styleInjected = true
  }, [])

  return (
    <Calendar
      localizer={localizer}
      events={[]}
      view={view}
      onView={setView}
      views={['week', 'day']}
      min={MIN_TIME}
      style={{ height: 500 }}
    />
  )
}
