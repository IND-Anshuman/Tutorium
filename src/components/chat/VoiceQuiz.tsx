"use client";

import { useRef, useState } from "react";
import type { InteractivePayload, QuizItem } from "@/lib/types";
import { matchVoiceAnswer } from "@/lib/voicequiz";
import SpeakButton from "./SpeakButton";

type VoiceState = "idle" | "listening" | "thinking";

interface Props {
  questions: QuizItem[];
  topicId?: string;
  onAnswer?: (payload: { type: "voice_answer"; questionIndex: number; picked: number; transcript: string } ) => void;
}

export default function VoiceQuiz({ questions, topicId, onAnswer }: Props) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  if (!questions?.length) return null;

  const q = questions[idx];
  const startListening = async () => {
    if (voice !== "idle" || picked !== null) return;
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        void submitRecording();
      };
      rec.start();
      setVoice("listening");
    } catch {
      setMicError("Microphone unavailable — type the answer below instead.");
    }
  };
  const stopListening = () => {
    if (voice !== "listening") return;
    setVoice("thinking");
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  const submitRecording = async () => {
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (blob.size < 800) throw new Error("no speech detected — try again");
      const buf = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "demo-user",
          audioBase64: base64,
          filename: "voice-quiz.webm",
          mode: "transcribe",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "transcription failed");
      const said = String(data.transcript || "");
      setTranscript(said);
      const match = matchVoiceAnswer(said, q.choices);
      if (match.index !== null) {
        applyPick(match.index, said);
      } else {
        setMicError(`I heard "${said.slice(0, 60)}" — didn't match a choice. Tap one or try again.`);
        setVoice("idle");
      }
    } catch (e) {
      setMicError((e as Error).message);
      setVoice("idle");
    }
  };

  const applyPick = (choiceIdx: number, said?: string) => {
    setPicked(choiceIdx);
    setVoice("idle");
    if (String(choiceIdx) === String(q.answer)) setScore((s) => s + 1);
    onAnswer?.({ type: "voice_answer", questionIndex: idx, picked: choiceIdx, transcript: said || transcript });
  };

  const next = () => {
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
      setPicked(null);
      setTranscript("");
      setMicError(null);
      setVoice("idle");
    } else {
      setDone(true);
      if (topicId) {
        fetch("/api/quiz-score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: "demo-user", topicId, score, total: questions.length }),
        }).catch(() => {});
      }
    }
  };

  if (done) {
    const pct = score / questions.length;
    const tone = pct >= 0.7 ? "var(--success)" : pct >= 0.5 ? "var(--warning)" : "var(--danger)";
    return (
      <div className="widget-card widget-card--quiz widget-card--result">
        <div className="widget-head">
          <span className="widget-icon" aria-hidden>🎤</span>
          <div className="widget-title">
            <span className="widget-label">Voice quiz complete</span>
            <span className="widget-sub">hands-free, hands still clean</span>
          </div>
          <span className="widget-counter" style={{ color: tone }}>
            {score}<span style={{ color: "var(--ink-3)" }}>/{questions.length}</span>
          </span>
        </div>
        <div className="quiz-meter">
          <div className="quiz-meter-bar" style={{ width: `${pct * 100}%`, background: tone }} />
        </div>
        <div className="quiz-actions">
          <button className="btn btn-primary flex-1" onClick={() => { setIdx(0); setPicked(null); setScore(0); setDone(false); }}>
            Go again
          </button>
        </div>
        {topicId && <div className="quiz-meta">Score saved to your learner profile.</div>}
      </div>
    );
  }

  const reveal = picked !== null;
  return (
    <div className="widget-card widget-card--quiz widget-card--voicequiz">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>🎤</span>
        <div className="widget-title">
          <span className="widget-label">Rapid-fire voice quiz</span>
          <span className="widget-sub">speak your answer — no hands needed</span>
        </div>
        <span className="widget-counter">{idx + 1} / {questions.length}</span>
      </div>
      <div className="quiz-question">
        {q.question}
        <span className="voicequiz-say"><SpeakButton text={q.question} /></span>
      </div>
      <div className="quiz-choices">
        {q.choices.map((c, ci) => {
          const isPicked = picked === ci;
          const isCorrect = String(ci) === String(q.answer);
          let cls = "quiz-choice";
          if (reveal && isCorrect) cls += " quiz-choice--correct";
          else if (reveal && isPicked && !isCorrect) cls += " quiz-choice--wrong";
          else if (isPicked) cls += " quiz-choice--picked";
          return (
            <button key={ci} onClick={() => applyPick(ci)} disabled={reveal} className={cls}>
              <span className="quiz-choice-letter">{String.fromCharCode(65 + ci)}</span>
              <span className="quiz-choice-text">{c}</span>
              {reveal && isCorrect && <span className="quiz-choice-mark quiz-choice-mark--correct" aria-hidden>✓</span>}
              {reveal && isPicked && !isCorrect && <span className="quiz-choice-mark quiz-choice-mark--wrong" aria-hidden>✕</span>}
            </button>
          );
        })}
      </div>
      {micError && <div className="voicequiz-error" role="alert">{micError}</div>}
      {transcript && reveal && <div className="voicequiz-transcript">I heard: “{transcript.slice(0, 120)}”</div>}
      {picked !== null && (
        <div className="quiz-explain">
          {q.trap && picked !== Number(q.answer) && <p className="quiz-trap">🪤 {q.trap}</p>}
          {q.explanation && <p className="quiz-explanation">{q.explanation}</p>}
          <button className="btn btn-primary widget-action-primary" onClick={next}>
            {idx + 1 < questions.length ? "Next question →" : "Finish quiz"}
          </button>
        </div>
      )}
      <div className="voicequiz-controls" role="status" aria-live="polite">
        <button
          className="btn btn-lamp flex-1"
          onClick={voice === "listening" ? stopListening : startListening}
          disabled={reveal || voice === "thinking"}
          aria-label={voice === "listening" ? "Stop and check my answer" : "Answer with your voice"}
        >
          {voice === "listening" ? "⏹ Stop — checking…" : voice === "thinking" ? "🧠 Listening…" : "🎙 Answer with your voice"}
        </button>
        <span className="voicequiz-hint">
          {voice === "listening" ? "Say the answer, or a letter like “B”." : "Say the answer out loud, or a letter — “A”, “B”…"}
        </span>
      </div>
    </div>
  );
}

// Type guard used by InteractiveMessage.
export function isVoiceQuizPayload(p: InteractivePayload): boolean {
  return p.type === "voice_quiz";
}