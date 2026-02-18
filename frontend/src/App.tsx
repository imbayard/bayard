import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Role = "user" | "assistant";

interface Message {
  role: Role;
  content: string;
}

export default function App() {
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
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      setMessages([...updated, { role: "assistant", content: data.response }]);
    } catch {
      setMessages([
        ...updated,
        { role: "assistant", content: "Error: could not reach backend." },
      ]);
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
    <div style={styles.container}>
      <header style={styles.header}>Coach</header>

      <div style={styles.messages}>
        {messages.map((m, i) => (
          <div key={i} style={m.role === "user" ? styles.userMsg : styles.assistantMsg}>
            <span style={styles.role}>{m.role === "user" ? "You" : "Coach"}</span>
            {m.role === "assistant" ? (
              <div style={styles.markdown}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            ) : (
              <p style={styles.text}>{m.content}</p>
            )}
          </div>
        ))}
        {loading && (
          <div style={styles.assistantMsg}>
            <span style={styles.role}>Coach</span>
            <p style={styles.text}>…</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={styles.inputRow}>
        <textarea
          style={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message Coach… (Enter to send, Shift+Enter for newline)"
          rows={3}
        />
        <button style={styles.button} onClick={send} disabled={loading}>
          Send
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
