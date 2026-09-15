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
    const tone =
      pct >= 0.7 ? "var(--success)" :
      pct >= 0.5 ? "var(--warning)" :
      "var(--danger)";
    return (
      <div className="widget-card widget-card--quiz widget-card--result">
        <div className="widget-head">
          <span className="widget-icon" aria-hidden>🎯</span>
          <div className="widget-title">
            <span className="widget-label">Quiz complete</span>
            <span className="widget-sub">{praise(score, questions.length)}</span>
          </div>
          <span className="widget-counter" style={{ color: tone }}>
            {score}<span style={{ color: "var(--ink-3)" }}>/{questions.length}</span>
          </span>
        </div>
        <div className="quiz-meter">
          <div className="quiz-meter-bar" style={{ width: `${pct * 100}%`, background: tone }} />
        </div>
        <div className="quiz-actions">
          <button
            className="btn btn-primary flex-1"
            onClick={() => { setIdx(0); setPicked(null); setScore(0); setDone(false); }}
          >
            Try again
          </button>
        </div>
        {topicId && <div className="quiz-meta">Score saved to your learner profile.</div>}
      </div>
    );
  }

  return (
    <div className="widget-card widget-card--quiz">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>✅</span>
        <div className="widget-title">
          <span className="widget-label">Quiz</span>
          <span className="widget-sub">multiple choice</span>
        </div>
        <span className="widget-counter">{idx + 1} / {questions.length}</span>
      </div>
      <div className="quiz-question">{q.question}</div>
      <div className="quiz-choices">
        {q.choices.map((c, ci) => {
          const isPicked = picked === String(ci);
          const isCorrect = String(ci) === String(q.answer);
          const reveal = picked !== null;
          let cls = "quiz-choice";
          if (reveal && isCorrect) cls += " quiz-choice--correct";
          else if (reveal && isPicked && !isCorrect) cls += " quiz-choice--wrong";
          else if (isPicked) cls += " quiz-choice--picked";
          return (
            <button
              key={ci}
              onClick={() => pick(ci)}
              disabled={reveal}
              className={cls}
            >
              <span className="quiz-choice-letter">
                {String.fromCharCode(65 + ci)}
              </span>
              <span className="quiz-choice-text">{c}</span>
              {reveal && isCorrect && <span className="quiz-choice-mark quiz-choice-mark--correct" aria-hidden>✓</span>}
              {reveal && isPicked && !isCorrect && <span className="quiz-choice-mark quiz-choice-mark--wrong" aria-hidden>✕</span>}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="quiz-explain">
          {q.explanation && <p className="quiz-explanation">{q.explanation}</p>}
          <button className="btn btn-primary widget-action-primary" onClick={next}>
            {idx + 1 < questions.length ? "Next question →" : "Finish quiz"}
          </button>
        </div>
      )}
    </div>
  );
}
