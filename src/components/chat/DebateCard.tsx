"use client";

import { useState } from "react";
import type { InteractiveDebate } from "@/lib/types";

export default function DebateCard({ payload }: { payload: InteractiveDebate }) {
  const [round, setRound] = useState(0);
  const { rounds, verdict } = payload;
  const r = rounds[round];
  const last = round === rounds.length - 1;
  return (
    <div className="widget-card widget-card--debate">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>⚔️</span>
        <div className="widget-title">
          <span className="widget-label">The Debate</span>
          <span className="widget-sub">Skeptic vs Enthusiast — round {round + 1} of {rounds.length}</span>
        </div>
      </div>
      <div className="debate-round">
        <div className="debate-voice debate-voice--skeptic">
          <span className="debate-avatar" aria-hidden>🧐</span>
          <span className="debate-name">The Skeptic</span>
          <p className="debate-text">{r.skeptic}</p>
        </div>
        <div className="debate-voice debate-voice--enthusiast">
          <span className="debate-avatar" aria-hidden>🤩</span>
          <span className="debate-name">The Enthusiast</span>
          <p className="debate-text">{r.enthusiast}</p>
        </div>
      </div>
      {last ? (
        <div className="debate-verdict" role="status">
          <span className="debate-verdict-title">⚖️ Verdict</span>
          {verdict}
        </div>
      ) : (
        <button className="btn btn-primary widget-action-primary" onClick={() => setRound(round + 1)}>
          Round {round + 2} — raise the stakes →
        </button>
      )}
      <div className="debate-dots" role="presentation">
        {rounds.map((_, i) => (
          <span key={i} className={`flashcard-dot ${i === round ? "flashcard-dot--active" : i < round ? "flashcard-dot--done" : ""}`} />
        ))}
      </div>
    </div>
  );
}