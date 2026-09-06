"use client";

import type { InteractivePayload } from "@/lib/types";

export default function SayItBackCard({
  payload,
  onRecord,
}: {
  payload: InteractivePayload & { type: "say_it_back" };
  onRecord?: (payload: InteractivePayload & { type: "say_it_back" }) => void;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        Say-It-Back · vocab hot-swap active ({payload.keyTerms.length} terms boosted)
      </div>
      <p className="mt-2 text-sm leading-relaxed">{payload.passage}</p>
      {payload.keyTerms.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {payload.keyTerms.map((t) => (
            <span key={t} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "var(--panel)", border: "1px solid var(--accent)", color: "var(--accent)" }}>
              {t}
            </span>
          ))}
        </div>
      )}
      {onRecord && (
        <button
          className="mt-3 rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{ background: "var(--accent)", color: "#0b0e14" }}
          onClick={() => onRecord(payload)}
        >
          🎙 Record your read-aloud (20s)
        </button>
      )}
    </div>
  );
}