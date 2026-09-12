"use client";

export default function VocabPreview({ terms }: { terms: string[] }) {
  return (
    <div className="card p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--lamp)" }}>
        Vocab Hot-Swap
      </div>
      <div className="mb-2 text-xs" style={{ color: "var(--ink-2)" }}>
        These terms are boosted in Speechmatics recognition:
      </div>
      <div className="flex flex-wrap gap-1.5">
        {terms.map((t) => (
          <span key={t} className="rounded px-2 py-0.5 text-[11px] font-medium"
            style={{ background: "oklch(0.30 0.045 78 / 0.35)", border: "1px solid oklch(0.40 0.08 78 / 0.5)", color: "var(--lamp)" }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}