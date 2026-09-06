"use client";

import { useState } from "react";
import type { QuizItem } from "@/lib/types";

function questionPraise(score: number, total: number): string {
  const pct = total ? score / total : 0;
  if (pct >= 0.9) return "Excellent — you've got this.";
  if (pct >= 0.7) return "Great work — a couple to review.";
  if (pct >= 0.5) return "Solid attempt — review the ones you missed.";
  return "Keep at it — recap the material and try again.";
}

export default function MiniQuiz({ questions, topicId }: { questions: QuizItem[]; topicId?: string }) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  if (!questions?.length) return null;

  const q = questions[idx];

  const pick = (choiceIdx: number) => {
    if (picked !== null) return;
    setPicked(String(choiceIdx));
    if (String(choiceIdx) === String(q.answer)) setScore((s) => s + 1);
  };

  const finish = () => {
    setDone(true);
    if (topicId) {
      // persist score to learner profile + quiz history (fire-and-forget)
      fetch("/api/quiz-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "demo-user", topicId, score, total: questions.length }),
      }).catch(() => {});
    }
  };

  const next = () => {
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
      setPicked(null);
    } else {
      finish();
    }
  };

  if (done) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
        <div className="text-lg font-semibold">{score} / {questions.length}</div>
        <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
          {questionPraise(score, questions.length)} Saved to your learner profile.
        </div>
        <button
          className="mt-2 rounded-lg px-3 py-1 text-xs"
          style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          onClick={() => { setIdx(0); setPicked(null); setScore(0); setDone(false); }}
        >
          Redo
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        Question {idx + 1} of {questions.length}
      </div>
      <div className="mt-1 text-sm font-medium">{q.question}</div>
      <div className="mt-3 space-y-2">
        {q.choices.map((c, ci) => {
          const isPicked = picked === String(ci);
          const isCorrect = String(ci) === String(q.answer);
          const reveal = picked !== null;
          return (
            <button
              key={ci}
              onClick={() => pick(ci)}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm transition"
              style={{
                background: reveal && isCorrect ? "rgba(126,224,163,.15)" : isPicked ? "rgba(242,112,138,.15)" : "var(--panel)",
                border: `1px solid ${reveal && isCorrect ? "var(--accent-2)" : isPicked ? "var(--miss)" : "var(--border)"}`,
              }}
            >
              {c}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="mt-3">
          {q.explanation && <p className="text-xs" style={{ color: "var(--muted)" }}>{q.explanation}</p>}
          <button
            className="mt-2 rounded-lg px-3 py-1 text-xs"
            style={{ background: "var(--accent)", color: "#0b0e14" }}
            onClick={next}
          >
            {idx + 1 < questions.length ? "Next →" : "Finish"}
          </button>
        </div>
      )}
    </div>
  );
}