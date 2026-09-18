// Tier-1/2 new agents: debate, mnemonic, review-queue pack. All LLM access
// through llmJson; deterministic fallbacks so a flaky model never bricks a flow.
import { llmJson } from "./llm";
import type { SessionContext } from "./db";

// ---------- Two-Tutor Debate ----------
export interface DebateRound {
  skeptic: string;
  enthusiast: string;
}

export async function generateDebate(args: {
  topic: string;
  subject: string;
  brief: string;
  sessionCtx?: SessionContext | null;
  signal?: AbortSignal;
}): Promise<{ rounds: DebateRound[]; verdict: string }> {
  const { data } = await llmJson<{ rounds: DebateRound[]; verdict: string }>({
    system: `Two tutors debate the topic with genuine energy. SKEPTIC attacks assumptions, probes edge cases, doubts the hype. ENTHUSIAST defends with concrete evidence and analogies. They must actually engage each other's points, not monologue.
Return JSON {"rounds": [{"skeptic": 2-3 sentences, "enthusiast": 2-3 sentences}] (3 rounds, escalating spice), "verdict": 1-2 sentences naming what each side got right}. No fences.`,
    user: `Topic: ${args.topic} (${args.subject})\nGrounding:\n"""${(args.brief || "").slice(0, 2500)}"""`,
    maxTokens: 1600,
    temperature: 0.7,
    signal: args.signal,
  });
  const rounds = (data.rounds || [])
    .filter((r) => r && (r.skeptic || r.enthusiast))
    .slice(0, 3)
    .map((r) => ({ skeptic: r.skeptic || "", enthusiast: r.enthusiast || "" }));
  return {
    rounds,
    verdict: data.verdict || "Both tutors scored points — the truth is in the tension.",
  };
}

// ---------- Mnemonic Forge ----------
export interface MnemonicItem {
  kind: "acronym" | "phrase" | "peg";
  body: string;
  covers: string[];
}

export async function generateMnemonic(args: {
  topic: string;
  subject: string;
  brief: string;
  sessionCtx?: SessionContext | null;
  signal?: AbortSignal;
}): Promise<MnemonicItem[]> {
  const { data } = await llmJson<{ items: MnemonicItem[] }>({
    system: `You forge memorable mnemonics. Given the topic's key terms, produce up to 3 DIFFERENT kinds: one first-letter ACRONYM (spell it out letter by letter), one vivid PHRASE/story-link chaining the terms in order, one PEG (number/rhyme or palace-style hook).
Return JSON {"items": [{"kind": "acronym"|"phrase"|"peg", "body": the mnemonic itself (bold the target letters/terms with **), "covers": [terms it covers]}]}. Make them funny or shocking — memorable beats dignified. No fences.`,
    user: `Topic: ${args.topic} (${args.subject})\nKey material:\n"""${(args.brief || "").slice(0, 1500)}"""`,
    maxTokens: 700,
    temperature: 0.85,
    signal: args.signal,
  });
  const kinds = new Set(["acronym", "phrase", "peg"]);
  return (data.items || [])
    .filter((m) => m && kinds.has(m.kind) && m.body)
    .slice(0, 3);
}

// ---------- Review-queue mini-pack ----------
export interface ReviewItem {
  kind: "term" | "weak_area" | "quiz";
  label: string;
  detail: string;
  drill: string;
}

// Deterministic assembly from persisted signals (no LLM needed — the data IS
// the personalization). Drill suggestion rotates by kind.
export function buildReviewItems(args: {
  missedTerms: string[];
  weakAreas: string[];
  lastScore: { score: number; total: number } | null;
  quizAttempts: number;
}): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const t of args.missedTerms.slice(0, 4)) {
    items.push({
      kind: "term",
      label: t,
      detail: `You didn't say this term cleanly in your last Say-It-Back drill.`,
      drill: "say_it_back",
    });
  }
  for (const w of args.weakAreas.slice(0, 3)) {
    items.push({
      kind: "weak_area",
      label: w,
      detail: `From your learner profile — worth a redo.`,
      drill: "flashcards",
    });
  }
  if (args.lastScore && args.quizAttempts > 0) {
    const pct = args.lastScore.total ? args.lastScore.score / args.lastScore.total : 0;
    if (pct < 0.8) {
      items.push({
        kind: "quiz",
        label: `Last quiz: ${args.lastScore.score}/${args.lastScore.total}`,
        detail: pct < 0.5 ? "That score needs a rematch — run a fresh quiz." : "Close. One more pass and it's locked in.",
        drill: "quiz",
      });
    }
  }
  return items;
}

// Fast-path matcher for the new intents (deterministic, zero tokens).
export function resolveNewIntentFromText(message: string): "review_queue" | "debate_topic" | "make_mnemonic" | null {
  const m = (message || "").toLowerCase().trim();
  if (!m) return null;
  if (/\b(review|redo|retry)\b.*\b(queue|missed|mistakes|forgot|weak)\b|\bwhat should i (redo|review|practice)\b|\breview queue\b/.test(m)) return "review_queue";
  if (/\b(debate|argue|two (tutors|sides|opinions)|pros and cons|skeptic)\b/.test(m)) return "debate_topic";
  if (/\b(mnemonic|memory (trick|hook|aid)|acronym|remember (it|the|them)|how to remember)\b/.test(m)) return "make_mnemonic";
  return null;
}