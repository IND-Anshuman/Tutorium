"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import InteractiveMessage from "@/components/chat/InteractiveMessage";
import type { InteractivePayload } from "@/lib/types";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  interactive?: InteractivePayload | null;
  fromVoice?: boolean;
}

function TranscriptBadge({ meta }: { meta?: { wordCount?: number; avgConfidence?: number } | null }) {
  if (!meta || meta.avgConfidence === undefined) return null;
  const pct = Math.round((meta.avgConfidence || 0) * 100);
  const color = pct >= 90 ? "var(--accent-2)" : pct >= 60 ? "var(--warn)" : "var(--miss)";
  return (
    <span className="ml-2 rounded px-1.5 py-0.5 text-[10px]" style={{ background: "var(--panel)", color, border: "1px solid var(--border)" }}>
      🎙 {pct}% clear
    </span>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [lastVocabCount, setLastVocabCount] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = useCallback(
    async (text: string, meta?: { fromVoice?: boolean; wordCount?: number; avgConfidence?: number }) => {
      const message = text.trim();
      if (!message || busy) return;
      setBusy(true);
      setError(null);
      setMessages((m) => [...m, { role: "user", content: message, fromVoice: meta?.fromVoice }]);
      setInput("");
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: "demo-user", message, topicId, transcriptMeta: meta || null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "agent failed");
        setTopicId(data.topicId);
        setMessages((m) => [...m, { role: "assistant", content: data.reply, interactive: data.interactive }]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [busy, topicId]
  );

  // ---- voice: record -> /api/stt -> send as message ----
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 2000) {
          setError("Recording too short — hold the mic for a beat longer.");
          return;
        }
        setTranscribing(true);
        try {
          const b64 = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(blob);
          });
          const res = await fetch("/api/stt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: "demo-user", audioBase64: b64, mode: "transcribe", language: "en" }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "transcription failed");
          const text = (data.transcript || "").trim();
          if (!text) {
            setError("Couldn't hear anything — try again closer to the mic.");
            return;
          }
          setLastVocabCount(data.vocabInjected ?? 0);
          await send(text, { fromVoice: true, wordCount: data.words?.length, avgConfidence: data.avgConfidence });
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone access denied — allow it in your browser to talk to Tutorium.");
    }
  }, [send]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  const onSayItBackRecordingStop = useCallback(
    async (payload: InteractivePayload & { type: "say_it_back" }) => {
      setBusy(true);
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setRecording(true);
        chunksRef.current = [];
        const rec = new MediaRecorder(stream);
        rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setRecording(false);
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const b64 = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.readAsDataURL(blob);
          });
          try {
            const res = await fetch("/api/stt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: "demo-user",
                audioBase64: b64,
                mode: "say_it_back",
                topicId: payload.topicId,
                passage: payload.passage,
                keyTerms: payload.keyTerms,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "scoring failed");
            setLastScore(data.score?.overall ?? null);
            setMessages((m) => [
              ...m,
              {
                role: "assistant",
                content: `**Say-It-Back score: ${data.score.overall}/100**${data.score.missedTerms?.length ? `\n\nShaky terms: ${data.score.missedTerms.join(", ")}` : "\n\nEvery key term came through clean."}`,
                interactive: { type: "heatmap", ...data.score } as unknown as InteractivePayload,
              },
            ]);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        };
        rec.start();
        setTimeout(() => rec.state !== "inactive" && rec.stop(), 20000); // auto-stop 20s
      } catch {
        setRecording(false);
        setBusy(false);
        setError("Microphone access denied.");
      }
    },
    []
  );

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Tutorium</h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>say less, learn more</p>
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
          <a href="/library" className="underline-offset-2 hover:underline">Library</a>
          {lastVocabCount !== null && (
            <span title="Vocab Hot-Swap terms injected into Speechmatics">🎯 {lastVocabCount} terms</span>
          )}
          {lastScore !== null && (
            <span style={{ color: lastScore >= 90 ? "var(--accent-2)" : lastScore >= 60 ? "var(--warn)" : "var(--miss)" }}>
              SIB {lastScore}/100
            </span>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="chat-scroll flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="mt-24 text-center">
            <p className="text-2xl font-semibold">Speak your question. Get a lesson.</p>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Hold the mic and ask anything — or paste messy notes and say &quot;make a study pack&quot;.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
              style={{
                background: m.role === "user" ? "var(--accent)" : "var(--panel)",
                color: m.role === "user" ? "#0b0e14" : "var(--text)",
                border: m.role === "assistant" ? "1px solid var(--border)" : "none",
              }}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.interactive && <div className="mt-3"><InteractiveMessage payload={m.interactive} onSayItBackRecord={onSayItBackRecordingStop} /></div>}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm" style={{ color: "var(--muted)" }}>Thinking…</div>}
        {transcribing && <div className="text-sm" style={{ color: "var(--muted)" }}>Transcribing with Speechmatics…</div>}
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
          placeholder="Ask anything, or paste messy notes…"
          className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none"
          style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
        />
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          disabled={busy || transcribing}
          className="flex h-11 w-11 items-center justify-center rounded-full text-lg transition"
          style={{
            background: recording ? "var(--miss)" : "var(--panel)",
            border: "1px solid var(--border)",
            opacity: busy || transcribing ? 0.4 : 1,
          }}
          title="Hold to talk"
        >
          🎙
        </button>
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          className="flex h-11 items-center rounded-xl px-4 text-sm font-medium"
          style={{ background: "var(--accent)", color: "#0b0e14", opacity: busy || !input.trim() ? 0.4 : 1 }}
        >
          Send
        </button>
      </div>
    </main>
  );
}