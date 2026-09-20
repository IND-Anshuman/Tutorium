"use client";

import { useState } from "react";

// Explanatory first-paint landing: names what Tutorium does in user terms
// (study packs, two-way voice, Say-It-Back scoring, review queue) so an empty
// chat teaches the product instead of showing two buttons and a hunch.

const TRIES = ["Photosynthesis for USMLE", "Spanish travel phrases", "Rust ownership"];

const FEATURES = [
  {
    title: "A study pack in one ask",
    desc: "Say \u201cmake me a study pack\u201d and get flashcards, a quiz, a summary, and a memory story for the topic.",
    icon: (
      <>
        <path d="M12 2 2 7l10 5 10-5-10-5z" />
        <path d="m2 12 10 5 10-5" />
        <path d="m2 17 10 5 10-5" />
      </>
    ),
    tone: "brand",
  },
  {
    title: "Voice that goes both ways",
    desc: "Hold the mic and just talk — answers come back as speech. Accents and half-formed sentences are fine.",
    icon: (
      <>
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <path d="M12 19v4" />
      </>
    ),
    tone: "lamp",
  },
  {
    title: "Say-It-Back scoring",
    desc: "Read a passage aloud and get a word-by-word heatmap of what you nailed and what you slurred.",
    icon: (
      <>
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </>
    ),
    tone: "brand",
  },
  {
    title: "Weak spots, resurfaced",
    desc: "Terms you miss land in a review queue and return as quick quizzes until they stick.",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
    tone: "brand",
  },
];

function FeatureIcon({ children, tone }: { children: React.ReactNode; tone: "brand" | "lamp" }) {
  return (
    <span className="landing-feat-icon" style={{ color: tone === "lamp" ? "var(--lamp)" : "var(--brand)" }} aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

export default function LandingEmptyState({ onStart }: { onStart: (domain: string) => void }) {
  const [value, setValue] = useState("");
  const [starting, setStarting] = useState(false);

  const begin = (domain: string) => {
    if (starting) return;
    setStarting(true);
    onStart(domain);
  };

  return (
    <div className="landing">
      <div className="landing-hero">
        <h1 className="landing-title">Tell it what you&rsquo;re learning. It does the rest.</h1>
        <p className="landing-sub">
          Tutorium is a talk-first tutor. It remembers what you&rsquo;ve covered, where you slipped, and the
          terms you keep forgetting — then drills you on exactly that.
        </p>
      </div>

      <div>
        <p className="landing-caption" id="landing-tries-label">Start with one</p>
        <div className="landing-tries" role="group" aria-labelledby="landing-tries-label">
          {TRIES.map((t) => (
            <button key={t} type="button" className="landing-try" onClick={() => begin(t)} title={`Start a session on \u201c${t}\u201d`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t}
            </button>
          ))}
        </div>
      </div>

      <form
        className="landing-start"
        onSubmit={(e) => {
          e.preventDefault();
          begin(value.trim());
        }}
      >
        <input
          className="landing-input"
          aria-label="What are you learning?"
          placeholder="Photosynthesis for USMLE · Spanish travel phrases · Rust ownership"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="btn btn-primary landing-start-btn" disabled={starting}>
          {starting ? "Starting…" : "Start session →"}
        </button>
      </form>
      <p className="landing-hint">One line is enough — a body system, a vocab list, a chapter name.</p>

      <ul className="landing-grid" aria-label="What Tutorium does in a session">
        {FEATURES.map((f) => (
          <li key={f.title} className="landing-feat">
            <FeatureIcon tone={f.tone as "brand" | "lamp"}>{f.icon}</FeatureIcon>
            <span className="landing-feat-text">
              <b>{f.title}</b>
              <span className="landing-feat-desc">{f.desc}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="landing-doc">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span>
          Have notes already? Attach a PDF or paste messy text — even scanned pages — and Tutorium reads
          them before you say a word. The paperclip sits next to the message box below.
        </span>
      </p>

      <p className="landing-foot">
        Every pack, quiz, and transcript is saved to your <a href="/library">Library</a>.
      </p>
    </div>
  );
}