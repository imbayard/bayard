import { useState } from "react";

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

const TOTAL_STEPS = LEARN_STEPS.length;

interface LearnFormState {
  topic: string;
  experience: string;
  explore: string;
  avoid: string;
  harshness: string;
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

  const isReview = step === TOTAL_STEPS;

  function setField(field: keyof LearnFormState) {
    return (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function close() {
    setStep(0);
    onClose();
  }

  return (
    <div style={s.overlay} onClick={close}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={s.title}>
          {isReview ? "Review your lesson plan" : "Learn something new"}
        </h3>

        {/* Progress bar */}
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

        {/* Step content */}
        {isReview ? (
          <div style={s.reviewStub}>
            <p style={s.empty}>Lesson plan will appear here…</p>
          </div>
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

        {/* Footer */}
        <div style={s.footer}>
          <button style={s.ghostBtn} onClick={close}>Cancel</button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button style={s.ghostBtn} onClick={() => setStep((n) => n - 1)}>Back</button>
            )}
            {isReview ? (
              <button style={s.primaryBtn}>Start learning</button>
            ) : step === TOTAL_STEPS - 1 ? (
              <button style={s.primaryBtn} onClick={() => setStep(TOTAL_STEPS)}>
                Generate lesson plan
              </button>
            ) : (
              <button style={s.primaryBtn} onClick={() => setStep((n) => n + 1)}>Next</button>
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
    width: 480,
    maxHeight: "90vh",
    overflowY: "auto",
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
  reviewStub: {
    flex: 1,
    minHeight: 160,
    border: "1px dashed #d1d5db",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { margin: 0, fontSize: 13, color: "#9ca3af" },
  label: { fontSize: 13, fontWeight: 600, color: "#374151" },
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
