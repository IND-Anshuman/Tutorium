// Reply builders shared by the agent route (kept out of route.ts so the route
// file only exports handlers, as Next.js requires).
import type { InteractivePayload, StudyPack } from "./types";

export function buildStudyPackActions(topic: string, topicId: string): InteractivePayload {
  return {
    type: "study_pack_actions",
    topic,
    topicId,
    actions: [
      { label: "Make quiz", materialType: "quiz" },
      { label: "Voice quiz", materialType: "voice_quiz" },
      { label: "Review queue", materialType: "review_queue" },
      { label: "Mnemonics", materialType: "make_mnemonic" },
      { label: "Debate it", materialType: "debate_topic" },
      { label: "Make flashcards", materialType: "flashcards" },
      { label: "Make a visual", materialType: "html_visual" },
      { label: "Practice saying it back", materialType: "say_it_back" },
    ],
  };
}

// Honest confirmation: the checklist reflects what actually generated. A section
// that failed its isolated LLM call is listed as missing with a retry hint,
// never silently claimed as created.
export function buildStudyPackConfirmation(topicTitle: string, pack: StudyPack): string {
  const rows: Array<[boolean, string]> = [
    [!!pack.clean_notes, "Clean Notes"],
    [!!pack.reviewer, "Reviewer"],
    [(pack.flashcards?.length ?? 0) > 0, "Flashcards"],
    [(pack.quiz?.length ?? 0) > 0, "Quiz"],
    [!!pack.summary, "Summary"],
    [!!pack.story, "Story"],
  ];
  const made = rows.filter(([ok]) => ok).map(([, label]) => `✓ ${label}`);
  const missed = rows.filter(([ok]) => !ok).map(([, label]) => `✗ ${label}`);

  if (!made.length) {
    return `I couldn't build a study pack for **${topicTitle}** this time — that's usually a temporary model hiccup. Ask me again in a moment and I'll rebuild it.`;
  }
  const lines = [`I organized this under **${topicTitle}** and created:`, made.join(" · ")];
  if (missed.length) {
    lines.push(`Some sections didn't come through: ${missed.join(" · ")} — say "make a study pack" again to retry the pack.`);
  }
  lines.push("", "Try it: say it back, take the quiz, or ask me anything about it.");
  return lines.join("\n");
}
