import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { API_BASE } from '../lib/config'
import { readSSEStream } from '../lib/sse'
import { ghostBtnStyle, primaryBtnStyle, labelStyle, textStyle, markdownStyle, cursorStyle, inputRowStyle, textareaStyle } from '../lib/styles'

type Phase = 'setup' | 'debate'

interface MediatorMsg {
  speaker: 'a' | 'b' | 'mediator'
  name: string
  content: string
  streaming?: boolean
}

interface SetupState {
  topic: string
  botAName: string
  botAPoints: string
  botBName: string
  botBPoints: string
}

export default function Mediator() {
  const [phase, setPhase] = useState<Phase>('setup')
  const [setup, setSetup] = useState<SetupState>({
    topic: '',
    botAName: 'Side A',
    botAPoints: '',
    botBName: 'Side B',
    botBPoints: '',
  })
  const [messages, setMessages] = useState<MediatorMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function parsePoints(raw: string): string[] {
    return raw
      .split('\n')
      .map((l) => l.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean)
  }

  async function startDebate() {
    if (!setup.topic.trim() || !setup.botAPoints.trim() || !setup.botBPoints.trim()) return
    setPhase('debate')
    setMessages([])
    await runRound([])
  }

  async function sendMediator() {
    const text = input.trim()
    if (!text || loading) return
    const mediatorMsg: MediatorMsg = { speaker: 'mediator', name: 'You', content: text }
    const updated = [...messages, mediatorMsg]
    setMessages(updated)
    setInput('')
    await runRound(
      updated.map((m) => ({ speaker: m.speaker, name: m.name, content: m.content }))
    )
  }

  async function runRound(history: { speaker: string; name: string; content: string }[]) {
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/mediator/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: setup.topic,
          bot_a_name: setup.botAName || 'Side A',
          bot_a_points: parsePoints(setup.botAPoints),
          bot_b_name: setup.botBName || 'Side B',
          bot_b_points: parsePoints(setup.botBPoints),
          history,
        }),
      })

      if (!res.ok || !res.body) throw new Error('Stream failed')

      let currentIdx: number | null = null

      await readSSEStream(res.body, (eventType, eventData) => {
        if (eventType === 'speaker') {
          const { id, name } = JSON.parse(eventData)
          setMessages((prev) => {
            const next = [...prev, { speaker: id, name, content: '', streaming: true } as MediatorMsg]
            currentIdx = next.length - 1
            return next
          })
        } else if (eventType === 'delta' && currentIdx !== null) {
          const { text } = JSON.parse(eventData)
          const idx = currentIdx
          setMessages((prev) => {
            const next = [...prev]
            next[idx] = { ...next[idx], content: next[idx].content + text }
            return next
          })
        } else if (eventType === 'turn_done' && currentIdx !== null) {
          const idx = currentIdx
          setMessages((prev) => {
            const next = [...prev]
            next[idx] = { ...next[idx], streaming: false }
            return next
          })
        }
      })
    } catch {
      setMessages((prev) => [
        ...prev,
        { speaker: 'mediator', name: 'System', content: 'Error: could not reach backend.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setPhase('setup')
    setMessages([])
    setInput('')
    setLoading(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMediator()
    }
  }

  if (phase === 'setup') {
    return (
      <div style={s.setupContainer}>
        <div style={s.setupInner}>
          <h2 style={s.setupTitle}>Mediator</h2>
          <p style={s.setupSubtitle}>Define the topic and both sides of the argument.</p>

          <label style={s.label}>Topic</label>
          <input
            style={s.input}
            value={setup.topic}
            onChange={(e) => setSetup({ ...setup, topic: e.target.value })}
            placeholder="e.g. Should we migrate to microservices?"
          />

          <div style={s.sidesRow}>
            <div style={s.sideCol}>
              <label style={s.label}>
                <input
                  style={s.nameInput}
                  value={setup.botAName}
                  onChange={(e) => setSetup({ ...setup, botAName: e.target.value })}
                />
              </label>
              <textarea
                style={s.pointsArea}
                value={setup.botAPoints}
                onChange={(e) => setSetup({ ...setup, botAPoints: e.target.value })}
                placeholder={"One point per line\n- Better scalability\n- Team autonomy"}
                rows={6}
              />
            </div>
            <div style={s.divider} />
            <div style={s.sideCol}>
              <label style={s.label}>
                <input
                  style={s.nameInput}
                  value={setup.botBName}
                  onChange={(e) => setSetup({ ...setup, botBName: e.target.value })}
                />
              </label>
              <textarea
                style={s.pointsArea}
                value={setup.botBPoints}
                onChange={(e) => setSetup({ ...setup, botBPoints: e.target.value })}
                placeholder={"One point per line\n- Added complexity\n- Operational overhead"}
                rows={6}
              />
            </div>
          </div>

          <button
            style={{
              ...s.startBtn,
              opacity: setup.topic.trim() && setup.botAPoints.trim() && setup.botBPoints.trim() ? 1 : 0.4,
            }}
            onClick={startDebate}
            disabled={!setup.topic.trim() || !setup.botAPoints.trim() || !setup.botBPoints.trim()}
          >
            Start Debate
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.debateContainer}>
      <div style={s.debateHeader}>
        <span style={s.debateTopic}>{setup.topic}</span>
        <button style={s.resetBtn} onClick={reset}>New Debate</button>
      </div>

      <div style={s.messagesArea}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={
              m.speaker === 'mediator'
                ? s.mediatorMsg
                : m.speaker === 'a'
                ? s.botAMsg
                : s.botBMsg
            }
          >
            <span
              style={{
                ...s.speakerLabel,
                color: m.speaker === 'a' ? '#2563eb' : m.speaker === 'b' ? '#dc2626' : '#9ca3af',
              }}
            >
              {m.name}
            </span>
            {m.speaker === 'mediator' ? (
              <p style={s.text}>{m.content}</p>
            ) : (
              <div style={s.markdown}>
                {m.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                ) : m.streaming ? (
                  <span style={s.cursor}>▊</span>
                ) : null}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={s.inputRow}>
        <textarea
          style={s.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={loading ? 'Bots are debating…' : 'Ask a question or guide the debate…'}
          rows={2}
          disabled={loading}
        />
        <button style={s.sendBtn} onClick={sendMediator} disabled={loading}>
          {loading ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  // ── Setup phase ──
  setupContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '40px 20px',
    display: 'flex',
    justifyContent: 'center',
  },
  setupInner: {
    width: '100%',
    maxWidth: 600,
  },
  setupTitle: { ...labelStyle, fontSize: 14, margin: '0 0 4px 0' },
  setupSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    margin: '0 0 24px 0',
  },
  label: { ...labelStyle, color: '#6b7280', marginBottom: 6 },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '2px solid #111827',
    borderRadius: 0,
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    marginBottom: 20,
    boxSizing: 'border-box',
  },
  sidesRow: {
    display: 'flex',
    gap: 0,
    marginBottom: 24,
  },
  sideCol: {
    flex: 1,
  },
  divider: {
    width: 2,
    background: '#e5e7eb',
    margin: '0 16px',
    alignSelf: 'stretch',
  },
  nameInput: {
    ...labelStyle,
    border: 'none',
    borderBottom: '2px solid #111827',
    borderRadius: 0,
    padding: '4px 0',
    outline: 'none',
    width: '100%',
    fontFamily: 'inherit',
    marginBottom: 8,
  },
  pointsArea: {
    width: '100%',
    padding: '10px 12px',
    border: '2px solid #111827',
    borderRadius: 0,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  startBtn: { ...primaryBtnStyle, padding: '12px 32px', width: '100%' },

  // ── Debate phase ──
  debateContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  debateHeader: {
    padding: '10px 20px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  debateTopic: {
    fontSize: 12,
    fontWeight: 700,
    color: '#111827',
  },
  resetBtn: ghostBtnStyle,
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  botAMsg: {
    alignSelf: 'flex-start',
    borderLeft: '3px solid #2563eb',
    paddingLeft: 14,
    maxWidth: '80%',
  },
  botBMsg: {
    alignSelf: 'flex-end',
    borderRight: '3px solid #dc2626',
    paddingRight: 14,
    maxWidth: '80%',
  },
  mediatorMsg: {
    alignSelf: 'center',
    background: '#111827',
    color: '#fff',
    padding: '8px 16px',
    maxWidth: '72%',
  },
  speakerLabel: { ...labelStyle, marginBottom: 4 },
  text: textStyle,
  markdown: markdownStyle,
  cursor: cursorStyle,
  inputRow: inputRowStyle,
  textarea: textareaStyle,
  sendBtn: primaryBtnStyle,
}
