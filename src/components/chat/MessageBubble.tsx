"use client";

// MessageBubble — single chat message with avatar, hover actions, animated
// entrance. Used for both user and assistant messages.

import { useEffect, useState } from "react";
import Markdown from "./Markdown";
import SpeakButton from "./SpeakButton";
import InteractiveMessage from "./InteractiveMessage";
import TranscriptBadge from "./TranscriptBadge";
// SpeakButton is a separate client component imported directly.
import type { InteractivePayload } from "@/lib/types";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  interactive?: InteractivePayload | null;
  fromVoice?: boolean;
  transcriptMeta?: { wordCount?: number; avgConfidence?: number } | null;
}

interface Props {
  msg: ChatMsg;
  isLast?: boolean;
  contextSummary?: string;
  onCopy?: (text: string) => void;
  onRegenerate?: () => void;
  onSayItBackRecord?: (payload: any) => void;
}

function TypingDots() {
  return (
    <span className="typing-dots" aria-label="Tutorium is composing a reply">
      <span />
      <span />
      <span />
    </span>
  );
}

export default function MessageBubble({
  msg,
  isLast,
  contextSummary,
  onCopy,
  onRegenerate,
  onSayItBackRecord,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState<null | "up" | "down">(null);

  // Reset copy feedback after 1.6s
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = () => {
    if (!onCopy) return;
    onCopy(msg.content);
    setCopied(true);
  };

  const isAssistant = msg.role === "assistant";
  const showContext = isAssistant && isLast && !!contextSummary;

  return (
    <div
      className={`msg-in msg-in--${msg.role}`}
      data-role={msg.role}
    >
      {isAssistant && (
        <span className="msg-avatar msg-avatar--assistant" aria-hidden>
          T
        </span>
      )}
      <div className="msg-stack">
        <div
          className={`msg-bubble ${isAssistant ? "msg-bubble--assistant" : "msg-bubble--user"}`}
        >
          {!msg.content && isAssistant ? (
            <TypingDots />
          ) : isAssistant ? (
            <Markdown>{msg.content}</Markdown>
          ) : (
            <div className="whitespace-pre-wrap">{msg.content}</div>
          )}

          {msg.interactive && (
            <div className="mt-3">
              <InteractiveMessage
                payload={msg.interactive}
                onSayItBackRecord={onSayItBackRecord}
              />
            </div>
          )}

          {isAssistant && msg.content && (
            <div className="msg-actions" aria-label="Message actions">
              <button
                className="msg-action"
                aria-label={copied ? "Copied" : "Copy reply"}
                onClick={copy}
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Copy
                  </>
                )}
              </button>
              <button
                className={`msg-action ${liked === "up" ? "msg-action--active" : ""}`}
                aria-label="Helpful"
                onClick={() => setLiked((v) => (v === "up" ? null : "up"))}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4.34-7.78A2 2 0 0 1 15 5.88Z"/></svg>
              </button>
              <button
                className={`msg-action ${liked === "down" ? "msg-action--active" : ""}`}
                aria-label="Not helpful"
                onClick={() => setLiked((v) => (v === "down" ? null : "down"))}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17v12l-4.34 7.78A2 2 0 0 1 9 18.12Z"/></svg>
              </button>
              <span className="msg-action-divider" aria-hidden />
              <SpeakButton text={msg.content} />
            </div>
          )}

          {!isAssistant && msg.fromVoice && (
            <div className="msg-voice-badge">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              voice · <TranscriptBadge meta={msg.transcriptMeta} />
            </div>
          )}
        </div>

        {showContext && (
          <div className="context-strip" aria-label="Session domain context">
            <span className="context-strip-label">Domain context</span>
            <span className="context-strip-pill">{contextSummary}</span>
          </div>
        )}

        {!isAssistant && onRegenerate && (
          <div className="msg-actions msg-actions--right" aria-label="Message actions">
            <button className="msg-action" aria-label="Re-send" onClick={onRegenerate}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><polyline points="3 21 3 16 8 16"/></svg>
              Re-send
            </button>
          </div>
        )}
      </div>
      {!isAssistant && <span className="msg-avatar msg-avatar--user" aria-hidden>U</span>}
    </div>
  );
}
