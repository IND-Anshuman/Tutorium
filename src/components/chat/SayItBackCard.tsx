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
    <div className="widget-card widget-card--sayitback">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>🎙</span>
        <div className="widget-title">
          <span className="widget-label">Say-It-Back</span>
          <span className="widget-sub">read it aloud — I check every key term lands</span>
        </div>
        <span className="widget-counter">{payload.keyTerms.length} terms</span>
      </div>
      <div className="sayitback-passage">{payload.passage}</div>
      {payload.keyTerms.length > 0 && (
        <div className="sayitback-terms">
          {payload.keyTerms.map((t) => (
            <span key={t} className="sayitback-term">{t}</span>
          ))}
        </div>
      )}
      <p className="sayitback-how">
        Hold the mic, read the passage above in your own voice, and release. Terms I heard cleanly turn green; shaky ones turn amber so you know what to repeat.
      </p>
      {onRecord && (
        <button className="btn btn-lamp widget-action-primary" onClick={() => onRecord(payload)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          Read aloud
        </button>
      )}
    </div>
  );
}
