"use client";

export default function Heatmap({ words, overall }: { words: Array<{ word: string; confidence: number; status: string }>; overall: number }) {
  if (!words?.length) return null;
  const color = (status: string, conf: number) =>
    status === "good" ? "var(--accent-2)" : status === "shaky" ? "var(--warn)" : "var(--miss)";
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Say-It-Back heatmap</span>
        <span className="text-sm font-bold" style={{ color: overall >= 90 ? "var(--accent-2)" : overall >= 60 ? "var(--warn)" : "var(--miss)" }}>
          {overall}/100
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {words.map((w, i) => (
          <span
            key={i}
            title={`confidence: ${(w.confidence * 100).toFixed(0)}%`}
            className="rounded px-1.5 py-0.5 text-xs"
            style={{ background: "var(--panel)", border: `1px solid ${color(w.status, w.confidence)}`, color: color(w.status, w.confidence) }}
          >
            {w.word}
          </span>
        ))}
      </div>
      <div className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>
        green = clean · amber = shaky · red = unclear (Speechmatics word-level confidence)
      </div>
    </div>
  );
}