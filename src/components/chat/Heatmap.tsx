"use client";

import type { InteractiveHeatmap } from "@/lib/types";

export default function Heatmap(payload: InteractiveHeatmap) {
  if (!payload.words?.length) return null;
  const colorFor = (status: string) =>
    status === "good" ? "var(--success)" : status === "shaky" ? "var(--warning)" : "var(--danger)";
  const overallColor = payload.overall >= 90 ? "var(--success)" : payload.overall >= 60 ? "var(--warning)" : "var(--danger)";
  const misses = payload.words.filter((w) => w.status !== "good");

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--lamp)" }}>
          Say-It-Back heatmap
        </span>
        <span className="text-xl font-bold tabular-nums" style={{ color: overallColor }}>
          {payload.overall}
          <span className="text-sm font-medium" style={{ color: "var(--ink-3)" }}>/100</span>
        </span>
      </div>
      <p className="mb-3 text-xs" style={{ color: "var(--ink-3)" }}>
        {misses.length ? `${misses.length} word${misses.length > 1 ? "s" : ""} to review` : "Crisp — every word landed."}
      </p>
      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {payload.words.map((w, i) => (
          <span
            key={i}
            title={`confidence: ${(w.confidence * 100).toFixed(0)}%`}
            className="rounded-md px-2 py-1 text-xs font-medium"
            style={{ background: "var(--surface-2)", border: `1px solid ${colorFor(w.status)}22`, color: colorFor(w.status) }}
          >
            {w.word}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px]" style={{ color: "var(--ink-3)" }}>
        <span><span style={{ color: "var(--success)" }}>●</span> clean</span>
        <span><span style={{ color: "var(--warning)" }}>●</span> shaky</span>
        <span><span style={{ color: "var(--danger)" }}>●</span> unclear</span>
        <span className="ml-auto">Speechmatics word-confidence</span>
      </div>
    </div>
  );
}