import { useEffect, useState } from "react";
import type { Module } from "../types";

interface Props {
  module: Module;
  position: number;
  onOpen?: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const TYPE_COLORS: Record<string, string> = {
  physical: "#7c3aed",
  conceptual: "#2563eb",
  applicable: "#16a34a",
};

const STATUS_COLORS: Record<string, string> = {
  locked: "#6b7280",
  active: "#d97706",
  completed: "#16a34a",
};

const STATUS_ICONS: Record<string, string> = {
  locked: "🔒",
  active: "▶",
  completed: "✓",
};

export default function ModuleCard({ module, position, onOpen }: Props) {
  const [artifactTypes, setArtifactTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!module.id) return;
    fetch(`${API_BASE}/module/${module.id}/artifacts`)
      .then((r) => r.json())
      .then((d) => setArtifactTypes((d.artifacts ?? []).map((a: { type: string }) => a.type)))
      .catch(() => {});
  }, [module.id]);

  const typeColor = TYPE_COLORS[module.type] ?? "#6b7280";
  const statusColor = STATUS_COLORS[module.status] ?? "#6b7280";
  const statusIcon = STATUS_ICONS[module.status] ?? "";

  return (
    <div style={{ ...s.card, ...(onOpen ? { cursor: "pointer" } : {}) }} onClick={onOpen}>
      <div style={s.header}>
        <span style={s.badge}>Module {position}</span>
        <span style={{ ...s.typeBadge, background: typeColor }}>{module.type}</span>
        <h4 style={s.name}>{module.name}</h4>
        <span style={{ ...s.statusChip, color: statusColor }}>
          {statusIcon} {module.status}
        </span>
      </div>
      <p style={s.description}>{module.description}</p>
      {artifactTypes.length > 0 && (
        <div style={s.artifactRow}>
          {artifactTypes.map((t, i) => (
            <span key={i} style={s.artifactChip}>{t}</span>
          ))}
        </div>
      )}
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
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  badge: {
    fontSize: 11,
    fontWeight: 700,
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
  },
  typeBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "2px 8px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  name: { margin: 0, fontSize: 14, fontWeight: 700, color: "#111827", flex: 1 },
  statusChip: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
  },
  description: { margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.5 },
  artifactRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
  },
  artifactChip: {
    background: "#f3f4f6",
    color: "#374151",
    fontSize: 11,
    borderRadius: 6,
    padding: "2px 8px",
  },
};
