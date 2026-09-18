// Voice-quiz answer matching: fuzzy-match a spoken transcript against the four
// choice texts (pure functions, unit-tested). Shared by the voice-quiz widget
// and the /api/stt voice_quiz mode.

// Normalize: lowercase, strip punctuation, expand digits to words (TTS reads
// "2" as "two"), collapse whitespace.
const DIGITS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
  "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
};

export function normalizeSpeech(text: string): string {
  let t = (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  t = t.replace(/\b\d\b/g, (d) => DIGITS[d] || d);
  return t.replace(/\s+/g, " ").trim();
}

// Letter answers: "A", "option B", "the second one", "C I think" → index.
export function matchLetterChoice(transcript: string, choiceCount: number): number | null {
  const t = normalizeSpeech(transcript);
  const words = t.split(" ");
  const numberWords = ["zero", "one", "two", "three", "four", "five"];
  const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth"];
  // single letters A/B/C/D (spoken or typed)
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length === 1 && w >= "a" && w <= "z") {
      const idx = w.charCodeAt(0) - 97;
      if (idx < choiceCount) return idx;
    }
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const nIdx = numberWords.indexOf(w);
    if (nIdx > 0 && nIdx < choiceCount && (w === "one" || true)) {
      // "option two", "choice three", "number two", or bare "two"
      return nIdx;
    }
    const oIdx = ordinals.indexOf(w);
    if (oIdx >= 0 && oIdx < choiceCount) return oIdx;
  }
  return null;
}

// Token-overlap similarity between the spoken answer and each choice text.
export function similarity(a: string, b: string): number {
  const ta = new Set(normalizeSpeech(a).split(" ").filter((w) => w.length > 2));
  const tb = new Set(normalizeSpeech(b).split(" ").filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

export interface VoiceMatchResult {
  index: number | null;
  confidence: number;
  method: "letter" | "content" | "none";
}

// Decide which choice the learner said. Letter answers win when present
// ("B", "option two"); otherwise best content overlap must clear 0.4.
export function matchVoiceAnswer(
  transcript: string,
  choices: string[],
  opts: { letterBias?: boolean } = {}
): VoiceMatchResult {
  if (!choices?.length) return { index: null, confidence: 0, method: "none" };
  const letter = matchLetterChoice(transcript, choices.length);
  if (letter !== null && opts.letterBias !== false) {
    return { index: letter, confidence: 1, method: "letter" };
  }
  let best = -1;
  let bestScore = 0;
  choices.forEach((c, i) => {
    const s = similarity(transcript, c);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  if (best >= 0 && bestScore >= 0.4) {
    return { index: best, confidence: bestScore, method: "content" };
  }
  return { index: null, confidence: bestScore, method: "none" };
}