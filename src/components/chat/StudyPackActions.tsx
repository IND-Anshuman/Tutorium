"use client";

import { useRouter } from "next/navigation";

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
  const go = async (materialType: string) => {
    if (materialType === "say_it_back") {
      // say_it_back flows through the normal agent endpoint
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "demo-user", message: "I want to practice saying it back", topicId }),
      });
      const data = await res.json();
      router.refresh();
      if (data.topicId) window.location.href = "/";
    } else {
      const msg = materialType === "quiz" ? "quiz me" : materialType === "flashcards" ? "show flashcards" : "make a visual";
      void fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "demo-user", message: msg, topicId }),
      }).then(() => window.location.reload());
    }
  };
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.materialType}
          onClick={() => go(a.materialType)}
          className="rounded-full px-3 py-1 text-xs"
          style={{ background: "var(--panel)", border: "1px solid var(--accent)", color: "var(--accent)" }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}