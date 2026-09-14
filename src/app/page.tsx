"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import InteractiveMessage from "@/components/chat/InteractiveMessage";
import Markdown from "@/components/chat/Markdown";
import Waveform from "@/components/ui/Waveform";
import { EmptyState } from "@/components/ui/primitives";
import SessionsRail from "@/components/sessions/SessionsRail";
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
  const color = pct >= 90 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)";
  return (
    <span
      className="ml-2 rounded px-1.5 py-0.5 text-[10px]"
      style={{ background: "var(--surface-2)", color, border: "1px solid var(--border)" }}
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
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: speaking ? "var(--lamp)" : "var(--ink-3)" }}
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [domain, setDomain] = useState<string>("");
  const [domainLocked, setDomainLocked] = useState<boolean>(false);
  const [railOpen, setRailOpen] = useState<boolean>(false);
  const [contextSummary, setContextSummary] = useState<string>("");
  const [domainDraft, setDomainDraft] = useState<string>("");
  const [editingDomain, setEditingDomain] = useState<boolean>(false);

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
          body: JSON.stringify({ userId: USERID, message, topicId, sessionId, transcriptMeta: meta || null }),
          signal: abort.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "agent failed");
        if (gen !== genRef.current) return; // cancelled or superseded
        setTopicId(data.topicId);
        setTopicTitle(data.topicTitle);

        if (data.queued && data.jobId) {
          setSendState("running");
          setSessionId((prev) => data.sessionId || prev);
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
          setSessionId((prev) => data.sessionId || prev);
          if (data.sessionCtxPreview) setContextSummary(data.sessionCtxPreview);
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
        // Priority: ?session= (deep link) > ?topic= (legacy) > last open session
        const params = new URLSearchParams(window.location.search);
        const wantSession = params.get("session");
        const wantTopic = params.get("topic");
        const qs =
          wantSession ? `userId=${USERID}&sessionId=${wantSession}` :
          wantTopic   ? `userId=${USERID}&topicId=${wantTopic}` :
                        `userId=${USERID}`;
        const res = await fetch(`/api/session?${qs}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.session) {
          setSessionId(data.session.id);
          setDomain(data.session.domain || "");
          setDomainLocked(!!data.session.domain_locked);
          setDomainDraft(data.session.domain || "");
          setTopicId(null);
          setTopicTitle("");
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
        } else if (data.topic) {
          setTopicId(data.topic.id);
          setTopicTitle(data.topic.title);
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
    <div className="flex h-screen flex-col">
      {railOpen && (
        <div
          className="rail-backdrop"
          onClick={() => setRailOpen(false)}
          aria-hidden
        />
      )}
      <SessionsRail
        currentSessionId={sessionId}
        open={railOpen}
        onClose={() => setRailOpen(false)}
      />

      {/* top bar */}
      <header className="sticky top-0 z-[var(--z-sticky)] border-b" style={{ borderColor: "var(--border)", background: "color-mix(in oklab, var(--bg) 88%, transparent)", backdropFilter: "blur(12px)" }}>
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              className="rail-toggle"
              aria-label="Open sessions list"
              onClick={() => setRailOpen((o) => !o)}
            >
              <span className="rail-toggle-icon" aria-hidden>
                <span /><span /><span />
              </span>
              <span className="rail-toggle-label">Sessions</span>
              <span className="rail-toggle-pulse" aria-hidden />
            </button>
            <div className="flex items-center gap-2">
              <span className="brand-mark" aria-hidden>T</span>
              <span className="text-lg font-bold tracking-tight">Tutorium</span>
            </div>
            {(domain || topicTitle) && (
              <span className="domain-header" title={domain || topicTitle}>
                <span className="dot" />
                {editingDomain ? (
                  <input
                    className="domain-edit-input"
                    autoFocus
                    value={domainDraft}
                    onChange={(e) => setDomainDraft(e.target.value)}
                    onBlur={async () => {
                      setEditingDomain(false);
                      if (!sessionId || !domainDraft.trim()) return;
                      try {
                        await fetch(`/api/sessions/${sessionId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ domain: domainDraft.trim() }),
                        });
                        setDomain(domainDraft.trim());
                        setDomainLocked(true);
                      } catch { /* ignore */ }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditingDomain(false);
                    }}
                  />
                ) : (
                  <>
                    <span className="domain-header-text">{domain || topicTitle}</span>
                    {!domainLocked && sessionId && (
                      <button
                        className="domain-edit"
                        aria-label="Rename session domain"
                        onClick={() => { setDomainDraft(domain || ""); setEditingDomain(true); }}
                      >
                        ✎
                      </button>
                    )}
                  </>
                )}
              </span>
            )}
          </div>
          <nav className="flex items-center gap-2">
            <a href="/library" className="btn btn-ghost" style={{ minHeight: 36, padding: "0 var(--space-sm)" }}>
              Library
            </a>
            <a className="btn btn-ghost" style={{ minHeight: 36, padding: "0 var(--space-sm)", display: "none" }} aria-hidden>
              Settings
            </a>
          </nav>
        </div>
      </header>

      {/* chat area */}
      <div ref={scrollRef} className="chat-scroll flex-1 overflow-y-auto" role="log" aria-live="polite">
        <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-6">
          {messages.length === 0 ? (
            <EmptyState
              icon="🪴"
              title="Pick a domain. Own the rest of the conversation."
              body="Tutorium remembers what you've learned, what tripped you up, and the terms you keep forgetting — across every message in this session. Start one below."
              actions={
                <div className="empty-cta">
                  <div className="empty-cta-row">
                    <span className="empty-cta-tag" aria-hidden>1</span>
                    <input
                      aria-label="Domain"
                      placeholder="e.g. Photosynthesis for USMLE · Spanish travel phrases · Rust ownership"
                      className="domain-edit-input empty-cta-input"
                      id="domain-input"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                          (document.getElementById("start-session-btn") as HTMLButtonElement | null)?.click();
                        }
                      }}
                    />
                  </div>
                  <div className="empty-cta-row empty-cta-buttons">
                    <button
                      id="start-session-btn"
                      className="btn btn-primary empty-cta-primary"
                      onClick={async () => {
                        const el = document.getElementById("domain-input") as HTMLInputElement | null;
                        const v = el?.value.trim() || "";
                        const r = await fetch("/api/sessions", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ userId: USERID, domain: v }),
                        });
                        const d = await r.json();
                        window.location.href = `/?session=${d.id}`;
                      }}
                    >
                      Start session →
                    </button>
                    <button
                      className="btn btn-lamp"
                      onClick={() => startRecording()}
                      aria-label="Record a voice question"
                    >
                      <Waveform active={recording} /> Hold to speak
                    </button>
                    <a href="/library" className="btn btn-ghost">Open library</a>
                  </div>
                  <ul className="empty-cta-steps" aria-label="How Tutorium sessions work">
                    <li><span className="empty-cta-num" aria-hidden>1</span><span><b>Name your domain.</b> One line is enough — calculus, vocabulary, a body system.</span></li>
                    <li><span className="empty-cta-num" aria-hidden>2</span><span><b>Speak or type.</b> The tutor builds flashcards, quizzes, and a Say-It-Back drill on the fly.</span></li>
                    <li><span className="empty-cta-num" aria-hidden>3</span><span><b>Come back later.</b> The domain chip and context strip carry the level you left at.</span></li>
                  </ul>
                </div>
              }
            />
          ) : (
            <div className="space-y-5">
              {messages.map((m) => (
                <div key={m.id} className={`msg-in flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[86%] rounded-2xl px-4 py-3"
                    style={{
                      background: m.role === "user" ? "var(--brand)" : "var(--surface)",
                      color: m.role === "user" ? "var(--on-brand)" : "var(--on-surface)",
                      border: m.role === "assistant" ? "1px solid var(--border)" : "none",
                      boxShadow: "var(--shadow-xs)",
                    }}
                  >
                    {m.role === "assistant" ? (
                      <Markdown>{m.content}</Markdown>
                    ) : (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    )}
                    {m.role === "assistant" ? (
                      <>
                        <div className="mt-2 flex items-center gap-2">
                          <SpeakButton text={m.content} />
                        </div>
                        {contextSummary && (
                          <div className="context-strip" aria-label="Session domain context">
                            <span className="context-strip-label">Domain context</span>
                            <span className="context-strip-pill">{contextSummary}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="mt-1 flex items-center justify-end gap-2">
                        {m.fromVoice && <span className="text-[11px]" style={{ color: "color-mix(in oklab, var(--on-brand) 70%, transparent)" }}>voice · <TranscriptBadge meta={m.transcriptMeta} /></span>}
                      </div>
                    )}
                    {m.interactive && <div className="mt-3"><InteractiveMessage payload={m.interactive} onSayItBackRecord={onSayItBackRecord} /></div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {busy && (
            <div className="mt-4 flex items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
              <Waveform active /> Thinking&hellip;
            </div>
          )}
          {sendState === "transcribing" && (
            <div className="mt-4 flex items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
              <Waveform active color="var(--brand)" /> Transcribing with Speechmatics&hellip;
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-lg border px-4 py-2.5 text-sm" role="alert" style={{ background: "var(--danger-soft)", borderColor: "color-mix(in oklab, var(--danger) 50%, transparent)", color: "var(--danger)" }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* composer */}
      <div className="sticky bottom-0 z-[var(--z-sticky)] border-t pb-[env(safe-area-inset-bottom)]" style={{ borderColor: "var(--border)", background: "color-mix(in oklab, var(--bg) 92%, transparent)", backdropFilter: "blur(12px)" }}>
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-3">
          <div className="flex flex-1 items-end gap-2 rounded-2xl border bg-[var(--surface)] px-3 py-1.5" style={{ borderColor: "var(--border)" , transition: "border-color var(--dur-base) var(--ease-out)"}}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              rows={1}
              placeholder={busy ? "One moment — I'll take your message when ready." : "Ask anything, or paste messy notes…"}
              aria-label="Message to Tutorium"
              className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-base outline-none placeholder:italic"
              style={{ color: "var(--ink)" }}
            />
            {busy && (
              <button onClick={cancel} aria-label="Cancel the current request" className="icon-btn" style={{ width: 36, height: 36, minWidth: 36, borderRadius: "var(--radius-md)", background: "var(--surface-2)", color: "var(--danger)" }}>
                ✕
              </button>
            )}
          </div>
          <button
            onMouseDown={startRecording}
            onTouchStart={startRecording}
            disabled={sendState === "receiving" || sendState === "transcribing"}
            aria-label={recording ? "Recording — release to send" : "Hold to talk"}
            className="icon-btn"
            title="Hold to talk"
            style={{
              background: recording ? "var(--lamp)" : "var(--surface)",
              color: recording ? "var(--on-lamp)" : "var(--lamp)",
              borderColor: recording ? "var(--lamp)" : "var(--border)",
              boxShadow: recording ? "0 0 0 4px var(--lamp-soft)" : "var(--shadow-xs)",
            }}
          >
            {recording ? <Waveform active /> : "🎙"}
          </button>
          <button onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send message" className="btn btn-primary">
            Send
          </button>
        </div>
      </div>

      {/* Say-It-Back floating recorder */}
      {sibRecording && (
        <div className="fixed inset-x-0 bottom-24 z-[var(--z-dropdown)] mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-lg" style={{ background: "var(--surface)", borderColor: "var(--lamp)", boxShadow: "var(--shadow-lg)" }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--lamp)" }}>
            <Waveform active /> Recording read-aloud&hellip;
          </div>
          <button onClick={stopSibRecording} aria-label="Stop recording" className="btn btn-lamp">Stop</button>
        </div>
      )}
    </div>
  );
}
