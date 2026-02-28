import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Dashboard from "./dashboard/Dashboard";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

type Role = "user" | "assistant";
type View = "chat" | "dashboard";

interface Message {
  role: Role;
  content: string;
  preamble?: string;
  streaming?: boolean;
}

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const history = messages;
    const updated: Message[] = [...history, { role: "user", content: text }];
    const assistantIdx = updated.length;
    setMessages([...updated, { role: "assistant", content: "", preamble: "", streaming: true }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok || !res.body) throw new Error("Stream request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      outer: while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const raw of events) {
          if (!raw.trim()) continue;
          const lines = raw.split("\n");
          let eventType = "";
          let eventData = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) eventData = line.slice(6);
          }

          if (eventType === "preamble") {
            setMessages((prev) => {
              const next = [...prev];
              next[assistantIdx] = { ...next[assistantIdx], preamble: eventData };
              return next;
            });
          } else if (eventType === "response.message") {
            const token = eventData.replace(/\\n/g, "\n");
            setMessages((prev) => {
              const next = [...prev];
              const msg = next[assistantIdx];
              next[assistantIdx] = { ...msg, content: msg.content + token, preamble: "", streaming: true };
              return next;
            });
          } else if (eventType === "done") {
            setMessages((prev) => {
              const next = [...prev];
              next[assistantIdx] = { ...next[assistantIdx], streaming: false, preamble: "" };
              return next;
            });
            break outer;
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        if (next[assistantIdx]?.role === "assistant") {
          next[assistantIdx] = { role: "assistant", content: "Error: could not reach backend." };
        } else {
          next.push({ role: "assistant", content: "Error: could not reach backend." });
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div style={s.container}>
      <header style={s.header}>
        <span>Coach</span>
        <button
          style={{
            ...s.dashBtn,
            background: view === "chat" ? "#2563eb" : "transparent",
            color: view === "chat" ? "#fff" : "#374151",
          }}
          onClick={() => setView(view === "chat" ? "dashboard" : "chat")}
          title={view === "chat" ? "Dashboard" : "Chat"}
        >
          {view === "chat" ? "⊞" : "💬"}
        </button>
      </header>

      {view === "chat" ? (
        <>
          <div style={s.messages}>
            {messages.map((m, i) => (
              <div key={i} style={m.role === "user" ? s.userMsg : s.assistantMsg}>
                <span style={s.role}>{m.role === "user" ? "You" : "Coach"}</span>
                {m.role === "assistant" ? (
                  <>
                    {m.preamble && <p style={s.preamble}>{m.preamble}</p>}
                    <div style={s.markdown}>
                      {m.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
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
            <div ref={bottomRef} />
          </div>

          <div style={s.inputRow}>
            <textarea
              style={s.textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message Coach… (Enter to send, Shift+Enter for newline)"
              rows={3}
            />
            <button style={s.button} onClick={send} disabled={loading}>
              Send
            </button>
          </div>
        </>
      ) : (
        <Dashboard />
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    maxWidth: 720,
    margin: "0 auto",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    padding: "12px 16px",
    fontWeight: 700,
    fontSize: 18,
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dashBtn: {
    fontSize: 22,
    border: "none",
    borderRadius: 8,
    padding: "4px 8px",
    cursor: "pointer",
    lineHeight: 1,
    transition: "background 0.15s",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  userMsg: {
    alignSelf: "flex-end",
    background: "#2563eb",
    color: "#fff",
    borderRadius: 12,
    padding: "8px 12px",
    maxWidth: "75%",
  },
  assistantMsg: {
    alignSelf: "flex-start",
    background: "#f3f4f6",
    borderRadius: 12,
    padding: "8px 12px",
    maxWidth: "75%",
  },
  role: { fontSize: 11, fontWeight: 600, opacity: 0.6, display: "block", marginBottom: 2 },
  text: { margin: 0, whiteSpace: "pre-wrap" },
  markdown: { fontSize: 14, lineHeight: 1.6 },
  preamble: {
    margin: "0 0 6px 0",
    fontSize: 12,
    fontStyle: "italic",
    opacity: 0.65,
    color: "#374151",
  },
  cursor: { display: "inline-block" },
  inputRow: {
    display: "flex",
    gap: 8,
    padding: "12px 16px",
    borderTop: "1px solid #e5e7eb",
  },
  textarea: {
    flex: 1,
    resize: "none",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    fontFamily: "inherit",
  },
  button: {
    padding: "0 20px",
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
};
