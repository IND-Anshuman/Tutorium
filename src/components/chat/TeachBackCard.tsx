"use client";

import type { InteractiveTeachBack } from "@/lib/types";

export default function TeachBackCard({ payload }: { payload: InteractiveTeachBack }) {
  return (
    <div className="widget-card widget-card--teachback">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>📝</span>
        <div className="widget-title">
          <span className="widget-label">Teach-back review</span>
          <span className="widget-sub">Feynman mode · graded</span>
        </div>
      </div>
      <p className="teachback-verdict">{payload.verdict}</p>
      {payload.missed?.length > 0 && (
        <div className="teachback-missed">
          <div className="teachback-section-label">Points to revisit</div>
          <ul className="teachback-list">
            {payload.missed.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {payload.next_step && (
        <div className="teachback-next">
          <span className="teachback-next-arrow" aria-hidden>→</span>
          {payload.next_step}
        </div>
      )}
      <details className="teachback-details">
        <summary>View your transcript</summary>
        <p className="teachback-transcript">{payload.transcript}</p>
      </details>
    </div>
  );
}
