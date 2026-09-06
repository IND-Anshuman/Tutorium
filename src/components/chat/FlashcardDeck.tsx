"use client";

import { useState } from "react";
import type { Flashcard } from "@/lib/types";

export default function FlashcardDeck({ cards }: { cards: Flashcard[] }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!cards?.length) return null;
  const card = cards[idx];
  return (
    <div
      className="cursor-pointer rounded-xl p-4 text-center transition"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
      onClick={() => setFlipped(!flipped)}
    >
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {flipped ? "Answer" : `Card ${idx + 1}/${cards.length} — tap to flip`}
      </div>
      <div className="mt-2 text-sm">{flipped ? card.back : card.front}</div>
      <div className="mt-3 flex justify-center gap-2">
        <button
          className="rounded-lg px-3 py-1 text-xs"
          style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          onClick={(e) => { e.stopPropagation(); setIdx((idx - 1 + cards.length) % cards.length); setFlipped(false); }}
        >
          ← Prev
        </button>
        <button
          className="rounded-lg px-3 py-1 text-xs"
          style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          onClick={(e) => { e.stopPropagation(); setIdx((idx + 1) % cards.length); setFlipped(false); }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}