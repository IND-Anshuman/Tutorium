// The Trickster — designs HOW a quiz/flashcard session feels: shuffle, veils,
// timers, hints, streaks, easter eggs. Output is a DATA patch (never code),
// validated by trickster-schema.ts before it reaches any widget.
import { llmJson } from "./llm";
import { validateThemePatch } from "./trickster-schema";
import type { TricksterTheme } from "./types";

const DEFAULT_THEME: TricksterTheme = {
  vibe: "",
  accent: "",
  bg: "",
  radius: 16,
  fontScale: 1,
  icon: "✅",
  shuffleChoices: false,
  hideCorrectUntilPick: false,
  timePerQuestion: 0,
  hintsEnabled: false,
  hintCount: 0,
  hiddenAnswerStyle: null,
  streakMode: false,
  easterEgg: null,
  message: "",
  confetti: false,
};

export { DEFAULT_THEME };

const SUBJECT_VIBES: Array<[RegExp, string]> = [
  [/histor|war|revolution|ancient/i, "archive-room candlelight, sepia clues"],
  [/physic|chem|astron|bio/i, "neon lab, electric blue"],
  [/math|calculus|algebra|geometr/i, "chalkboard dusk, sharp angles"],
  [/literat|poetry|novel|art/i, "midnight library, ink and gold"],
];

export async function designTricksterTheme(args: {
  topic: string;
  subject: string;
  difficulty?: string;
  quizCount?: number;
  kind?: "quiz" | "flashcards";
  sessionCtx?: { level?: string; weak_areas?: string[] } | null;
  signal?: AbortSignal;
}): Promise<TricksterTheme> {
  const vibeHint =
    SUBJECT_VIBES.find(([re]) => re.test(args.subject || args.topic))?.[1] ||
    "match the subject's mood";
  try {
    const { data } = await llmJson<Record<string, unknown>>({
      system: `You are the Trickster: a mischievous designer who makes practice IRRESISTIBLE. Design how this ${args.kind || "quiz"} LOOKS and FEELS.
Learner level: ${args.sessionCtx?.level || "unknown"}. Struggles: ${(args.sessionCtx?.weak_areas || []).join("; ") || "none"}. Questions: ${args.quizCount ?? 10}. Difficulty: ${args.difficulty || "medium"}.
Vibe guidance: ${vibeHint}.
You MAY: shuffle choices, hide the correct answer until picked, add a timer (10-45s), plant 1-2 fifty-fifty hints, enable streak mode with a hidden easter egg (a wry one-liner revealed at a 4+ streak), and veil flashcard answers.
Return JSON: {"vibe" (<=30 chars), "accent" (hex color), "bg" (css color), "radius" (6-22), "fontScale" (0.95-1.15), "icon" (one emoji), "shuffleChoices" (bool), "hideCorrectUntilPick" (bool), "timePerQuestion" (0 or 10-45), "hintsEnabled" (bool), "hintCount" (0-2), "hiddenAnswerStyle" ("veil"|"blur"|"scratch"|null, flashcards only), "streakMode" (bool), "easterEgg" (<=100 chars or null), "message" (<=120 chars result screen line), "confetti" (bool)}.
Be bold but FAIR: never make questions unreadable. No fences.`,
      user: `Subject: ${args.subject}\nTopic: ${args.topic}`,
      maxTokens: 600,
      temperature: 0.9,
      signal: args.signal,
    });
    return validateThemePatch(data) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME; // garnish, never a blocker
  }
}

// Deterministic fallback vibe when the LLM is down but the user still asked for fun.
export function fallbackTheme(kind: "quiz" | "flashcards"): TricksterTheme {
  return {
    ...DEFAULT_THEME,
    vibe: kind === "quiz" ? "classic duel" : "memory vault",
    icon: kind === "quiz" ? "⚔️" : "🃏",
    shuffleChoices: true,
    hintsEnabled: true,
    hintCount: 1,
    streakMode: true,
    confetti: true,
    accent: "var(--brand)",
    bg: "var(--card)",
  };
}