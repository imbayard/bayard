import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Module, Artifact, QuizData } from "../types";

interface Props {
  module: Module;
  onClose: () => void;
  onComplete?: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL;

function persistArtifact(id: number, data: object) {
  fetch(`${API_BASE}/artifact/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  }).catch(() => {});
}

const TYPE_COLORS: Record<string, string> = {
  physical: "#7c3aed",
  conceptual: "#2563eb",
  applicable: "#16a34a",
};

function Checklist({ artifactId, items, initialChecked }: {
  artifactId: number;
  items: string[];
  initialChecked: boolean[];
}) {
  const [checked, setChecked] = useState<boolean[]>(
    items.map((_, i) => initialChecked[i] ?? false)
  );

  function toggle(i: number) {
    const next = checked.map((v, j) => (j === i ? !v : v));
    setChecked(next);
    persistArtifact(artifactId, { items, checked: next });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item, i) => (
        <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={checked[i]}
            onChange={() => toggle(i)}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <span style={{
            textDecoration: checked[i] ? "line-through" : "none",
            color: checked[i] ? "#9ca3af" : "#374151",
          }}>
            {item}
          </span>
        </label>
      ))}
    </div>
  );
}

function Quiz({ artifactId, questions, initialResponses }: {
  artifactId: number;
  questions: QuizData["questions"];
  initialResponses: NonNullable<QuizData["responses"]>;
}) {
  const [responses, setResponses] = useState<{ selected: string }[]>(initialResponses);
  const [pending, setPending] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  const qIdx = showResult ? responses.length - 1 : responses.length;
  const q = questions[qIdx];
  const score = responses.filter((r, i) => r.selected === questions[i].answer).length;
  const isComplete = !showResult && responses.length === questions.length;

  function persist(next: { selected: string }[]) {
    persistArtifact(artifactId, { questions, responses: next });
  }

  function submit() {
    if (!pending) return;
    const next = [...responses, { selected: pending }];
    setResponses(next);
    setShowResult(true);
    persist(next);
  }

  function advance() {
    setShowResult(false);
    setPending(null);
  }

  function retake() {
    const next: { selected: string }[] = [];
    setResponses(next);
    setShowResult(false);
    setPending(null);
    persist(next);
  }

  if (isComplete) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>{score}/{questions.length}</span>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            {Math.round((score / questions.length) * 100)}% correct
          </span>
        </div>
        {questions.map((qs, i) => {
          const correct = responses[i].selected === qs.answer;
          return (
            <div key={i} style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontWeight: 600, color: "#374151" }}>{i + 1}. {qs.question}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ color: correct ? "#16a34a" : "#dc2626" }}>
                  {correct ? "✓" : "✗"} {responses[i].selected}
                </span>
                {!correct && (
                  <span style={{ color: "#16a34a" }}>→ {qs.answer}</span>
                )}
              </div>
            </div>
          );
        })}
        <button
          style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "transparent", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}
          onClick={retake}
        >
          Retake
        </button>
      </div>
    );
  }

  if (!q) return null;

  const submitted = showResult ? responses[qIdx] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
          Question {qIdx + 1} of {questions.length}
        </span>
        {responses.length > 0 && (
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {score}/{responses.length} correct
          </span>
        )}
      </div>

      <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", lineHeight: 1.5 }}>{q.question}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {q.options.map((opt, i) => {
          let bg = "#fff", border = "1px solid #d1d5db", color = "#374151";
          if (submitted) {
            if (opt === q.answer)                                     { bg = "#dcfce7"; border = "1px solid #16a34a"; color = "#15803d"; }
            else if (opt === submitted.selected && opt !== q.answer)  { bg = "#fef2f2"; border = "1px solid #dc2626"; color = "#dc2626"; }
          } else if (opt === pending) {
            bg = "#eff6ff"; border = "1px solid #2563eb"; color = "#1d4ed8";
          }
          return (
            <button
              key={i}
              style={{ padding: "8px 12px", borderRadius: 8, border, background: bg, color, textAlign: "left", cursor: submitted ? "default" : "pointer", fontSize: 13, fontWeight: opt === q.answer && submitted ? 600 : 400 }}
              onClick={() => { if (!submitted) setPending(opt); }}
            >
              {opt}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {!submitted ? (
          <button
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: pending ? "#2563eb" : "#e5e7eb", color: pending ? "#fff" : "#9ca3af", fontWeight: 600, fontSize: 13, cursor: pending ? "pointer" : "default" }}
            disabled={!pending}
            onClick={submit}
          >
            Submit
          </button>
        ) : (
          <button
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            onClick={advance}
          >
            {responses.length === questions.length ? "See Results" : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}

function Flashcard({ front, back }: { front: string; back: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      style={{ perspective: "800px", cursor: "pointer" }}
      onClick={() => setFlipped((f) => !f)}
    >
      <div
        style={{
          display: "grid",
          transformStyle: "preserve-3d",
          transition: "transform 0.4s ease",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div
          style={{
            gridArea: "1 / 1",
            backfaceVisibility: "hidden",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 8,
            background: "#fff",
          }}
        >
          <span style={{ fontWeight: 700, color: "#111827", fontSize: 13 }}>{front}</span>
          <span style={{ fontSize: 11, color: "#d1d5db" }}>tap to flip</span>
        </div>
        <div
          style={{
            gridArea: "1 / 1",
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f9fafb",
          }}
        >
          <span style={{ color: "#374151", fontSize: 13, textAlign: "center" }}>{back}</span>
        </div>
      </div>
    </div>
  );
}

export default function ModuleModal({ module, onClose, onComplete }: Props) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [completing, setCompleting] = useState(false);

  async function handleComplete() {
    setCompleting(true);
    await fetch(`${API_BASE}/module/${module.id}/complete`, { method: "POST" });
    setCompleting(false);
    onComplete?.();
    onClose();
  }

  useEffect(() => {
    if (!module.id) return;

    fetch(`${API_BASE}/module/${module.id}/artifacts`)
      .then((r) => r.json())
      .then((d) => {
        const fetched: Artifact[] = d.artifacts ?? [];
        setArtifacts(fetched);

        const empty = fetched.filter((a) => Object.keys(a.data).length === 0);
        if (empty.length === 0) return;

        setGeneratingIds(new Set(empty.map((a) => a.id)));

        Promise.allSettled(
          empty.map((a) =>
            fetch(`${API_BASE}/artifact/${a.id}/generate`, { method: "POST" })
              .then((r) => r.json())
              .then((updated: Artifact) => {
                setArtifacts((prev) =>
                  prev.map((x) => (x.id === updated.id ? updated : x))
                );
                setGeneratingIds((prev) => {
                  const next = new Set(prev);
                  next.delete(a.id);
                  return next;
                });
              })
              .catch(() => {
                setGeneratingIds((prev) => {
                  const next = new Set(prev);
                  next.delete(a.id);
                  return next;
                });
              })
          )
        );
      })
      .catch(() => {});
  }, [module.id]);

  const typeColor = TYPE_COLORS[module.type] ?? "#6b7280";

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.headerLeft}>
            <h3 style={s.title}>{module.name}</h3>
            <span style={{ ...s.typeBadge, background: typeColor }}>
              {module.type}
            </span>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {module.status === "active" && (
          <div style={s.footer}>
            <button style={s.completeBtn} onClick={handleComplete} disabled={completing}>
              {completing ? "Saving…" : "Mark Complete"}
            </button>
          </div>
        )}

        <div style={s.body}>
          <p style={s.description}>{module.description}</p>

          {artifacts.length > 0 && (
            <div style={s.artifactsSection}>
              {artifacts.map((artifact) => (
                <div key={artifact.id} style={s.artifactCard}>
                  <div style={s.artifactHeader}>
                    <span style={s.artifactLabel}>
                      {artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1)}
                    </span>
                    {generatingIds.has(artifact.id) && (
                      <span style={s.spinner}>⟳ generating…</span>
                    )}
                  </div>
                  {!generatingIds.has(artifact.id) &&
                    Object.keys(artifact.data).length > 0 && (
                      <div style={s.artifactContent}>
                        {renderArtifact(artifact)}
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderArtifact(artifact: Artifact) {
  switch (artifact.type) {
    case "flashcards":
      return (
        <div style={s.flashcardGrid}>
          {artifact.data.cards.map((card, i) => (
            <Flashcard key={i} front={card.front} back={card.back} />
          ))}
        </div>
      );

    case "quiz":
      return (
        <Quiz
          artifactId={artifact.id}
          questions={artifact.data.questions}
          initialResponses={artifact.data.responses ?? []}
        />
      );

    case "exercise":
      return (
        <div>
          <div style={s.exerciseObjective}>{artifact.data.objective}</div>
          <ol style={s.stepList}>
            {artifact.data.steps.map((step, i) => (
              <li key={i} style={s.stepItem}>{step}</li>
            ))}
          </ol>
        </div>
      );

    case "reading":
      return (
        <div>
          <h4 style={s.readingTitle}>{artifact.data.title}</h4>
          <div style={s.readingBody}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.data.body}</ReactMarkdown>
          </div>
        </div>
      );

    case "video":
      return (
        <div>
          <div style={s.videoQuery}>Search: {artifact.data.query}</div>
          <ul style={s.bulletList}>
            {artifact.data.topics.map((t, i) => (
              <li key={i} style={s.bulletItem}>{t}</li>
            ))}
          </ul>
        </div>
      );

    case "project":
      return (
        <div>
          <p style={s.projectDescription}>{artifact.data.description}</p>
          <div style={s.deliverablesLabel}>Deliverables</div>
          <ul style={s.bulletList}>
            {artifact.data.deliverables.map((d, i) => (
              <li key={i} style={s.bulletItem}>{d}</li>
            ))}
          </ul>
        </div>
      );

    case "checklist":
      return (
        <Checklist
          artifactId={artifact.id}
          items={artifact.data.items}
          initialChecked={artifact.data.checked ?? []}
        />
      );

    case "reference":
      return (
        <div style={s.referenceSection}>
          {artifact.data.sections.map((sec, i) => (
            <div key={i}>
              <h5 style={s.refHeading}>{sec.heading}</h5>
              <p style={s.refContent}>{sec.content}</p>
            </div>
          ))}
        </div>
      );
  }
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  modal: {
    background: "#fff",
    borderRadius: 16,
    width: 640,
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px",
    borderBottom: "1px solid #e5e7eb",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  title: {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: "#111827",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  typeBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: "#fff",
    textTransform: "capitalize",
    padding: "2px 8px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  closeBtn: {
    border: "none",
    background: "transparent",
    fontSize: 16,
    cursor: "pointer",
    color: "#6b7280",
    padding: "4px 8px",
    borderRadius: 6,
    flexShrink: 0,
  },
  footer: {
    padding: "12px 24px",
    borderBottom: "1px solid #e5e7eb",
    flexShrink: 0,
  },
  completeBtn: {
    padding: "8px 18px",
    borderRadius: 8,
    border: "none",
    background: "#16a34a",
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  description: {
    margin: 0,
    fontSize: 14,
    color: "#374151",
    lineHeight: 1.6,
  },
  artifactsSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  artifactCard: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  artifactHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  artifactLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#374151",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  spinner: {
    fontSize: 12,
    color: "#9ca3af",
  },
  artifactContent: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 1.5,
  },
  // flashcards
  flashcardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 8,
  },
  // exercise
  exerciseObjective: { fontWeight: 700, color: "#111827", marginBottom: 8 },
  stepList: { margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 4 },
  stepItem: {},
  // reading
  readingTitle: { margin: "0 0 8px 0", fontSize: 14, fontWeight: 700, color: "#111827" },
  readingBody: { color: "#374151" },
  // video
  videoQuery: { fontWeight: 600, color: "#111827", marginBottom: 6 },
  // project
  projectDescription: { margin: "0 0 8px 0", color: "#374151" },
  deliverablesLabel: { fontWeight: 700, fontSize: 12, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 4 },
  // shared
  bulletList: { margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 2 },
  bulletItem: {},
  // reference
  referenceSection: { display: "flex", flexDirection: "column", gap: 10 },
  refHeading: { margin: "0 0 4px 0", fontSize: 13, fontWeight: 700, color: "#111827" },
  refContent: { margin: 0, color: "#374151" },
};
