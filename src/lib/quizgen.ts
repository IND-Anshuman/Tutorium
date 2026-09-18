// Count-aware generation helpers shared by quiz/flashcard creation.
// Pure functions only — every branch is unit-tested; the LLM plumbing in
// agents.ts consumes these.

export interface QuizRequest {
  count: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
}

const QUIZ_COUNT_RE = /(\d{1,3})\s*(?:questions?|qs?\b)/i;
const FLASHCARD_COUNT_RE = /(\d{1,3})\s*(?:flash\s?cards?|cards?\b)/i;

// Parse "quiz me with 25 questions", "hard quiz", "make 20 flashcards" etc.
// Clamps: quiz 4..30, flashcards 4..24. Defaults: 10 / medium / 6.
export function parseQuizCount(message: string): QuizRequest {
  const m = (message || "").toLowerCase();
  const countMatch = m.match(QUIZ_COUNT_RE);
  const cardMatch = m.match(FLASHCARD_COUNT_RE);
  const raw = cardMatch ? Number(cardMatch[1]) : countMatch ? Number(countMatch[1]) : null;
  const isCards = !!cardMatch && !countMatch;
  const max = isCards ? 24 : 30;
  const count = raw == null ? (isCards ? 6 : 10) : Math.max(4, Math.min(max, raw));
  const difficulty = /\bhard\b|difficult|challenging/.test(m)
    ? "hard"
    : /\beasy\b|simple|beginner/.test(m)
      ? "easy"
      : /\bmixed\b|surprise/.test(m)
        ? "mixed"
        : "medium";
  return { count, difficulty };
}

// Split N into bands of at most 8 (band >8 starves output budgets and invites
// repetition). 4 -> [4]; 12 -> [12]; 20 -> [8,8,4]; 30 -> [8,8,8,6].
export function planQuizBands(count: number): number[] {
  if (count <= 12) return [count];
  const bands: number[] = [];
  let left = count;
  while (left > 0) {
    bands.push(Math.min(8, left));
    left -= 8;
  }
  return bands;
}

// Drop duplicate question stems (case-insensitive, trimmed) keeping first occurrence.
export function dedupeByStem<T extends { question: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = (it.question || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// Fisher-Yates that remaps the answer index. Property: shuffled[remapped] === original answer text.
export function shuffleWithRemap(choices: string[], answerIdx: number): { shuffled: string[]; correctIndex: number } {
  const pairs = choices.map((c, i) => ({ c, correct: i === answerIdx }));
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return {
    shuffled: pairs.map((p) => p.c),
    correctIndex: pairs.findIndex((p) => p.correct),
  };
}

// 50:50-style hints: dim `n` WRONG choices, never the correct one.
export function pickHints(choices: string[], answerIdx: number, n: number): number[] {
  const wrong = choices.map((_, i) => i).filter((i) => i !== answerIdx);
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  return wrong.slice(0, Math.max(0, Math.min(n, wrong.length)));
}