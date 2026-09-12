"use client";

import type { InteractivePayload } from "@/lib/types";
import { Badge } from "../ui/primitives";

export default function SayItBackCard({
  payload,
  onRecord,
}: {
  payload: InteractivePayload & { type: "say_it_back" };
  onRecord?: (payload: InteractivePayload & { type: "say_it_back" }) => void;
}) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--lamp)" }}>
          Say-It-Back
        </span>
        <Badge tone="lamp">vocab hot-swap · {payload.keyTerms.length} terms</Badge>
      </div>
      <p className="text-base leading-normal" style={{ color: "var(--on-surface)" }}>{payload.passage}</p>
      {payload.keyTerms.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {payload.keyTerms.map((t) => (
            <span key={t} className="rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: "oklch(0.30 0.045 78 / 0.35)", color: "var(--lamp)", border: "1px solid oklch(0.40 0.08 78 / 0.5)" }}>
              {t}
            </span>
          ))}
        </div>
      )}
      {onRecord && (
        <button className="btn btn-lamp mt-4 w-full" onClick={() => onRecord(payload)}>
          🎙 Read it aloud — I'll score every word
        </button>
      )}
    </div>
  );
}