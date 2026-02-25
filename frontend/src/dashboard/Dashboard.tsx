import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import LearnForm from "./LearnForm";

interface LessonPlan {
  id: number;
  title: string;
  plan: string;
  created_at: string;
}

export default function Dashboard() {
  const [showLearnForm, setShowLearnForm] = useState(false);
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<LessonPlan | null>(null);

  async function fetchPlans() {
    try {
      const res = await fetch("http://localhost:8000/lesson-plans");
      const data = await res.json();
      setPlans(data.plans);
    } catch {
      // silently fail — empty list is fine
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPlans(); }, []);

  function handleFormClose() {
    setShowLearnForm(false);
    fetchPlans(); // re-fetch in case a plan was saved
  }

  return (
    <div style={s.dashboard}>
      <section style={s.section}>
        <h2 style={s.sectionTitle}>Goals</h2>

        {loading ? (
          <div style={s.emptyBox}>
            <p style={s.empty}>Loading…</p>
          </div>
        ) : plans.length === 0 ? (
          <div style={s.emptyBox}>
            <p style={s.empty}>No goals yet.</p>
          </div>
        ) : (
          <div style={s.planList}>
            {plans.map((plan) => (
              <button
                key={plan.id}
                style={s.planCard}
                onClick={() => setSelectedPlan(plan)}
              >
                <span style={s.planTitle}>{plan.title}</span>
                <span style={s.planDate}>
                  {new Date(plan.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <button style={s.learnBtn} onClick={() => setShowLearnForm(true)}>
        + Learn something new
      </button>

      {showLearnForm && <LearnForm onClose={handleFormClose} />}

      {selectedPlan && (
        <div style={s.overlay} onClick={() => setSelectedPlan(null)}>
          <div style={s.viewer} onClick={(e) => e.stopPropagation()}>
            <div style={s.viewerHeader}>
              <h3 style={s.viewerTitle}>{selectedPlan.title}</h3>
              <button style={s.closeBtn} onClick={() => setSelectedPlan(null)}>✕</button>
            </div>
            <div style={s.viewerBody}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedPlan.plan}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
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
  emptyBox: {
    minHeight: 80,
    border: "1px dashed #d1d5db",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { margin: 0, fontSize: 13, color: "#9ca3af" },
  planList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  planCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    transition: "background 0.1s",
  },
  planTitle: { fontSize: 14, fontWeight: 600, color: "#111827" },
  planDate: { fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" },
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
  // Plan viewer modal
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  viewer: {
    background: "#fff",
    borderRadius: 16,
    width: 600,
    height: "85vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
    overflow: "hidden",
  },
  viewerHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px",
    borderBottom: "1px solid #e5e7eb",
    flexShrink: 0,
  },
  viewerTitle: { margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" },
  closeBtn: {
    border: "none",
    background: "transparent",
    fontSize: 16,
    cursor: "pointer",
    color: "#6b7280",
    padding: "4px 8px",
    borderRadius: 6,
  },
  viewerBody: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 24px",
    fontSize: 14,
    lineHeight: 1.7,
    color: "#111827",
  },
};
