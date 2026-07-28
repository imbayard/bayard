import { useState } from "react";
import CodeEditor from "@uiw/react-textarea-code-editor";
import { usePyodide } from "./usePyodide";

interface Props {
  description: string;
  starterCode: string;
  tests?: string;
}

export default function CodeRunner({ description, starterCode, tests }: Props) {
  const { runCode, loading } = usePyodide();
  const [code, setCode] = useState(starterCode);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  async function run(withTests: boolean) {
    setRunning(true);
    setOutput("");
    try {
      const src = withTests && tests ? code + "\n" + tests : code;
      const result = await runCode(src);
      setOutput(result);
    } catch (err: unknown) {
      setOutput(err instanceof Error ? err.message : String(err));
    }
    setRunning(false);
  }

  return (
    <div style={s.wrapper}>
      <p style={s.description}>{description}</p>

      <div style={s.editorWrap}>
        <CodeEditor
          value={code}
          language="python"
          onChange={(e) => setCode(e.target.value)}
          padding={14}
          style={s.editor}
          data-color-mode="dark"
        />
      </div>

      <div style={s.buttonRow}>
        <button
          style={{ ...s.btn, ...s.runBtn }}
          onClick={() => run(false)}
          disabled={running || loading}
        >
          {loading ? "Loading Python…" : running ? "Running…" : "Run"}
        </button>
        {tests && (
          <button
            style={{ ...s.btn, ...s.testBtn }}
            onClick={() => run(true)}
            disabled={running || loading}
          >
            Run Tests
          </button>
        )}
        <button
          style={{ ...s.btn, ...s.resetBtn }}
          onClick={() => { setCode(starterCode); setOutput(""); }}
        >
          Reset
        </button>
      </div>

      {output && <pre style={s.output}>{output}</pre>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: { display: "flex", flexDirection: "column", gap: 10 },
  description: { margin: 0, color: "#374151", fontSize: 13, lineHeight: 1.6 },
  editorWrap: { borderRadius: 0, overflow: "hidden", border: "1px solid #374151" },
  editor: {
    fontFamily: "'Fira Code', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.5,
    background: "#1e1e1e",
    minHeight: 160,
    borderRadius: 0,
  },
  buttonRow: { display: "flex", gap: 8 },
  btn: {
    padding: "7px 18px",
    borderRadius: 0,
    border: "none",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  runBtn: { background: "#16a34a", color: "#fff" },
  testBtn: { background: "#2563eb", color: "#fff" },
  resetBtn: { background: "transparent", color: "#374151", border: "1px solid #d1d5db" },
  output: {
    margin: 0,
    padding: 14,
    background: "#111827",
    color: "#e5e7eb",
    fontFamily: "'Fira Code', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.5,
    borderRadius: 0,
    border: "1px solid #374151",
    whiteSpace: "pre-wrap",
    minHeight: 40,
    maxHeight: 240,
    overflowY: "auto",
  },
};
