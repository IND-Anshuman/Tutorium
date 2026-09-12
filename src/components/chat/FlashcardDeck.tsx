"use client";

import { useState } from "react";
import type { Flashcard } from "@/lib/types";

export default function FlashcardDeck({ cards }: { cards: Flashcard[] }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!cards?.length) return null;
  const card = cards[idx];
  const last = idx === cards.length - 1;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "var(--ink-2)" }}>
          Flashcards
        </span>
        <span className="text-xs tabular-nums" style={{ color: "var(--ink-3)" }}>
          {idx + 1} / {cards.length}
        </span>
      </div>
      <button
        onClick={() => setFlipped(!flipped)}
        aria-label="Flip flashcard"
        className="card block w-full transition-colors"
        style={{
          minHeight: 132,
          padding: "var(--space-lg)",
          borderRadius: "var(--radius-lg)",
          transformStyle: "preserve-3d",
        }}
      >
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--brand)" }}>
          {flipped ? "Answer" : "Question"}
        </div>
        <div
          className="text-base leading-normal"
          style={{ color: flipped ? "var(--on-surface)" : "var(--ink)" }}
        >
          {flipped ? card.back : card.front}
        </div>
        <div className="mt-3 text-[11px]" style={{ color: "var(--ink-3)" }}>
          tap to {flipped ? "see question" : "reveal answer"}
        </div>
      </button>
      <div className="mt-3 flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={() => { setIdx((idx - 1 + cards.length) % cards.length); setFlipped(false); }} disabled={cards.length === 1}>
          ← Prev
        </button>
        <button className="btn btn-primary flex-1" onClick={() => { setFlipped(false); setIdx((idx + 1) % cards.length); }}>
          {last && flipped ? "Review again" : "Next →"}
        </button>
      </div>
    </div>
  );
}