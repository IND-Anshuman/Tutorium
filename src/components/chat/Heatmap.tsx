"use client";

import type { InteractiveHeatmap } from "@/lib/types";

export default function Heatmap(payload: InteractiveHeatmap) {
  if (!payload.words?.length) return null;
  const colorFor = (status: string) =>
    status === "good" ? "var(--success)" : status === "shaky" ? "var(--warning)" : "var(--danger)";
  const overallColor =
    payload.overall >= 90 ? "var(--success)" :
    payload.overall >= 60 ? "var(--warning)" :
    "var(--danger)";
  const misses = payload.words.filter((w) => w.status !== "good");

  return (
    <div className="widget-card widget-card--heatmap">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>🌡️</span>
        <div className="widget-title">
          <span className="widget-label">Say-It-Back heatmap</span>
          <span className="widget-sub">
            {misses.length ? `${misses.length} word${misses.length > 1 ? "s" : ""} to review` : "Crisp — every word landed."}
          </span>
        </div>
        <span className="heatmap-overall" style={{ color: overallColor }}>
          {payload.overall}
          <span className="heatmap-overall-sub">/100</span>
        </span>
      </div>
      <div className="heatmap-words">
        {payload.words.map((w, i) => (
          <span
            key={i}
            title={`confidence: ${(w.confidence * 100).toFixed(0)}%`}
            className={`heatmap-word heatmap-word--${w.status}`}
          >
            {w.word}
          </span>
        ))}
      </div>
      <div className="heatmap-legend">
        <span><span className="heatmap-dot heatmap-dot--good" /> clean</span>
        <span><span className="heatmap-dot heatmap-dot--shaky" /> shaky</span>
        <span><span className="heatmap-dot heatmap-dot--unclear" /> unclear</span>
        <span className="heatmap-legend-attrib">Speechmatics word-confidence</span>
      </div>
    </div>
  );
}
