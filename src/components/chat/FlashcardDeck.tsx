"use client";

import { useState } from "react";
import type { Flashcard, TricksterTheme } from "@/lib/types";

interface Props {
  cards: Flashcard[];
  theme?: TricksterTheme;
}

export default function FlashcardDeck({ cards, theme }: Props) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!cards?.length) return null;
  const card = cards[idx];
  const last = idx === cards.length - 1;

  const style = theme
    ? ({
        "--t-accent": theme.accent,
        "--t-bg": theme.bg,
        "--t-radius": `${theme.radius}px`,
        "--t-icon": `"${theme.icon}"`,
      } as React.CSSProperties)
    : undefined;
  const veil = theme?.hiddenAnswerStyle === "blur";
  const scratch = theme?.hiddenAnswerStyle === "scratch";

  return (
    <div className="widget-card widget-card--flash" style={style}>
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>{theme?.icon || "🃏"}</span>
        <div className="widget-title">
          <span className="widget-label">Flashcards{theme?.vibe ? ` · ${theme.vibe}` : ""}</span>
          <span className="widget-sub">{cards.length} cards</span>
        </div>
        <span className="widget-counter">{idx + 1} / {cards.length}</span>
      </div>

      <button
        onClick={() => setFlipped(!flipped)}
        aria-label={flipped ? "Show question" : "Reveal answer"}
        className={`flashcard ${flipped ? "flashcard--flipped" : ""} ${veil ? "doc-veil" : ""}`}
        type="button"
      >
        <span className={`flashcard-face flashcard-face--front ${flipped ? "flashcard-face--hidden" : ""}`}>
          <span className="flashcard-tag">Question</span>
          <span className="flashcard-text">{card.front}</span>
        </span>
        <span className={`flashcard-face flashcard-face--back ${!flipped ? "flashcard-face--hidden" : ""}`}>
          <span className="flashcard-tag flashcard-tag--back">{scratch ? "Scratch to reveal" : "Answer"}</span>
          <span className="flashcard-text">{veil && !flipped ? "••••••••" : card.back}</span>
        </span>
        <span className="flashcard-hint" aria-hidden>{scratch ? "hold to scratch" : "tap to flip"}</span>
      </button>

      <div className="flashcard-progress" role="presentation">
        {cards.map((_, i) => (
          <span key={i} className={`flashcard-dot ${i === idx ? "flashcard-dot--active" : i < idx ? "flashcard-dot--done" : ""}`} />
        ))}
      </div>

      <div className="widget-actions">
        <button
          className="btn btn-ghost flex-1"
          onClick={() => { setIdx((idx - 1 + cards.length) % cards.length); setFlipped(false); }}
          disabled={cards.length === 1}
          aria-label="Previous card"
        >
          ← Prev
        </button>
        <button
          className="btn btn-primary flex-1"
          onClick={() => { setFlipped(false); setIdx((idx + 1) % cards.length); }}
          aria-label={last ? "Start over" : "Next card"}
        >
          {last && flipped ? "Review again" : "Next →"}
        </button>
      </div>
    </div>
  );
}