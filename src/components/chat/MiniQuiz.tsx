"use client";

import { useMemo, useState } from "react";
import type { QuizItem, TricksterTheme } from "@/lib/types";
import { shuffleWithRemap, pickHints } from "@/lib/quizgen";

function praise(score: number, total: number): string {
  const pct = total ? score / total : 0;
  if (pct >= 0.9) return "Excellent — you've got this.";
  if (pct >= 0.7) return "Great work — a couple to review.";
  if (pct >= 0.5) return "Solid attempt — review the ones you missed.";
  return "Keep at it — recap the material and try again.";
}

interface Props {
  questions: QuizItem[];
  topicId?: string;
  theme?: TricksterTheme;
}

export default function MiniQuiz({ questions, topicId, theme }: Props) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [streak, setStreak] = useState(0);
  const [eggShown, setEggShown] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [dimmed, setDimmed] = useState<number[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  if (!questions?.length) return null;

  // Trickster shuffle: stable per question via useMemo — answer index remaps.
  const q0 = questions[idx];
  const { choices, answerIdx } = useMemo(() => {
    const correctText = q0.choices[Number(q0.answer)];
    if (theme?.shuffleChoices) {
      const { shuffled, correctIndex } = shuffleWithRemap(q0.choices, Number(q0.answer));
      return { choices: shuffled, answerIdx: correctIndex };
    }
    return { choices: q0.choices, answerIdx: Number(q0.answer) };
  }, [q0, theme?.shuffleChoices]);

  const timeLimit = theme?.timePerQuestion && theme.timePerQuestion > 0 ? theme.timePerQuestion : null;
  const effectiveAnswer = String(answerIdx);
  const q = q0;

  // countdown
  useMemo(() => {
    if (!timeLimit) return;
    setTimeLeft(timeLimit);
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s === null) return s;
        if (s <= 1) {
          clearInterval(t);
          // time's up: counts as a wrong pick, auto-advance
          setStreak(0);
          setPicked("-1");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [idx, timeLimit]);

  const pick = (choiceIdx: number) => {
    if (picked !== null) return;
    setPicked(String(choiceIdx));
    const correct = String(choiceIdx) === effectiveAnswer;
    if (correct) {
      setScore((s) => s + 1);
      if (theme?.streakMode) {
        const next = streak + 1;
        setStreak(next);
        if (next >= 4 && theme.easterEgg && !eggShown) setEggShown(true);
      }
    } else if (theme?.streakMode) {
      setStreak(0);
    }
  };

  const useHint = () => {
    if (!theme?.hintsEnabled || picked !== null) return;
    if (hintsUsed >= (theme.hintCount ?? 0)) return;
    setDimmed(pickHints(choices, answerIdx, 2));
    setHintsUsed((h) => h + 1);
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
      setDimmed([]);
      setTimeLeft(timeLimit);
    } else {
      finish();
    }
  };

  // Trickster paints personality, not the surface: background/borders/text stay on the
  // app's dark palette (light LLM-picked backgrounds made cards unreadable + mismatched),
  // while accent, radius, icon and vibe carry the character.
  const style = theme
    ? ({
        "--t-accent": theme.accent,
        "--t-radius": `${theme.radius}px`,
        "--t-font-scale": String(theme.fontScale),
        "--t-icon": `"${theme.icon}"`,
      } as React.CSSProperties)
    : undefined;

  if (done) {
    const pct = score / questions.length;
    const tone =
      pct >= 0.7 ? "var(--success)" :
      pct >= 0.5 ? "var(--warning)" :
      "var(--danger)";
    return (
      <div className="widget-card widget-card--quiz widget-card--result" style={style}>
        <div className="widget-head">
          <span className="widget-icon" aria-hidden>🎯</span>
          <div className="widget-title">
            <span className="widget-label">Quiz complete</span>
            <span className="widget-sub">{theme?.message || praise(score, questions.length)}</span>
          </div>
          <span className="widget-counter" style={{ color: tone }}>
            {score}<span style={{ color: "var(--ink-3)" }}>/{questions.length}</span>
          </span>
        </div>
        <div className="quiz-meter">
          <div className="quiz-meter-bar" style={{ width: `${pct * 100}%`, background: tone }} />
        </div>
        {pct >= 0.8 && theme?.confetti && (
          <div className="quiz-confetti" aria-hidden>🎉</div>
        )}
        {theme?.easterEgg && eggShown && (
          <div className="quiz-egg" role="status">🥚 {theme.easterEgg}</div>
        )}
        <div className="quiz-actions">
          <button
            className="btn btn-primary flex-1"
            onClick={() => { setIdx(0); setPicked(null); setScore(0); setDone(false); setStreak(0); setEggShown(false); setHintsUsed(0); }}
          >
            Try again
          </button>
        </div>
        {topicId && <div className="quiz-meta">Score saved to your learner profile.</div>}
      </div>
    );
  }

  const reveal = picked !== null;
  const showCorrectNow = reveal && !(theme?.hideCorrectUntilPick && picked === "-1");

  return (
    <div className={`widget-card widget-card--quiz quiz-tricky ${theme ? "quiz-tricky" : ""}`} style={style}>
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>{theme?.icon || "✅"}</span>
        <div className="widget-title">
          <span className="widget-label">Quiz{theme?.vibe ? ` · ${theme.vibe}` : ""}</span>
          <span className="widget-sub">pick an answer — I'll explain it</span>
        </div>
        {theme?.streakMode && streak >= 2 && <span className="quiz-streak" role="status">🔥 {streak}</span>}
        <span className="widget-counter">{idx + 1} / {questions.length}</span>
      </div>
      {timeLimit && timeLeft !== null && (
        <div className="quiz-timer" role="timer" aria-label={`${timeLeft} seconds left`}>
          <div className="quiz-timer-bar" style={{ width: `${(timeLeft / timeLimit) * 100}%` }} />
        </div>
      )}
      <div className="quiz-question">{q.question}</div>
      <div className="quiz-choices">
        {choices.map((c, ci) => {
          const isPicked = picked === String(ci);
          const isCorrect = String(ci) === effectiveAnswer;
          const isDimmed = dimmed.includes(ci);
          let cls = "quiz-choice";
          if (showCorrectNow && isCorrect) cls += " quiz-choice--correct";
          else if (reveal && isPicked && !isCorrect) cls += " quiz-choice--wrong";
          else if (isPicked) cls += " quiz-choice--picked";
          if (isDimmed && !reveal) cls += " quiz-choice--dimmed";
          return (
            <button
              key={ci}
              onClick={() => pick(ci)}
              disabled={reveal || isDimmed}
              className={cls}
            >
              <span className="quiz-choice-letter">
                {String.fromCharCode(65 + ci)}
              </span>
              <span className="quiz-choice-text">{c}</span>
              {showCorrectNow && isCorrect && <span className="quiz-choice-mark quiz-choice-mark--correct" aria-hidden>✓</span>}
              {reveal && isPicked && !isCorrect && <span className="quiz-choice-mark quiz-choice-mark--wrong" aria-hidden>✕</span>}
            </button>
          );
        })}
      </div>
      {theme?.hintsEnabled && hintsUsed < (theme.hintCount ?? 0) && picked === null && (
        <button className="btn btn-ghost quiz-hint-btn" onClick={useHint}>
          💡 50:50 ({(theme.hintCount ?? 0) - hintsUsed} left)
        </button>
      )}
      {picked !== null && (
        <div className="quiz-explain">
          {q.trap && picked !== String(q.answer) && <p className="quiz-trap">🪤 {q.trap}</p>}
          {q.explanation && <p className="quiz-explanation">{q.explanation}</p>}
          <button className="btn btn-primary widget-action-primary" onClick={next}>
            {idx + 1 < questions.length ? "Next question →" : "Finish quiz"}
          </button>
        </div>
      )}
      {theme?.easterEgg && eggShown && picked !== null && (
        <div className="quiz-egg" role="status">🥚 {theme.easterEgg}</div>
      )}
    </div>
  );
}