"use client";
import { useEffect, useRef, useState } from "react";

// SpeakButton — speaks the given text using SpeechSynthesis. Falls back to
// canceling any currently-spoken utterance if the user clicks again.
export default function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => () => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const speak = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(text.slice(0, 4000));
    utterRef.current = utt;
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    synth.speak(utt);
    setSpeaking(true);
  };

  return (
    <button
      className={`msg-action speak-btn ${speaking ? "speak-btn--on" : ""}`}
      aria-label={speaking ? "Stop speaking" : "Read aloud"}
      onClick={speak}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {speaking ? (
          <>
            <rect x="6" y="4" width="4" height="16"/>
            <rect x="14" y="4" width="4" height="16"/>
          </>
        ) : (
          <>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </>
        )}
      </svg>
      {speaking ? "Stop" : "Read aloud"}
    </button>
  );
}
