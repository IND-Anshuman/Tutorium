"use client";

// Weakness Radar: SVG pentagon from quiz accuracy, say-it-back clarity,
// vocabulary coverage, streak of practice, and profile weak-areas. Pure display.
export interface RadarData {
  quizAccuracy: number; // 0..1
  speechClarity: number; // 0..1 (latest say-it-back overall/100)
  vocabStrength: number; // 0..1 (key terms vs missed)
  consistency: number; // 0..1 (quiz attempt recency proxy)
  weakAreas: number; // 0..1 (fewer weak areas = higher score)
}

const AXES = [
  { key: "quizAccuracy", label: "Quiz" },
  { key: "speechClarity", label: "Voice" },
  { key: "vocabStrength", label: "Vocab" },
  { key: "consistency", label: "Practice" },
  { key: "weakAreas", label: "Focus" },
] as const;

function polygon(data: RadarData): string {
  const cx = 90, cy = 90, r = 72;
  return AXES.map((axis, i) => {
    const v = Math.max(0.04, Math.min(1, data[axis.key] || 0));
    const angle = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
    return `${cx + r * v * Math.cos(angle)},${cy + r * v * Math.sin(angle)}`;
  }).join(" ");
}

function score(data: RadarData): number {
  return Math.round((AXES.reduce((s, a) => s + (data[a.key] || 0), 0) / AXES.length) * 100);
}

export default function WeaknessRadar({ data }: { data: RadarData }) {
  const tone = score(data) >= 70 ? "var(--success)" : score(data) >= 45 ? "var(--warning)" : "var(--danger)";
  return (
    <div className="widget-card widget-card--radar">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>🕸️</span>
        <div className="widget-title">
          <span className="widget-label">Your strengths</span>
          <span className="widget-sub">green = solid, short side = practice next</span>
        </div>
        <span className="widget-counter" style={{ color: tone }}>{score(data)}</span>
      </div>
      <svg viewBox="0 0 180 180" className="radar-svg" role="img" aria-label={`Weakness radar scoring ${score(data)} of 100`}>
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon
            key={ring}
            points={polygon(Object.fromEntries(AXES.map((a) => [a.key, ring])) as unknown as RadarData)}
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
          />
        ))}
        <polygon points={polygon(data)} fill={`color-mix(in oklab, ${tone} 22%, transparent)`} stroke={tone} strokeWidth="2" />
        {AXES.map((axis, i) => {
          const angle = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
          const lx = 90 + 84 * Math.cos(angle);
          const ly = 90 + 84 * Math.sin(angle);
          return (
            <text key={axis.key} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="var(--ink-3)">
              {axis.label}
            </text>
          );
        })}
      </svg>
      <div className="radar-hints">
        {AXES.filter((a) => (data[a.key] || 0) < 0.55).map((a) => (
          <span key={a.key} className="radar-hint">weak: {a.label.toLowerCase()}</span>
        ))}
        {AXES.every((a) => (data[a.key] || 0) >= 0.55) && <span className="radar-hint">no weak axis — push difficulty</span>}
      </div>
    </div>
  );
}
