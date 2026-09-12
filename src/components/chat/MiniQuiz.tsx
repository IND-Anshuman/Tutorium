"use client";

import { useState } from "react";
import type { QuizItem } from "@/lib/types";

function praise(score: number, total: number): string {
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
    const pct = score / questions.length;
    return (
      <div className="card p-6 text-center">
        <div className="text-4xl font-bold tracking-tight" style={{ color: pct >= 0.7 ? "var(--brand)" : pct >= 0.5 ? "var(--warning)" : "var(--danger)" }}>
          {score}
          <span className="text-lg font-medium" style={{ color: "var(--ink-3)" }}>/{questions.length}</span>
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>{praise(score, questions.length)}</p>
        <div className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
          {topicId ? "Score saved to your learner profile." : ""}
        </div>
        <button className="btn btn-ghost mt-4" onClick={() => { setIdx(0); setPicked(null); setScore(0); setDone(false); }}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "var(--ink-2)" }}>Quiz</span>
        <span className="text-xs tabular-nums" style={{ color: "var(--ink-3)" }}>
          {idx + 1} / {questions.length}
        </span>
      </div>
      <h3 className="text-base font-semibold leading-snug">{q.question}</h3>
      <div className="mt-4 flex flex-col gap-2">
        {q.choices.map((c, ci) => {
          const isPicked = picked === String(ci);
          const isCorrect = String(ci) === String(q.answer);
          const reveal = picked !== null;
          let border = "var(--border)";
          let bg = "var(--surface-2)";
          let color = "var(--ink)";
          if (reveal && isCorrect) { border = "var(--success)"; bg = "oklch(0.30 0.10 155 / 0.4)"; color = "var(--ink)"; }
          else if (reveal && isPicked && !isCorrect) { border = "var(--danger)"; bg = "var(--danger-soft)"; color = "var(--ink)"; }
          else if (isPicked) { border = "var(--brand)"; bg = "oklch(0.30 0.10 148 / 0.35)"; }
          return (
            <button
              key={ci}
              onClick={() => pick(ci)}
              disabled={reveal}
              className="rounded-lg px-4 py-3 text-left transition-colors"
              style={{ background: bg, border: `1px solid ${border}`, color }}
            >
              {c}
              {reveal && isCorrect && <span className="float-right text-sm" style={{ color: "var(--success)" }}>✓</span>}
              {reveal && isPicked && !isCorrect && <span className="float-right text-sm" style={{ color: "var(--danger)" }}>✕</span>}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="mt-4">
          {q.explanation && <p className="text-sm" style={{ color: "var(--ink-2)" }}>{q.explanation}</p>}
          <button className="btn btn-primary mt-3 w-full" onClick={next}>
            {idx + 1 < questions.length ? "Next question" : "Finish quiz"}
          </button>
        </div>
      )}
    </div>
  );
}