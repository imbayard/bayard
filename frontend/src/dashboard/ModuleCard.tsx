import type { Module } from "../types";

interface Props {
  module: Module;
  position: number;
}

export default function ModuleCard({ module, position }: Props) {
  return (
    <div style={s.card}>
      <div style={s.header}>
        <span style={s.badge}>Module {position}</span>
        <h4 style={s.name}>{module.name}</h4>
      </div>
      <p style={s.description}>{module.description}</p>
      <ul style={s.keyPointsList}>
        {(module.key_points ?? []).map((kp, i) => (
          <li key={i} style={s.keyPoint}>{kp}</li>
        ))}
      </ul>
      <div style={s.challengeBox}>
        <span style={s.challengeLabel}>Challenge</span>
        <p style={s.challengeText}>{module.challenge}</p>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "#fff",
  },
  header: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
  },
  badge: {
    fontSize: 11,
    fontWeight: 700,
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
  },
  name: { margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" },
  description: { margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.5 },
  keyPointsList: {
    margin: 0,
    paddingLeft: 18,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  keyPoint: { fontSize: 13, color: "#374151", lineHeight: 1.5 },
  challengeBox: {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    padding: "8px 12px",
  },
  challengeLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    display: "block",
    marginBottom: 4,
  },
  challengeText: { margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.5 },
};
