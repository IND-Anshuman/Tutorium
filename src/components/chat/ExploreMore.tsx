"use client";

import { useState } from "react";

// Explore-more tray: for a user who doesn't know what Tutorium can do, this is
// the discoverability surface — every drill mode as one tappable chip with a
// plain-language hint. Stays collapsed so it never fights the reply for attention.
const SUGGESTIONS: Array<{ label: string; hint: string; icon: string; message: string }> = [
  { label: "Quiz me", hint: "multiple choice, scored", icon: "🧠", message: "quiz me with 10 questions" },
  { label: "Voice quiz", hint: "answer by speaking", icon: "🎤", message: "voice quiz me" },
  { label: "Flashcards", hint: "flip to reveal", icon: "🃏", message: "show my flashcards" },
  { label: "Say it back", hint: "read aloud, get scored", icon: "🎙️", message: "I want to practice saying it back" },
  { label: "Mnemonics", hint: "memory hooks", icon: "🧠", message: "give me a mnemonic" },
  { label: "Debate it", hint: "two tutors argue", icon: "⚔️", message: "debate this topic" },
  { label: "Visual guide", hint: "a diagram", icon: "🖼️", message: "make a visual" },
  { label: "Review queue", hint: "what to redo", icon: "🔁", message: "show my review queue" },
];

export default function ExploreMore({ onPick, busy }: { onPick: (message: string) => void; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="explore-more">
      {!open ? (
        <button className="explore-more-toggle" onClick={() => setOpen(true)} aria-expanded={false}>
          <span aria-hidden>✨</span> What else can I do here?
        </button>
      ) : (
        <div className="explore-more-tray" role="group" aria-label="Practice modes for this topic">
          <div className="explore-more-head">
            <span className="explore-more-title">Practice modes</span>
            <button className="explore-more-close" onClick={() => setOpen(false)} aria-label="Hide practice modes">✕</button>
          </div>
          <div className="explore-more-grid">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                className="explore-chip"
                onClick={() => { setOpen(false); onPick(s.message); }}
                disabled={busy}
                title={s.hint}
              >
                <span className="explore-chip-icon" aria-hidden>{s.icon}</span>
                <span className="explore-chip-label">{s.label}</span>
                <span className="explore-chip-hint">{s.hint}</span>
              </button>
            ))}
          </div>
          <p className="explore-more-note">Or just ask in your own words — type or hold the mic.</p>
        </div>
      )}
    </div>
  );
}