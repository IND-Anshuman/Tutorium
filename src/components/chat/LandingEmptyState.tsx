"use client";

import { useEffect, useRef } from "react";

// Explanatory first-paint landing: names what Tutorium does in user terms
// (study packs, two-way voice, Say-It-Back scoring, review queue) so an empty
// chat teaches the product instead of showing two buttons and a hunch.
// 3D set-piece: one CSS-3D card stack with pointer-tilt parallax. Tilt is
// derived from CURSOR POSITION ON SCREEN (not the scene's own box) and clamped,
// so sweeping to a screen edge can never spin the stack.

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

const TILT_MAX = 9; // degrees — hard clamp, screen-edge sweep stays calm

// The set-piece: the animated brand logo framed as a "study planet". Its own
// light-gray backdrop is masked by circle-cropping deep into the navy disc so
// only the robot sphere rides on the dark UI. Tilts gently toward the pointer.
// Decorative only — aria-hidden, no pointer events of its own.
function LandingScene() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // Cursor position across the whole viewport, centered: −1 … 1 on
        // each axis. Independent of the scene's bounding box, so the far
        // screen edge maps to exactly ±1, never a runaway value.
        const nx = (e.clientX / window.innerWidth) * 2 - 1;
        const ny = (e.clientY / window.innerHeight) * 2 - 1;
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        el.style.setProperty("--tilt-x", `${(-clamp(ny) * TILT_MAX * 0.6).toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${(clamp(nx) * TILT_MAX).toFixed(2)}deg`);
      });
    };
    const onLeave = () => {
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="landing-scene-frame" aria-hidden>
      <div className="landing-scene-glow" />
      <div className="landing-scene" ref={sceneRef}>
        <div className="landing-logo-planet">
          <video
            className="landing-logo-video"
            src="/tutorium-logo.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
          />
        </div>
        <span className="landing-planet-caption">Learn • Practice • Grow — by voice</span>
      </div>
    </div>
  );
}

export default function LandingEmptyState() {
  return (
    <div className="landing">
      <div className="landing-top">
        <div className="landing-hero">
          <h1 className="landing-title">Tell it what you&rsquo;re learning. It does the rest.</h1>
          <p className="landing-sub">
            Tutorium is a talk-first tutor. It remembers what you&rsquo;ve covered, where you slipped, and the
            terms you keep forgetting — then drills you on exactly that.
          </p>
          <div className="landing-preview" role="img" aria-label="Example exchange with the tutor">
            <div className="landing-bubble landing-bubble--user">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <path d="M12 19v4" />
              </svg>
              Make me a study pack on photosynthesis
            </div>
            <div className="landing-bubble landing-bubble--tutor">
              <span className="landing-bubble-text">Building it — 12 flashcards, a 5-question quiz, a summary, and a Say-It-Back drill.</span>
              <span className="landing-bubble-widgets">
                <span className="landing-widget">Flashcards</span>
                <span className="landing-widget">Quiz</span>
                <span className="landing-widget">Say-It-Back</span>
              </span>
            </div>
          </div>
          <p className="landing-hint landing-hint--cta">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
            Start below — type in the message box, or hold the mic and just talk.
          </p>
        </div>
        <LandingScene />
      </div>

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
          Have notes already? Attach a PDF, Word doc, or paste messy text — even scanned pages — and Tutorium reads
          them before you say a word. The paperclip sits next to the message box below.
        </span>
      </p>

      <p className="landing-foot">
        Every pack, quiz, and transcript is saved to your <a href="/library">Library</a>.
      </p>
    </div>
  );
}