import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Dashboard from './dashboard/Dashboard'

const API_BASE = import.meta.env.VITE_API_BASE_URL

type Role = 'user' | 'assistant'
type View = 'chat' | 'dashboard'

interface Message {
  role: Role
  content: string
  preamble?: string
  streaming?: boolean
}

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(triggerMessage?: string) {
    const text = (triggerMessage ?? input).trim()
    if (!text || loading) return

    const history = messages.map(({ role, content }) => ({ role, content }))
    const updated: Message[] = [...history, { role: 'user', content: text }]
    const assistantIdx = updated.length
    setMessages([
      ...updated,
      { role: 'assistant', content: '', preamble: '', streaming: true },
    ])
    if (!triggerMessage) setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })

      if (!res.ok || !res.body) throw new Error('Stream request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      outer: while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const raw of events) {
          if (!raw.trim()) continue
          const lines = raw.split('\n')
          let eventType = ''
          let eventData = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7)
            else if (line.startsWith('data: ')) eventData = line.slice(6)
          }

          if (eventType === 'preamble') {
            setMessages((prev) => {
              const next = [...prev]
              next[assistantIdx] = {
                ...next[assistantIdx],
                preamble: eventData,
              }
              return next
            })
          } else if (eventType === 'response.message') {
            const token = eventData.replace(/\\n/g, '\n')
            setMessages((prev) => {
              const next = [...prev]
              const msg = next[assistantIdx]
              next[assistantIdx] = {
                ...msg,
                content: msg.content + token,
                preamble: '',
                streaming: true,
              }
              return next
            })
          } else if (eventType === 'done') {
            setMessages((prev) => {
              const next = [...prev]
              next[assistantIdx] = {
                ...next[assistantIdx],
                streaming: false,
                preamble: '',
              }
              return next
            })
            break outer
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev]
        if (next[assistantIdx]?.role === 'assistant') {
          next[assistantIdx] = {
            role: 'assistant',
            content: 'Error: could not reach backend.',
          }
        } else {
          next.push({
            role: 'assistant',
            content: 'Error: could not reach backend.',
          })
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  function handleLessonComplete(title: string) {
    setView('chat')
    send(`Analyze my lesson: ${title}`)
  }

  function handleLearnNew() {
    setView('chat')
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `What would you like to learn? To put together the right plan for you, tell me:\n\n- Why do you want to learn this?\n- What's your current experience level?\n- Anything specific you want to explore or avoid?\n- How challenging should I be with you?`,
      },
    ])
  }

  function sendFromDashboard() {
    if (!input.trim() || loading) return
    setView('chat')
    send()
  }

  function onDashboardKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendFromDashboard()
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={s.container}>
      <header style={s.header}>
        <span style={s.headerTitle}>Coach</span>
        <button
          style={s.navBtn}
          onClick={() => setView(view === 'chat' ? 'dashboard' : 'chat')}
        >
          {view === 'chat' ? 'Dashboard →' : '← Chat'}
        </button>
      </header>

      {view === 'chat' ? (
        <div style={s.messages}>
          {messages.map((m, i) => (
            <div key={i} style={m.role === 'user' ? s.userMsg : s.assistantMsg}>
              <span style={s.role}>{m.role === 'user' ? 'You' : 'Coach'}</span>
              {m.role === 'assistant' ? (
                <>
                  {m.preamble && <p style={s.preamble}>{m.preamble}</p>}
                  <div style={s.markdown}>
                    {m.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content}
                      </ReactMarkdown>
                    ) : m.streaming && !m.preamble ? (
                      <span style={s.cursor}>▊</span>
                    ) : null}
                  </div>
                </>
              ) : (
                <p style={s.text}>{m.content}</p>
              )}
            </div>
          ))}
          {messages.length === 0 && (
            <p style={s.emptyChat}>Send a message to start a session.</p>
          )}
          <div ref={bottomRef} />
        </div>
      ) : (
        <Dashboard onLessonComplete={handleLessonComplete} onLearnNew={handleLearnNew} />
      )}

      <div style={s.inputRow}>
        <textarea
          style={s.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={view === 'chat' ? onKeyDown : onDashboardKeyDown}
          placeholder="Message Coach…"
          rows={2}
        />
        <button
          style={s.button}
          onClick={view === 'chat' ? () => send() : sendFromDashboard}
          disabled={loading}
        >
          {loading ? '…' : 'Send'}
        </button>
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
    alignItems: 'center',
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
  navBtn: {
    fontSize: 10,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: '#9ca3af',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  userMsg: {
    alignSelf: 'flex-end',
    background: '#111827',
    color: '#fff',
    padding: '10px 14px',
    maxWidth: '72%',
  },
  assistantMsg: {
    alignSelf: 'flex-start',
    borderLeft: '2px solid #111827',
    paddingLeft: 14,
    maxWidth: '80%',
  },
  role: {
    fontSize: 10,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: '#9ca3af',
    display: 'block',
    marginBottom: 6,
  },
  text: { margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' },
  markdown: { fontSize: 14, lineHeight: 1.6 },
  preamble: {
    margin: '0 0 6px 0',
    fontSize: 12,
    fontStyle: 'italic',
    color: '#9ca3af',
  },
  cursor: { display: 'inline-block' },
  emptyChat: {
    margin: 0,
    fontSize: 13,
    color: '#9ca3af',
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
  },
  inputRow: {
    display: 'flex',
    borderTop: '2px solid #111827',
  },
  textarea: {
    flex: 1,
    resize: 'none',
    padding: '12px 16px',
    border: 'none',
    borderRight: '1px solid #e5e7eb',
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
  },
  button: {
    padding: '0 24px',
    border: 'none',
    background: '#111827',
    color: '#fff',
    fontSize: 10,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    cursor: 'pointer',
    flexShrink: 0,
  },
}
