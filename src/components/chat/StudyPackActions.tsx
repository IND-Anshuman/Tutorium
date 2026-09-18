"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ICONS: Record<string, string> = {
  quiz: "✅",
  flashcards: "🃏",
  html_visual: "🖼️",
  say_it_back: "🎙",
  voice_quiz: "🎤",
  review_queue: "🔁",
  make_mnemonic: "🧠",
  debate_topic: "⚔️",
  teach_back: "📝",
  notes: "📋",
  reviewer: "🔍",
  summary: "📑",
  story: "📖",
};

export default function StudyPackActions({
  topic,
  topicId,
  actions,
}: {
  topic: string;
  topicId: string;
  actions: Array<{ label: string; materialType: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const go = async (materialType: string, label: string) => {
    setBusy(materialType);
    try {
      const msg =
        materialType === "quiz" ? "quiz me"
          : materialType === "voice_quiz" ? "voice quiz me"
          : materialType === "flashcards" ? "show my flashcards"
          : materialType === "html_visual" ? "make a visual"
          : materialType === "say_it_back" ? "I want to practice saying it back"
          : materialType === "review_queue" ? "show my review queue"
          : materialType === "make_mnemonic" ? "give me a mnemonic"
          : materialType === "debate_topic" ? "debate this topic"
          : label.toLowerCase();
      await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "demo-user", message: msg, topicId }),
      });
      router.push(`/?topic=${encodeURIComponent(topicId)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="widget-card widget-card--actions">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>📚</span>
        <div className="widget-title">
          <span className="widget-label">Study pack</span>
          <span className="widget-sub">tap any to drill deeper</span>
        </div>
        <span className="widget-counter">{actions.length}</span>
      </div>
      <div className="actions-grid">
        {actions.map((a) => {
          const icon = ICONS[a.materialType] || "📘";
          const isBusy = busy === a.materialType;
          return (
            <button
              key={a.materialType}
              onClick={() => go(a.materialType, a.label)}
              disabled={busy !== null}
              className={`action-tile ${isBusy ? "action-tile--busy" : ""}`}
              type="button"
            >
              <span className="action-tile-icon" aria-hidden>{icon}</span>
              <span className="action-tile-label">{isBusy ? "Loading…" : a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
