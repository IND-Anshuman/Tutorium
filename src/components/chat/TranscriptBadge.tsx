"use client";

// TranscriptBadge — small chip showing STT confidence (0..1) as a colored %.
export default function TranscriptBadge({ meta }: { meta?: { wordCount?: number; avgConfidence?: number } | null }) {
  if (!meta || meta.avgConfidence === undefined) return null;
  const pct = Math.round((meta.avgConfidence || 0) * 100);
  const tone =
    pct >= 90 ? "var(--success)" :
    pct >= 60 ? "var(--warning)" :
    "var(--danger)";
  return (
    <span
      className="transcript-badge"
      style={{ color: tone, borderColor: `color-mix(in oklab, ${tone} 35%, transparent)` }}
      title={`Speechmatics confidence ${pct}%`}
    >
      {pct}%
    </span>
  );
}
