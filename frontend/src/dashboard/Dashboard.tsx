import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import LearnForm from "./LearnForm";
import ModuleCard from "./ModuleCard";
import ModuleModal from "./ModuleModal";
import type { Module, LessonPlan } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function Dashboard() {
  const [showLearnForm, setShowLearnForm] = useState(false);
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<LessonPlan | null>(null);
  const [selectedModules, setSelectedModules] = useState<Module[]>([]);
  const [planCollapsed, setPlanCollapsed] = useState(true);
  const [planCopied, setPlanCopied] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [learnHovered, setLearnHovered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);

  async function fetchPlans() {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/lesson-plans`);
      const data = await res.json();
      setPlans(data.plans);
    } catch {
      setError("Could not load plans. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPlans(); }, []);

  function handleFormClose() {
    setShowLearnForm(false);
    fetchPlans();
  }

  async function openPlan(plan: LessonPlan) {
    setSelectedPlan(plan);
    setSelectedModules([]);
    setPlanCollapsed(true);
    try {
      const res = await fetch(`${API_BASE}/lesson-plan/${plan.id}/modules`);
      const data = await res.json();
      setSelectedModules(data.modules ?? []);
    } catch {
      setError("Could not load modules.");
    }
  }

  function closePlan() {
    setSelectedPlan(null);
    setSelectedModules([]);
    setPlanCollapsed(true);
  }

  function copyPlan() {
    navigator.clipboard.writeText(selectedPlan?.plan ?? "");
    setPlanCopied(true);
    setTimeout(() => setPlanCopied(false), 2000);
  }

  async function deletePlan(id: number) {
    try {
      await fetch(`${API_BASE}/lesson-plan/${id}`, { method: "DELETE" });
      setConfirmDeleteId(null);
      setPlans((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError("Could not delete plan.");
      setConfirmDeleteId(null);
    }
  }

  return (
    <div style={s.dashboard}>
      <section style={s.section}>
        <h2 style={s.sectionTitle}>Goals</h2>

        {error && (
          <div style={s.errorBar}>
            <span>{error}</span>
            <button style={s.errorDismiss} onClick={() => setError(null)}>✕</button>
          </div>
        )}

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
              <div
                key={plan.id}
                style={s.planCard}
                onMouseEnter={() => setHoveredId(plan.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <button
                  style={s.planCardInner}
                  onClick={() => openPlan(plan)}
                >
                  <div style={s.planCardLeft}>
                    <span style={s.planTitle}>{plan.title}</span>
                    <span
                      style={{
                        ...s.statusBadge,
                        ...(plan.status === "completed" ? s.statusCompleted : s.statusActive),
                      }}
                    >
                      {plan.status}
                    </span>
                  </div>
                  <span style={s.planDate}>
                    {new Date(plan.created_at).toLocaleDateString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </span>
                </button>

                {hoveredId === plan.id && confirmDeleteId !== plan.id && (
                  <button
                    style={s.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(plan.id); }}
                    title="Delete"
                  >
                    ✕
                  </button>
                )}

                {confirmDeleteId === plan.id && (
                  <div style={s.confirmRow}>
                    <span style={s.confirmText}>Delete this plan?</span>
                    <button style={s.confirmYes} onClick={() => deletePlan(plan.id)}>Yes</button>
                    <button style={s.confirmNo} onClick={() => setConfirmDeleteId(null)}>No</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <button
        style={{ ...s.learnBtn, color: learnHovered ? "#111827" : "#9ca3af" }}
        onClick={() => setShowLearnForm(true)}
        onMouseEnter={() => setLearnHovered(true)}
        onMouseLeave={() => setLearnHovered(false)}
      >
        + Learn something new
      </button>

      {showLearnForm && <LearnForm onClose={handleFormClose} />}

      {selectedModule && (
        <ModuleModal
          module={selectedModule}
          onClose={() => setSelectedModule(null)}
          onComplete={() => { setSelectedModule(null); openPlan(selectedPlan!); }}
        />
      )}

      {selectedPlan && (
        <div style={s.overlay} onClick={closePlan}>
          <div style={s.viewer} onClick={(e) => e.stopPropagation()}>
            <div style={s.viewerHeader}>
              <h3 style={s.viewerTitle}>{selectedPlan.title}</h3>
              <button style={s.closeBtn} onClick={closePlan}>✕</button>
            </div>
            <div style={s.viewerBody}>
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedPlan.plan}</ReactMarkdown>
                </div>
              )}
              {selectedModules.length > 0 && (
                <div style={s.modulesSection}>
                  <p style={s.modulesSectionTitle}>Modules</p>
                  {selectedModules.map((m, i) => (
                    <ModuleCard key={m.id ?? i} module={m} position={i + 1} onOpen={m.status !== "locked" ? () => setSelectedModule(m) : undefined} />
                  ))}
                </div>
              )}
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
    position: "relative",
    display: "flex",
    alignItems: "center",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    overflow: "hidden",
  },
  planCardInner: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
  },
  planCardLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  planTitle: { fontSize: 14, fontWeight: 600, color: "#111827" },
  statusBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 7px",
    borderRadius: 99,
    textTransform: "capitalize",
  },
  statusActive: {
    background: "#dcfce7",
    color: "#166534",
  },
  statusCompleted: {
    background: "#dbeafe",
    color: "#1e40af",
  },
  planDate: { fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" },
  deleteBtn: {
    padding: "0 14px",
    alignSelf: "stretch",
    border: "none",
    background: "transparent",
    color: "#9ca3af",
    fontSize: 13,
    cursor: "pointer",
    borderLeft: "1px solid #f3f4f6",
  },
  confirmRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    background: "#fff7ed",
    borderLeft: "1px solid #fed7aa",
    whiteSpace: "nowrap",
  },
  confirmText: { fontSize: 13, color: "#92400e" },
  confirmYes: {
    padding: "4px 10px",
    borderRadius: 6,
    border: "none",
    background: "#ef4444",
    color: "#fff",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
  },
  confirmNo: {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "transparent",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
    color: "#374151",
  },
  learnBtn: {
    alignSelf: "flex-start",
    padding: "4px 0",
    border: "none",
    background: "transparent",
    color: "#9ca3af",
    fontWeight: 400,
    fontSize: 13,
    cursor: "pointer",
    letterSpacing: "0.01em",
    transition: "color 0.15s",
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
    maxHeight: 300,
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
};
