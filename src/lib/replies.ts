// Reply builders shared by the agent route (kept out of route.ts so the route
// file only exports handlers, as Next.js requires).
import type { InteractivePayload } from "./types";

export function buildStudyPackActions(topic: string, topicId: string): InteractivePayload {
  return {
    type: "study_pack_actions",
    topic,
    topicId,
    actions: [
      { label: "Make quiz", materialType: "quiz" },
      { label: "Make flashcards", materialType: "flashcards" },
      { label: "Make a visual", materialType: "html_visual" },
      { label: "Practice saying it back", materialType: "say_it_back" },
    ],
  };
}

export function buildStudyPackConfirmation(topicTitle: string, _topicId: string): string {
  return [
    `I organized this under **${topicTitle}** and created:`,
    "✓ Clean Notes · ✓ Reviewer · ✓ Flashcards · ✓ Quiz · ✓ Summary · ✓ Story",
    "",
    "Try it: say it back, take the quiz, or ask me anything about it.",
  ].join("\n");
}