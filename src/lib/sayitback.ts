// Say-It-Back heatmap — turn Speechmatics word-level confidence into per-word status
// + overall score, and check which curriculum terms came through cleanly.
import type { SayItBackResult } from "./types";
import type { TranscriptWord as SmWord } from "./speechmatics";

export const GOOD = 0.9;
export const SHAKY = 0.6;

export function wordStatus(confidence: number): "good" | "shaky" | "missed" {
  if (confidence >= GOOD) return "good";
  if (confidence >= SHAKY) return "shaky";
  return "missed";
}

export function sayItBackScore(
  words: SmWord[],
  keyTerms: string[]
): SayItBackResult {
  const statuses = words.map((w) => ({ word: w.word, confidence: w.confidence, status: wordStatus(w.confidence) }));
  const goodCount = statuses.filter((s) => s.status === "good").length;
  const overall = words.length ? Math.round((goodCount / words.length) * 100) : 0;

  const spoken = words.map((w) => w.word.toLowerCase());
  const missedTerms = keyTerms.filter((term) => {
    const t = term.toLowerCase();
    // term counts as "said cleanly" if every word of it appears with good confidence
    const parts = t.split(/\s+/);
    return !parts.every((p) =>
      spoken.some((s) => s === p || (s.length > 3 && s.startsWith(p.slice(0, Math.max(4, p.length - 2)))))
    );
  });

  return { overall, words: statuses, missedTerms };
}