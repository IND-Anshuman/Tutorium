"use client";

import type { InteractiveTeachBack } from "@/lib/types";

export default function TeachBackCard({ payload }: { payload: InteractiveTeachBack }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Teach-back review (Feynman mode)</div>
      <p className="mt-2 text-sm">{payload.verdict}</p>
      {payload.missed?.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase" style={{ color: "var(--warn)" }}>Points you missed</div>
          <ul className="mt-1 list-disc pl-4 text-xs">
            {payload.missed.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}
      {payload.next_step && (
        <p className="mt-2 text-xs" style={{ color: "var(--accent)" }}>→ {payload.next_step}</p>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-[10px]" style={{ color: "var(--muted)" }}>your transcript</summary>
        <p className="mt-1 text-xs italic" style={{ color: "var(--muted)" }}>{payload.transcript}</p>
      </details>
    </div>
  );
}