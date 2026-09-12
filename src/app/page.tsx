"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import InteractiveMessage from "@/components/chat/InteractiveMessage";
import Markdown from "@/components/chat/Markdown";
import type { InteractivePayload } from "@/lib/types";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  interactive?: InteractivePayload | null;
  fromVoice?: boolean;
  transcriptMeta?: { wordCount?: number; avgConfidence?: number } | null;
}

const USERID = "demo-user";

// ---------- helpers ----------

function TranscriptBadge({ meta }: { meta?: { wordCount?: number; avgConfidence?: number } | null }) {
  if (!meta || meta.avgConfidence === undefined) return null;
  const pct = Math.round((meta.avgConfidence || 0) * 100);
  const color = pct >= 90 ? "var(--accent-2)" : pct >= 60 ? "var(--warn)" : "var(--miss)";
  return (
    <span
      className="ml-2 rounded px-1.5 py-0.5 text-[10px]"
      style={{ background: "var(--panel)", color, border: "1px solid var(--border)" }}
      title="Speechmatics word-confidence on this voice message"
    >
      🎙 {pct}% clear
    </span>
  );
}

function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const speak = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const clean = text.replace(/[#*_`>\[\]]/g, " ").replace(/\s+/g, " ").trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1;
    u.pitch = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };
  return (
    <button
      onClick={speak}
      aria-label={speaking ? "Stop speaking" : "Hear this reply read aloud"}
      className="mt-2 rounded-full px-2.5 py-1 text-[11px]"
      style={{ background: "var(--panel)", border: "1px solid var(--border)", color: speaking ? "var(--accent)" : "var(--muted)" }}
    >
      {speaking ? "■ Stop" : "🔊 Listen"}
    </button>
  );
}

async function pollJob(jobId: string, signal: AbortSignal, onDone: (job: any) => void) {
  while (!signal.aborted) {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: USERID, mode: "job_status", jobId }),
      signal,
    });
    const data = await res.json();
    const job = data.job;
    if (job?.status === "done" || job?.status === "failed") {
      onDone(job);
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------- component ----------

type SendState = "idle" | "receiving" | "running" | "transcribing";

export default function Home() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [recording, setRecording] = useState(false);
  const [sibRecording, setSibRecording] = useState(false);
  const [lastVocabCount, setLastVocabCount] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicTitle, setTopicTitle] = useState<string>("");
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0); // increment to invalidate in-flight generation callbacks
  const micRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef(0);
  const sibRecorderRef = useRef<MediaRecorder | null>(null);
  const runningRef = useRef(false);

  const recordStart = useCallback(async () => {
    if (micRef.current?.state === "recording") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      chunksRef.current = [];
      recStartRef.current = Date.now();
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      micRef.current = rec;
      rec.start();
      setRecording(true);
      return rec;
    } catch {
      setError("Microphone access denied — allow it in your browser to talk to Tutorium.");
      return null;
    }
  }, []);

  const stopAndAnalyze = useCallback(
    async (blob: Blob): Promise<Blob | null> => {
      const minMs = 500;
      const elapsed = Date.now() - recStartRef.current;
      if (blob.size < 2000 || elapsed < minMs) {
        setError("Recording too short — hold the mic a beat longer.");
        return null;
      }
      return blob;
    },
    []
  );

  const releaseMic = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micRef.current = null;
    setRecording(false);
  }, []);

  // Clean up any active recording if the user navigates away mid-hold.
  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      sibRecorderRef.current?.state !== "inactive" && sibRecorderRef.current?.stop();
    };
  }, []);

  const doTranscribe = useCallback(
    async (blob: Blob, mode: "transcribe" | "say_it_back", extra: Record<string, unknown> = {}) => {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const res = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USERID, audioBase64: b64, mode, language: "en", ...extra }),
      });
      return await res.json();
    },
    []
  );

  // ---------- main send ----------
  const send = useCallback(
    async (text: string, meta?: { fromVoice?: boolean; wordCount?: number; avgConfidence?: number }) => {
      const message = text.trim();
      if (!message || sendState !== "idle") return;
      const myId = uid();
      setError(null);
      setSendState("receiving");
      setMessages((m) => [
        ...m,
        { id: myId, role: "user", content: message, fromVoice: meta?.fromVoice, transcriptMeta: meta || null },
      ]);
      setInput("");

      const abort = new AbortController();
      abortRef.current = abort;
      const gen = ++genRef.current;

      // optimistic typing: even while receiving, allow compose; block only re-send
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: USERID, message, topicId, transcriptMeta: meta || null }),
          signal: abort.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "agent failed");
        if (gen !== genRef.current) return; // cancelled or superseded
        setTopicId(data.topicId);
        setTopicTitle(data.topicTitle);

        if (data.queued && data.jobId) {
          setSendState("running");
          setMessages((m) => [
            ...m,
            { id: uid(), role: "assistant", content: data.pretty || "I'm building your study pack…" },
          ]);
          await pollJob(data.jobId, abort.signal, (job) => {
            if (gen !== genRef.current || abort.signal.aborted) return;
            setTopicId(data.topicId);
            setTopicTitle(data.topicTitle);
            const interactive =
              (job.result?.interactive as InteractivePayload | null) ||
              (data.intent === "make_visual"
                ? ({ type: "vocab_preview", topic: data.topicTitle, topicId: data.topicId, terms: [] } as InteractivePayload)
                : ({
                    type: "study_pack_actions",
                    topic: data.topicTitle,
                    topicId: data.topicId,
                    actions: [
                      { label: "Take the quiz", materialType: "quiz" },
                      { label: "Show flashcards", materialType: "flashcards" },
                      { label: "Practice saying it back", materialType: "say_it_back" },
                    ],
                  } as InteractivePayload));
            setMessages((m) => [
              ...m,
              {
                id: uid(),
                role: "assistant",
                content:
                  data.intent === "make_visual"
                    ? `Here's the visual guide for **${data.topicTitle}**.`
                    : `Your **${data.topicTitle}** study pack is ready — clean notes, reviewer, flashcards, quiz, summary, and a Say-It-Back passage. What next?`,
                interactive,
              },
            ]);
          });
        } else {
          setMessages((m) => [
            ...m,
            { id: uid(), role: "assistant", content: data.reply, interactive: data.interactive },
          ]);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        if (gen === genRef.current) setSendState("idle");
      }
    },
    [sendState, topicId]
  );

  const cancel = useCallback(() => {
    genRef.current++; // invalidate in-flight callbacks
    abortRef.current?.abort();
    setSendState("idle");
    setError(null);
  }, []);

  // ---------- main mic (hold-to-talk) ----------
  const startRecording = useCallback(async () => {
    if (sendState !== "idle" && sendState !== "transcribing") return;
    const rec = await recordStart();
    if (!rec) return;
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const valid = await stopAndAnalyze(blob);
      if (!valid) return;
      setSendState("transcribing");
      setRecording(false);
      try {
        const data = await doTranscribe(blob, "transcribe");
        if (!data.error && data.transcript) {
          setLastVocabCount(data.vocabInjected ?? 0);
        }
        send(data.transcript || "", {
          fromVoice: true,
          wordCount: data.words?.length,
          avgConfidence: data.avgConfidence,
        });
        if (data.error) setError(data.error);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        if (genRef.current === genRef.current) setSendState((s) => (s === "transcribing" ? "idle" : s));
      }
    };
  }, [recordStart, stopAndAnalyze, doTranscribe, send]);

  // pointerup anywhere releases a hold (fixes the belt-and-braces leak)
  useEffect(() => {
    const up = () => {
      if (micRef.current?.state === "recording") micRef.current.stop(); // fires onstop
      releaseMic();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up);
    };
  }, [releaseMic]);

  // ---------- Say-It-Back (manual start/stop) ----------
  const startSibRecording = useCallback(async () => {
    if (sibRecording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      sibRecorderRef.current = rec;
      rec.start();
      setSibRecording(true);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setSibRecording(false);
        const blob = new Blob(chunks, { type: "audio/webm" });
        if (blob.size < 5000) {
          setError("Recording too short — read the passage aloud.");
          return;
        }
        setSendState("running");
        const sibPayload = (sibPayloadRef.current || {}) as { topicId?: string; passage?: string; keyTerms?: string[] };
        try {
          const data = await doTranscribe(
            blob,
            "say_it_back",
            { topicId: sibPayload.topicId, passage: sibPayload.passage, keyTerms: sibPayload.keyTerms }
          );
          if (data.error) throw new Error(data.error);
          setLastScore(data.score?.overall ?? null);
          setMessages((m) => [
            ...m,
            {
              id: uid(),
              role: "assistant",
              content: `**Say-It-Back score: ${data.score.overall}/100**${
                data.score.missedTerms?.length ? `\n\nShaky terms: ${data.score.missedTerms.join(", ")}` : "\n\nEvery key term came through clean."
              }`,
              interactive: { type: "heatmap", topicId: sibPayload.topicId, overall: data.score.overall, words: data.score.words } as InteractivePayload,
            },
          ]);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setSendState("idle");
        }
      };
    } catch {
      setError("Microphone access denied.");
    }
  }, [sibRecording, doTranscribe]);
  const sibPayloadRef = useRef<Record<string, unknown> | null>(null);

  const stopSibRecording = useCallback(() => {
    if (sibRecorderRef.current?.state === "recording") sibRecorderRef.current.stop();
  }, []);

  // ---------- thread through Say-It-Back payload from the widget ----------
  const onSayItBackRecord = useCallback(
    (payload: InteractivePayload & { type: "say_it_back" }) => {
      sibPayloadRef.current = { topicId: payload.topicId, passage: payload.passage, keyTerms: payload.keyTerms };
      startSibRecording();
    },
    [startSibRecording]
  );

  // ---------- restore session on mount (FIX 1) ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // prefer an explicit ?topic= from the topic page "Continue studying" link
        const want = new URLSearchParams(window.location.search).get("topic");
        const qs = want ? `userId=${USERID}&topicId=${want}` : `userId=${USERID}`;
        const res = await fetch(`/api/session?${qs}`);
        const data = await res.json();
        if (cancelled || !data.session) return;
        setTopicId(data.session.topicId);
        setTopicTitle(data.session.topicTitle);
        if (Array.isArray(data.messages) && data.messages.length) {
          const hydrated: ChatMsg[] = data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            interactive: m.interactive || null,
            fromVoice: !!m.audio_meta,
            transcriptMeta: m.audio_meta || null,
          }));
          setMessages(hydrated);
        }
      } catch {
        /* offline/session-less start is fine */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sendState]);

  const busy = sendState === "receiving" || sendState === "running";

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Tutorium</h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>say less, learn more</p>
          {topicTitle && (
            <p className="mt-1 text-[11px]" style={{ color: "var(--accent)" }}>Studying: {topicTitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
          <a href="/library" className="underline-offset-2 hover:underline">Library</a>
          {lastVocabCount !== null && (
            <span title="Vocab Hot-Swap terms injected into Speechmatics">🎯 {lastVocabCount} terms boosted</span>
          )}
          {lastScore !== null && (
            <span
              style={{ color: lastScore >= 90 ? "var(--accent-2)" : lastScore >= 60 ? "var(--warn)" : "var(--miss)" }}
              title="Last Say-It-Back pronunciation score"
            >
              SIB {lastScore}/100
            </span>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="chat-scroll flex-1 space-y-4 overflow-y-auto pb-4" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="mt-24 text-center">
            <p className="text-2xl font-semibold">Speak your question. Get a lesson.</p>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Hold the mic and ask anything — or paste messy notes and say &quot;make a study pack&quot;.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
              style={{
                background: m.role === "user" ? "var(--accent)" : "var(--panel)",
                color: m.role === "user" ? "#0b0e14" : "var(--text)",
                border: m.role === "assistant" ? "1px solid var(--border)" : "none",
              }}
            >
              {m.role === "assistant" ? (
                <Markdown>{m.content}</Markdown>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}<TranscriptBadge meta={m.transcriptMeta} /></div>
              )}
              {m.role === "assistant" && <SpeakButton text={m.content} />}
              {m.interactive && <div className="mt-3"><InteractiveMessage payload={m.interactive} onSayItBackRecord={onSayItBackRecord} /></div>}
              {m.role === "user" && m.fromVoice && (
                <div className="mt-1 text-right text-[10px]" style={{ color: "#0b0e14", opacity: 0.7 }}>voice input</div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm" style={{ color: "var(--muted)" }}>Thinking…</div>}
        {sendState === "transcribing" && <div className="text-sm" style={{ color: "var(--muted)" }}>Transcribing with Speechmatics…</div>}
        {error && <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#3a1620", color: "var(--miss)" }}>{error}</div>}
      </div>

      <div className="sticky bottom-0 flex items-end gap-2 bg-gradient-to-t from-[var(--bg)] to-transparent py-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={busy ? "One moment — your next message will send when ready…" : "Ask anything, or paste messy notes…"}
          className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none"
          aria-label="Message to Tutorium"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", fontStyle: busy ? "italic" : "normal" }}
        />
        {busy && (
          <button
            onClick={cancel}
            aria-label="Cancel the current request"
            className="flex h-11 items-center rounded-xl px-3 text-sm"
            style={{ background: "var(--miss)", color: "#0b0e14" }}
          >
            ✕
          </button>
        )}
        <button
          onMouseDown={startRecording}
          onTouchStart={startRecording}
          disabled={sendState === "receiving" || sendState === "transcribing"}
          aria-label="Hold to talk"
          className="flex h-11 w-11 items-center justify-center rounded-full text-lg transition"
          style={{
            background: recording ? "var(--miss)" : "var(--panel)",
            border: "1px solid var(--border)",
            opacity: sendState === "receiving" || sendState === "transcribing" ? 0.4 : 1,
          }}
        >
          🎙
        </button>
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          aria-label="Send message"
          className="flex h-11 items-center rounded-xl px-4 text-sm font-medium"
          style={{ background: "var(--accent)", color: "#0b0e14", opacity: busy || !input.trim() ? 0.4 : 1 }}
        >
          Send
        </button>
      </div>

      {sibRecording && (
        <div className="fixed inset-x-0 bottom-24 z-40 mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl px-4 py-3"
          style={{ background: "var(--panel)", border: "1px solid var(--miss)" }}>
          <div className="text-sm" style={{ color: "var(--miss)" }}>🎙 Recording read-aloud…</div>
          <button
            onClick={stopSibRecording}
            aria-label="Stop recording"
            className="rounded-lg px-3 py-1.5 text-sm font-medium"
            style={{ background: "var(--miss)", color: "#0b0e14" }}
          >
            Stop
          </button>
        </div>
      )}
    </main>
  );
}