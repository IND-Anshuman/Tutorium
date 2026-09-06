"use client";

export default function VocabPreview({ terms }: { terms: string[] }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        Vocab Hot-Swap — these terms are boosted in Speechmatics recognition
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {terms.map((t) => (
          <span key={t} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "var(--panel)", border: "1px solid var(--accent)", color: "var(--accent)" }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}