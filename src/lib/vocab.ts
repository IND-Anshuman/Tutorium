// Vocab Hot-Swap — pick curriculum terms from a passage and build the Speechmatics
// additional_vocab config (custom dictionary, up to 1000 terms/job, sounds_like support).
import type { AdditionalVocabItem } from "./speechmatics";

const STOP = new Set([
  "about", "above", "after", "again", "against", "because", "before", "below",
  "being", "between", "both", "during", "each", "further", "having", "into",
  "itself", "more", "most", "other", "over", "same", "should", "some", "such",
  "than", "that", "their", "them", "then", "there", "these", "they", "this",
  "through", "under", "until", "very", "what", "when", "where", "which",
  "while", "will", "with", "would", "your", "from", "have", "does", "explain",
  "about", "topic", "lesson", "please", "study", "learn", "teach",
]);

export interface VocabTerm {
  term: string;
  reason: string;
}

export function pickVocabTerms(text: string, maxTerms = 30): VocabTerm[] {
  const counts = new Map<string, number>();
  const words = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const w of words) {
    if (w.length < 6) continue; // short words rarely garble
    if (STOP.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }

  const scored = [...counts.entries()]
  // score: longer + repeated words matter more (curriculum jargon signal)
    .map(([term, count]) => ({ term, count, score: term.length + count * 2 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTerms);

  return scored.map((s) => ({ term: s.term, reason: `repeated ${s.count}×` }));
}

export function buildAdditionalVocab(terms: string[]): AdditionalVocabItem[] {
  return terms
    .map((t) => (t || "").trim())
    .filter((t) => t.length >= 2)
    .map((content) => ({ content }));
}

export function uniqueTermList(text: string, maxTerms = 12): string[] {
  return pickVocabTerms(text, maxTerms).map((v) => v.term);
}