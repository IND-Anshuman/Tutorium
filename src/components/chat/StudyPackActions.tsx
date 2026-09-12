"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
          : materialType === "flashcards" ? "show my flashcards"
          : materialType === "html_visual" ? "make a visual"
          : materialType === "say_it_back" ? "I want to practice saying it back"
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
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.materialType}
          onClick={() => go(a.materialType, a.label)}
          disabled={busy !== null}
          className="btn btn-ghost"
        >
          {busy === a.materialType ? "…" : a.label}
        </button>
      ))}
    </div>
  );
}