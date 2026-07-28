import { labelStyle } from './lib/styles'

export type AppId = 'coach'

interface Widget {
  id: AppId
  name: string
  version: string
  blurb: string
}

// Registry of launchable projects. Add a widget here as each project comes online.
const WIDGETS: Widget[] = [
  {
    id: 'coach',
    name: 'Coach',
    version: '1.0',
    blurb: 'Learning plans, coaching chat, and a debate mediator.',
  },
]

export default function Home({ onOpen }: { onOpen: (id: AppId) => void }) {
  return (
    <div style={s.container}>
      <header style={s.header}>
        <span style={s.headerTitle}>Bayard</span>
        <span style={s.headerSub}>Projects</span>
      </header>

      <div style={s.body}>
        <div style={s.grid}>
          {WIDGETS.map((w) => (
            <button key={w.id} style={s.card} onClick={() => onOpen(w.id)}>
              <div style={s.cardTop}>
                <span style={s.cardName}>{w.name}</span>
                <span style={s.cardVersion}>{w.version}</span>
              </div>
              <p style={s.cardBlurb}>{w.blurb}</p>
              <span style={s.cardOpen}>Open →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxWidth: 720,
    margin: '0 auto',
    fontFamily: 'system-ui, sans-serif',
    border: '1px solid #111827',
    boxSizing: 'border-box',
  },
  header: {
    padding: '10px 20px',
    background: '#111827',
    borderBottom: '2px solid #111827',
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: 800,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
  },
  headerSub: {
    ...labelStyle,
    color: '#9ca3af',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 20px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 16,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 16,
    textAlign: 'left',
    background: '#fff',
    border: '1px solid #111827',
    borderRadius: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottom: '2px solid #111827',
  },
  cardName: {
    fontSize: 13,
    fontWeight: 800,
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  cardVersion: {
    fontSize: 10,
    fontWeight: 800,
    color: '#9ca3af',
    letterSpacing: '0.1em',
  },
  cardBlurb: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.5,
    color: '#6b7280',
  },
  cardOpen: {
    ...labelStyle,
    color: '#111827',
  },
}
