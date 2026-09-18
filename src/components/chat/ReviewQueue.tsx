"use client";

import type { InteractiveReviewQueue } from "@/lib/types";

const DRILL_LABEL: Record<string, string> = {
  say_it_back: "🎙️ Say it back",
  flashcards: "🃏 Flashcards",
  quiz: "🧠 Run a quiz",
  teach_back: "🗣️ Teach it back",
};

const KIND_ICON: Record<string, string> = {
  term: "🔤",
  weak_area: "📉",
  quiz: "🎯",
};

export default function ReviewQueue({ payload }: { payload: InteractiveReviewQueue }) {
  const { items, lastScore, quizAttempts } = payload;
  return (
    <div className="widget-card widget-card--review">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>🔁</span>
        <div className="widget-title">
          <span className="widget-label">What to redo</span>
          <span className="widget-sub">built from your last scores and drills</span>
        </div>
        <span className="widget-counter">{items.length}</span>
      </div>
      {lastScore && (
        <div className="review-meta">
          Last quiz: <strong>{lastScore.score}/{lastScore.total}</strong> across {quizAttempts} attempt{quizAttempts === 1 ? "" : "s"}
        </div>
      )}
      <div className="review-items">
        {items.map((it, i) => (
          <div key={i} className={`review-item review-item--${it.kind}`}>
            <span className="review-item-icon" aria-hidden>{KIND_ICON[it.kind] || "•"}</span>
            <div className="review-item-body">
              <span className="review-item-label">{it.label}</span>
              <span className="review-item-detail">{it.detail}</span>
            </div>
            <span className="review-item-drill">{DRILL_LABEL[it.drill] || it.drill}</span>
          </div>
        ))}
      </div>
    </div>
  );
}