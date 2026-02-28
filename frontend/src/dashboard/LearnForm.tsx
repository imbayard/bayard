import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ModuleCard from "./ModuleCard";
import type { Module } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

interface Props {
  onClose: () => void;
}

const LEARN_STEPS: { label: string; field: keyof LearnFormState; rows: number }[] = [
  { label: "What do you want to learn about and why?", field: "topic", rows: 4 },
  { label: "What is your experience level?", field: "experience", rows: 3 },
  { label: "Anything specific you want us to explore?", field: "explore", rows: 3 },
  { label: "Anything you want to avoid?", field: "avoid", rows: 3 },
  { label: "How harsh should I be with you?", field: "harshness", rows: 3 },
];

const TOTAL_STEPS = LEARN_STEPS.length; // 5 — last question step index is TOTAL_STEPS - 1
const REVIEW_STEP = TOTAL_STEPS;        // 5
const TITLE_STEP  = TOTAL_STEPS + 1;   // 6

interface LearnFormState {
  topic: string;
  experience: string;
  explore: string;
  avoid: string;
  harshness: string;
}

function extractH1(markdown: string): string {
  const firstLine = markdown.split("\n")[0] ?? "";
  return firstLine.replace(/^#\s+/, "").trim();
}

export default function LearnForm({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<LearnFormState>({
    topic: "",
    experience: "",
    explore: "",
    avoid: "",
    harshness: "",
  });
  const [lessonPlan, setLessonPlan] = useState<string | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [generating, setGenerating] = useState(false);
  const [planTitle, setPlanTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [planCollapsed, setPlanCollapsed] = useState(true);
  const [planCopied, setPlanCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReview    = step === REVIEW_STEP;
  const isTitleStep = step === TITLE_STEP;

  function setField(field: keyof LearnFormState) {
    return (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function close() {
    setStep(0);
    setLessonPlan(null);
    setModules([]);
    setPlanTitle("");
    setPlanCollapsed(true);
    onClose();
  }

  function copyPlan() {
    navigator.clipboard.writeText(lessonPlan ?? "");
    setPlanCopied(true);
    setTimeout(() => setPlanCopied(false), 2000);
  }

  async function generatePlan() {
    setStep(REVIEW_STEP);
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE}/lesson-plan/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setLessonPlan(data.markdown);
      setModules(data.modules ?? []);
    } catch {
      setLessonPlan("Failed to generate lesson plan. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function goToTitleStep() {
    setPlanTitle(extractH1(lessonPlan ?? ""));
    setStep(TITLE_STEP);
  }

  async function save() {
    if (!planTitle.trim() || !lessonPlan) return;
    setSaving(true);
    setError(null);
    try {
      await fetch(`${API_BASE}/lesson-plan/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: planTitle.trim(), plan: lessonPlan, modules }),
      });
      close();
    } catch {
      setError("Could not save plan. Is the backend running?");
    } finally {
      setSaving(false);
    }
  }

  // ── Header title ────────────────────────────────────────────────────────────
  const modalTitle = isTitleStep
    ? "Name your lesson plan"
    : isReview
    ? "Review your lesson plan"
    : "Learn something new";

  return (
    <div style={s.overlay} onClick={close}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={s.title}>{modalTitle}</h3>

        {/* Progress bar — only shown during questions and review */}
        {!isTitleStep && (
          <div style={s.progressRow}>
            <div style={s.progressTrack}>
              <div
                style={{
                  ...s.progressFill,
                  width: `${(Math.min(step, TOTAL_STEPS) / TOTAL_STEPS) * 100}%`,
                }}
              />
            </div>
            <span style={s.progressLabel}>
              {isReview ? `${TOTAL_STEPS} / ${TOTAL_STEPS}` : `${step} / ${TOTAL_STEPS}`}
            </span>
          </div>
        )}

        {/* Step content */}
        {isTitleStep ? (
          <div style={s.titleStepBox}>
            <label style={s.label}>Title</label>
            <input
              style={s.titleInput}
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              autoFocus
            />
          </div>
        ) : isReview ? (
          generating ? (
            <div style={s.loaderBox}>
              <div style={s.spinner} />
              <p style={s.loaderText}>Generating your lesson plan…</p>
            </div>
          ) : (
            <div style={s.reviewScroll}>
              <div style={s.planHeader}>
                <button style={s.collapseBtn} onClick={() => setPlanCollapsed((c) => !c)}>
                  <span style={{ ...s.chevron, transform: planCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▾</span>
                  Agent instructions
                </button>
                <button style={s.copyBtn} onClick={copyPlan}>
                  {planCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              {!planCollapsed && (
                <div style={s.planSection}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{lessonPlan ?? ""}</ReactMarkdown>
                </div>
              )}
              {modules.length > 0 && (
                <div style={s.modulesSection}>
                  <p style={s.modulesSectionTitle}>Modules</p>
                  {modules.map((m, i) => (
                    <ModuleCard key={i} module={m} position={i + 1} />
                  ))}
                </div>
              )}
            </div>
          )
        ) : (
          <>
            <label style={s.label}>{LEARN_STEPS[step].label}</label>
            <textarea
              style={s.formArea}
              rows={LEARN_STEPS[step].rows}
              value={form[LEARN_STEPS[step].field]}
              onChange={setField(LEARN_STEPS[step].field)}
              autoFocus
            />
          </>
        )}

        {error && (
          <div style={s.errorBar}>
            <span>{error}</span>
            <button style={s.errorDismiss} onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Footer */}
        <div style={s.footer}>
          <button style={s.ghostBtn} onClick={close} disabled={generating || saving}>
            Cancel
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && !generating && !saving && (
              <button
                style={s.ghostBtn}
                onClick={() => setStep((n) => n - 1)}
              >
                Back
              </button>
            )}
            {isTitleStep ? (
              <button
                style={s.primaryBtn}
                onClick={save}
                disabled={saving || !planTitle.trim()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            ) : isReview ? (
              <button
                style={s.primaryBtn}
                onClick={goToTitleStep}
                disabled={generating}
              >
                Start learning
              </button>
            ) : step === TOTAL_STEPS - 1 ? (
              <button style={s.primaryBtn} onClick={generatePlan}>
                Generate lesson plan
              </button>
            ) : (
              <button style={s.primaryBtn} onClick={() => setStep((n) => n + 1)}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  modal: {
    background: "#fff",
    borderRadius: 16,
    padding: "28px 24px",
    width: 560,
    height: "80vh",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  title: { margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" },
  progressRow: { display: "flex", alignItems: "center", gap: 10 },
  progressTrack: {
    flex: 1,
    height: 6,
    background: "#e5e7eb",
    borderRadius: 99,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#2563eb",
    borderRadius: 99,
    transition: "width 0.25s ease",
  },
  progressLabel: { fontSize: 12, fontWeight: 600, color: "#6b7280", whiteSpace: "nowrap" },
  loaderBox: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #e5e7eb",
    borderTop: "3px solid #2563eb",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loaderText: { margin: 0, fontSize: 14, color: "#6b7280" },
  reviewScroll: {
    flex: 1,
    overflowY: "auto",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  planHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    flexShrink: 0,
  },
  collapseBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: 0,
  },
  chevron: {
    fontSize: 14,
    display: "inline-block",
    transition: "transform 0.15s ease",
    color: "#9ca3af",
  },
  copyBtn: {
    padding: "3px 10px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "transparent",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
  },
  planSection: {
    fontSize: 14,
    lineHeight: 1.7,
    color: "#111827",
    maxHeight: 260,
    overflowY: "auto",
    borderBottom: "1px solid #e5e7eb",
    paddingBottom: 16,
    marginBottom: 16,
    flexShrink: 0,
  },
  modulesSection: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingBottom: 8,
  },
  modulesSectionTitle: {
    margin: "0 0 4px 0",
    fontSize: 13,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  titleStepBox: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 10,
  },
  label: { fontSize: 13, fontWeight: 600, color: "#374151" },
  titleInput: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 16,
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
    outline: "none",
  },
  formArea: {
    resize: "vertical",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  },
  errorBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderRadius: 8,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    fontSize: 13,
    color: "#991b1b",
  },
  errorDismiss: {
    border: "none",
    background: "transparent",
    color: "#991b1b",
    cursor: "pointer",
    fontSize: 13,
    padding: "0 4px",
  },
  footer: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  primaryBtn: {
    padding: "8px 20px",
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  ghostBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "transparent",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    color: "#374151",
  },
};
