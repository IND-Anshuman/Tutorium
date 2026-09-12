"use client";

import type { InteractiveTeachBack } from "@/lib/types";
import { Badge } from "../ui/primitives";

export default function TeachBackCard({ payload }: { payload: InteractiveTeachBack }) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--brand)" }}>
          Teach-back review
        </span>
        <Badge>Feynman mode</Badge>
      </div>
      <p className="text-base leading-normal">{payload.verdict}</p>
      {payload.missed?.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--warning)" }}>
            Points to revisit
          </div>
          <ul className="space-y-1.5">
            {payload.missed.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
                <span style={{ color: "var(--warning)" }}>•</span>
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}
      {payload.next_step && (
        <p className="mt-4 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--surface-2)", color: "var(--brand)", border: "1px solid var(--border)" }}>
          → {payload.next_step}
        </p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer select-none text-xs font-medium" style={{ color: "var(--ink-3)" }}>
          View your transcript
        </summary>
        <p className="mt-2 text-sm italic" style={{ color: "var(--ink-3)" }}>{payload.transcript}</p>
      </details>
    </div>
  );
}