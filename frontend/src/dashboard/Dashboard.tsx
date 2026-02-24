import { useState } from "react";
import LearnForm from "./LearnForm";

export default function Dashboard() {
  const [showLearnForm, setShowLearnForm] = useState(false);

  return (
    <div style={s.dashboard}>
      <section style={s.section}>
        <h2 style={s.sectionTitle}>Goals</h2>
        <div style={s.goalsList}>
          <p style={s.empty}>No goals yet.</p>
        </div>
      </section>

      <button style={s.learnBtn} onClick={() => setShowLearnForm(true)}>
        + Learn something new
      </button>

      {showLearnForm && <LearnForm onClose={() => setShowLearnForm(false)} />}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  dashboard: {
    flex: 1,
    padding: "24px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  section: { display: "flex", flexDirection: "column", gap: 12 },
  sectionTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" },
  goalsList: {
    minHeight: 80,
    border: "1px dashed #d1d5db",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { margin: 0, fontSize: 13, color: "#9ca3af" },
  learnBtn: {
    alignSelf: "flex-start",
    padding: "10px 20px",
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
};
