// Agent pipeline — the PADAYON orchestrator pattern, tightened for a voice-first tutor.
// All LLM access goes through llm.ts; all persistence through db.ts.
//
// Token-efficiency design:
//  - ONE scene brief per topic: a compact ~120-word summary generated once, then
//    reused by teach/visual/quiz instead of re-sending raw notes every call (olig. #2).
//  - Study-pack generation is SPLIT into isolated small calls (notes/review, cards/quiz,
//    story) so a failure in one never kills the pack and output stays lean (#4).
//  - Compact system prompts, resent on every call so they're a fixed tax (#5).

import { llmJson } from "./llm";
import type { Classification, StudyPack, Flashcard, QuizItem, MemoryUpdate, ChatMessage, Intent } from "./types";
import type { SessionContext } from "./db";
import { parseQuizCount, planQuizBands, dedupeByStem } from "./quizgen";
import type { QuizRequest, DetailLevel } from "./quizgen";
import { resolveNewIntentFromText } from "./enrich";

// Thin wrapper so every agent call shares the same AbortSignal plumbing.
function llmJsonSig<T>(signal: AbortSignal | undefined, args: Parameters<typeof llmJson<T>>[0]) {
  return llmJson<T>({ ...args, signal });
}

// ---------- source excerpt (two-channel grounding) ----------
// The brief is the dense spine; the excerpt is verbatim raw source. Pack agents
// get BOTH: the brief for shape, the excerpt for specifics (names, numbers,
// steps, definitions) the brief compressed away. Head+tail kept when capping —
// conclusions and definitions tend to live at the edges of real notes.
export function buildSourceExcerpt(raw: string, cap = 4000): string {
  const s = (raw || "").trim();
  if (!s) return "";
  if (s.length <= cap) return s;
  const head = s.slice(0, Math.floor(cap * 0.65));
  const tail = s.slice(-Math.floor(cap * 0.3));
  return `${head}\n…\n${tail}`;
}

// Output budget + prompt intensity per detail level. "light" matches the old
// behaviour (small pastes don't need more); "deep" costs ~2.3x but only fires
// when the source is large or the student explicitly asked for depth.
const DETAIL_TOKENS: Record<DetailLevel, number> = { light: 2000, standard: 3200, deep: 4600 };
const DETAIL_NOTES_LINE: Record<DetailLevel, string> = {
  light: "Keep notes compact: the essential spine only.",
  standard:
    "Write thorough notes: every major concept explained with its mechanism, a concrete example, and why it matters.",
  deep:
    "Write exhaustive notes: cover every concept in the source; for each, give the mechanism, a worked example, the common misconception, and how it connects to adjacent ideas. Prefer completeness over brevity.",
};
const DETAIL_ASSESS_LINE: Record<DetailLevel, string> = {
  light: "Explanations: 1 sentence.",
  standard:
    "Explanations must teach: 2-3 sentences — what is correct and why, plus why the tempting wrong answer is wrong. Flashcard backs must be full explanatory answers: 2-4 sentences with the mechanism or reasoning, never a bare term.",
  deep:
    "Explanations must teach deeply: 3-4 sentences — the correct mechanism step by step, a concrete example, and exactly why each tempting wrong answer fails. Flashcard backs must be mini-lessons: 3-5 sentences with mechanism, example, and one memorable anchor.",
};

// Compact prefix injected into every agent's system prompt. Prevents the model
// from re-deriving what's already established in the session (level, key terms,
// weak areas), and gives a small but visible signal of continuity.
export function domainContextPrefix(ctx: SessionContext | null | undefined): string {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.summary) lines.push(`Current domain focus: ${ctx.summary}`);
  if (ctx.level && ctx.level !== "unknown") lines.push(`Learner level: ${ctx.level}`);
  if (ctx.key_terms?.length) lines.push(`Known terms in this domain: ${ctx.key_terms.slice(-12).join(", ")}`);
  if (ctx.weak_areas?.length) lines.push(`Learner struggles: ${ctx.weak_areas.slice(-6).join("; ")}`);
  if (ctx.short_notes?.length) lines.push(`Recent notes: ${ctx.short_notes.slice(-5).join(" | ")}`);
  return lines.length ? lines.join("\n") + "\n\n" : "";
}

// ---------- classifier ----------
export async function classifyMessage(
  message: string,
  history: ChatMessage[],
  signal?: AbortSignal,
  sessionCtx?: SessionContext | null
): Promise<Classification> {
  const { data } = await llmJsonSig<Classification>(signal, {
    system: domainContextPrefix(sessionCtx) + `Classify the student message. Return JSON {"subject","subcategory","topic","intent","confidence"}.
intent ∈ {create_study_pack, teach_topic, make_flashcards, make_quiz, make_summary, make_story, make_visual, retrieve_material, say_it_back, review_queue, debate_topic, make_mnemonic, unknown}.
Notes/messy dump -> create_study_pack. Material request -> make_*. "show me what I have" -> retrieve_material. "what should I redo/review" -> review_queue. "debate X" -> debate_topic. "mnemonic" -> make_mnemonic. Subject="General" if unclear. Topic: 2-5 words.`,
    user: `${history
      .slice(-3) // intent rarely needs 6 turns; keep context tight
      .map((m) => `${m.role}: ${m.content.slice(0, 120)}`)
      .join("\n")}${history.length ? "\n\n" : ""}Student message: """${message.slice(0, 1200)}"""`,
    maxTokens: 700,
  });
  return {
    subject: data.subject || "General",
    subcategory: data.subcategory || "General",
    topic: data.topic || "General",
    intent: (data.intent || "unknown") as Classification["intent"],
    confidence: typeof data.confidence === "number" ? data.confidence : 0.7,
  };
}

// ---------- scene brief (olig. #2) ----------
// Compact once-per-topic context; every later agent reads this instead of raw notes.
export async function generateSceneBrief(args: {
  topic: string;
  subject: string;
  sourceText: string;
  sessionCtx?: SessionContext | null;
  signal?: AbortSignal;
}): Promise<{ brief: string; keyTerms: string[] }> {
  const { data } = await llmJsonSig<{ brief: string; key_terms: string[] }>(args.signal, {
    system: domainContextPrefix(args.sessionCtx) + `Summarize the source into a tight study-passage for a tutor.
Return JSON: {"brief": <=120 words covering only the core concepts a tutor needs, "key_terms": [4-8 domain terms]}. No markdown.`,
    user: `Topic: ${args.topic} (${args.subject})\nSource:\n"""${args.sourceText}"""`,
    temperature: 0.2,
    maxTokens: 900,
  });
  return { brief: data.brief || "", keyTerms: (data.key_terms || []).map(String).slice(0, 8) };
}

// ---------- study pack (SPLIT, olig. #4) ----------
// Each sub-call is small and isolated; orchestrate saves them incrementally so a
// partial pack survives. All consume the compact brief, not raw notes.

async function packCore(args: {
  topic: string; subject: string; brief: string;
  sourceExcerpt?: string; detail?: DetailLevel;
  sessionCtx?: SessionContext | null; signal?: AbortSignal;
}): Promise<{ clean_notes: string; reviewer: string; summary: string }> {
  const detail = args.detail ?? "standard";
  const sourceBlock = args.sourceExcerpt
      ? `\nSOURCE EXCERPT (authoritative — from the student's actual material; mine it for specifics the brief may have compressed, never invent facts that contradict it):\n"""${args.sourceExcerpt}"""`
      : "";
    const { data } = await llmJsonSig<{ clean_notes: string; reviewer: string; summary: string }>(args.signal, {
    system: domainContextPrefix(args.sessionCtx) + `Write a study pack core for the topic. Return JSON {"clean_notes": markdown, "reviewer": thorough bullet recap, "summary": 5-8 sentences}.
${DETAIL_NOTES_LINE[detail]}
Accurate, grade-appropriate, no filler.`,
    user: `Topic: ${args.topic} (${args.subject})\nBrief:\n"""${args.brief}"""${sourceBlock}`,
        maxTokens: DETAIL_TOKENS[detail],
      });
      return { clean_notes: data.clean_notes || "", reviewer: data.reviewer || "", summary: data.summary || "" };
    }

async function assessBand(args: {
  topic: string; brief: string; quizCount: number; cardCount: number; difficulty: string;
  priorStems: string[]; sourceExcerpt?: string; detail?: DetailLevel;
  sessionCtx?: SessionContext | null; signal?: AbortSignal;
}): Promise<{ flashcards: Flashcard[]; quiz: QuizItem[] }> {
  const detail = args.detail ?? "standard";
  const difficultyLine =
    args.difficulty === "hard" ? "Make questions genuinely hard: require application, not recall."
    : args.difficulty === "easy" ? "Keep questions foundational and confidence-building."
    : args.difficulty === "mixed" ? "Vary difficulty: a third easy, a third medium, a third genuinely tricky."
    : "Aim for medium difficulty overall.";
  const prior = args.priorStems.length
    ? `\nDo NOT repeat or reword these existing questions:\n${args.priorStems.slice(-24).map((s) => `- ${s}`).join("\n")}`
    : "";
  const sourceBlock = args.sourceExcerpt
    ? `\nSOURCE EXCERPT (authoritative — mine it for specifics the brief compressed; every question and card must be answerable from it):\n"""${args.sourceExcerpt}"""`
    : "";
  const { data } = await llmJsonSig<{ flashcards: Flashcard[]; quiz: QuizItem[] }>(args.signal, {
    system: domainContextPrefix(args.sessionCtx) + `Build assessment tools for the topic. Return JSON {"flashcards":[{"front","back"}] (${args.cardCount}), "quiz":[{"question","choices":[4],"answer":"0".."3" (index of correct), "explanation", "trap"}] (${args.quizCount})}.
answer MUST be the index string of the correct choice. Exactly ${args.quizCount} quiz items and ${args.cardCount} flashcards.
${DETAIL_ASSESS_LINE[detail]}
"trap" (1 sentence) names the common misconception that makes the WRONG choice tempting — shown only when the learner picks wrong. e.g. "Tempting — but that confuses the light reactions with the Calvin cycle."${prior}`,
    user: `Topic: ${args.topic}\nBrief:\n"""${args.brief}"""${sourceBlock}`,
    maxTokens: Math.min(9000, Math.round((450 + args.quizCount * 220 + args.cardCount * 130) * (detail === "light" ? 0.7 : detail === "deep" ? 1.5 : 1))),
  });
  return {
    flashcards: (data.flashcards || []).map((f) => ({ front: f.front, back: f.back })),
    quiz: (data.quiz || []).map((q) => ({
      question: q.question,
      choices: Array.isArray(q.choices) ? q.choices.map(String) : [],
      answer: String(q.answer),
      explanation: q.explanation || "",
      trap: q.trap || "",
    })),
  };
}

// Band-generate a large assessment: bands of 8 quiz items per call, each band
// told about prior stems to avoid repeats. Single call when counts are small.
export async function packAssess(args: {
  topic: string; brief: string; quiz?: QuizRequest; cardCount?: number;
  sourceExcerpt?: string; detail?: DetailLevel;
  sessionCtx?: SessionContext | null; signal?: AbortSignal;
}): Promise<{ flashcards: Flashcard[]; quiz: QuizItem[] }> {
  const quizCount = Math.max(4, Math.min(30, args.quiz?.count ?? 4));
  const cardCount = Math.max(4, Math.min(24, args.cardCount ?? 6));
  const bands = planQuizBands(quizCount);
  const allCards: Flashcard[] = [];
  const allQuiz: QuizItem[] = [];
  let stems: string[] = [];
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const cardsThisBand = i === 0 ? cardCount : Math.max(0, cardCount - allCards.length);
    const r = await assessBand({
      topic: args.topic, brief: args.brief, quizCount: band, cardCount: cardsThisBand,
      difficulty: args.quiz?.difficulty ?? "medium", priorStems: stems,
      sourceExcerpt: args.sourceExcerpt, detail: args.detail,
      sessionCtx: args.sessionCtx, signal: args.signal,
    });
    allCards.push(...r.flashcards);
    allQuiz.push(...r.quiz);
    stems = allQuiz.map((q) => q.question);
    if (allCards.length >= cardCount && allQuiz.length >= quizCount) break;
  }
  return { flashcards: dedupeByStem(allCards.map((c) => ({ ...c, question: c.front }))).map(({ front, back }) => ({ front, back })), quiz: dedupeByStem(allQuiz).slice(0, quizCount) };
}

async function packStory(args: {
  topic: string; brief: string; sourceExcerpt?: string; detail?: DetailLevel;
  sessionCtx?: SessionContext | null; signal?: AbortSignal;
}): Promise<string> {
  const detail = args.detail ?? "standard";
  const sourceBlock = args.sourceExcerpt
    ? `\nSOURCE EXCERPT (authoritative — ground the story's details in it):\n"""${args.sourceExcerpt}"""`
    : "";
  const { data } = await llmJsonSig<{ story: string }>(args.signal, {
    system: domainContextPrefix(args.sessionCtx) + `Write a short memorable story/analogy teaching the topic's core idea. Return JSON {"story": 8-14 sentences}. Plain text, no markdown. Extend the analogy at the end: map each story element back to the real concept it stands for.${detail === "deep" ? " Make it vivid and layered — the story should survive being retold from memory." : ""}`,
    user: `Topic: ${args.topic}\nBrief:\n"""${args.brief}"""${sourceBlock}`,
    maxTokens: detail === "light" ? 900 : 1400,
  });
  return data.story || "";
}

export async function createStudyPack(args: {
  topic: string;
  subject: string;
  brief: string;
  sourceExcerpt?: string;
  detail?: DetailLevel;
  sessionCtx?: SessionContext | null;
  signal?: AbortSignal;
}): Promise<StudyPack> {
  // Resilient: each section is best-effort, so a single flaky call can't wipe the pack.
  // (Promise.allSettled would still require touching every branch; explicit catches
  //  keep the successful sections going when one fails.)
  const [core, assess, story] = await Promise.all([
    packCore({ topic: args.topic, subject: args.subject, brief: args.brief, sourceExcerpt: args.sourceExcerpt, detail: args.detail, sessionCtx: args.sessionCtx, signal: args.signal }).catch((e) => {
      console.warn("packCore failed:", (e as Error).message);
      return { clean_notes: "", reviewer: "", summary: "" };
    }),
    packAssess({ topic: args.topic, brief: args.brief, sourceExcerpt: args.sourceExcerpt, detail: args.detail, sessionCtx: args.sessionCtx, signal: args.signal }).catch((e) => {
      console.warn("packAssess failed:", (e as Error).message);
      return { flashcards: [], quiz: [] };
    }),
    packStory({ topic: args.topic, brief: args.brief, sourceExcerpt: args.sourceExcerpt, detail: args.detail, sessionCtx: args.sessionCtx, signal: args.signal }).catch((e) => {
      console.warn("packStory failed:", (e as Error).message);
      return "";
    }),
  ]);
  return {
    clean_notes: core.clean_notes,
    reviewer: core.reviewer,
    summary: core.summary,
    flashcards: assess.flashcards,
    quiz: assess.quiz,
    story,
  };
}

// For on-demand requests (just flashcards / just quiz) when no pack exists yet.
export async function createFlashcardsOnly(args: { topic: string; brief: string; cardCount?: number; sessionCtx?: SessionContext | null; signal?: AbortSignal }): Promise<Flashcard[]> {
  const { flashcards } = await packAssess({ topic: args.topic, brief: args.brief, cardCount: args.cardCount ?? 6, sessionCtx: args.sessionCtx, signal: args.signal });
  return flashcards;
}

export async function createQuizOnly(args: { topic: string; brief: string; quiz?: QuizRequest; sessionCtx?: SessionContext | null; signal?: AbortSignal }): Promise<QuizItem[]> {
  const { quiz } = await packAssess({ topic: args.topic, brief: args.brief, quiz: args.quiz ?? { count: 4, difficulty: "medium" }, sessionCtx: args.sessionCtx, signal: args.signal });
  return quiz;
}

// ---------- teaching ----------
// Level dial: "explain it simpler / like I'm five / expert mode" re-teaches at
// an explicit level instead of the profile default.
export function parseLevelOverride(message: string): "beginner" | "advanced" | null {
  const m = (message || "").toLowerCase();
  if (/\b(explain it (like|as if)[^,.;]*?(five|5)|super simple|dumb it down|simpler|simpler terms|beginner|high school|middle school|easier)\b/.test(m)) return "beginner";
  if (/\b(expert|advanced|technical|deep dive|rigorous|graduate|go deeper)\b/.test(m)) return "advanced";
  return null;
}
export async function teachTopic(args: {
  topic: string;
  subject: string;
  question: string;
  history: ChatMessage[];
  profile?: { learning_style: string; weaknesses: string[]; strengths: string[] } | null;
  brief?: string;
  sessionCtx?: SessionContext | null;
  signal?: AbortSignal;
}): Promise<{ reply: string; keyTerms: string[] }> {
  const levelOverride = parseLevelOverride(args.question);
  const levelLine = levelOverride === "beginner"
    ? "\nThe student asked for SIMPLE: no jargon without instantly defining it, everyday analogies, shorter sentences."
    : levelOverride === "advanced"
      ? "\nThe student asked for DEPTH: precise terminology, mechanism-level detail, don't dumb anything down."
      : "";
  const { data } = await llmJsonSig<{ reply: string; key_terms: string[] }>(args.signal, {
    system: domainContextPrefix(args.sessionCtx) + `You are Tutorium, a warm voice-first tutor. The student is listening, not reading: core idea first, short spoken paragraphs, one analogy, invite a follow-up. Address weaknesses if given.${levelLine}
Return JSON {"reply": markdown ~150-220 words, "key_terms": [4-8 terms you used]}.`,
    user: `Topic: ${args.topic} (${args.subject})
Learning style: ${args.profile?.learning_style || "unknown"}; weaknesses: ${(args.profile?.weaknesses || []).join(", ") || "none"}; strengths: ${(args.profile?.strengths || []).join(", ") || "none"}
${args.brief ? `Context:\n"""${args.brief}"""\n` : ""}
Recent conversation:
${args.history.slice(-3).map((m) => `${m.role}: ${m.content.slice(0, 140)}`).join("\n") || "(none)"}

Student: """${args.question.slice(0, 1200)}"""`,
    maxTokens: 1600,
  });
  return { reply: data.reply || "", keyTerms: (data.key_terms || []).map(String).slice(0, 8) };
}

// ---------- memory ----------
export async function updateMemory(args: {
  message: string;
  reply: string;
  profile: { learning_style: string; strengths: string[]; weaknesses: string[] };
  signal?: AbortSignal;
}): Promise<MemoryUpdate> {
  const { data } = await llmJsonSig<MemoryUpdate>(args.signal, {
    system: `From one exchange, update a learner profile. Return JSON {"learning_style_update":"", "strength_update":"", "weakness_update":"", "next_recommended_action":"", "student_note":""}.
Empty string = no change. Only fill fields with a real signal.`,
    user: `Profile: style=${args.profile.learning_style}; strengths=${args.profile.strengths.join(", ") || "none"}; weaknesses=${args.profile.weaknesses.join(", ") || "none"}
Student: """${args.message.slice(0, 500)}"""
Tutor: """${args.reply.slice(0, 500)}"""`,
    maxTokens: 600,
  });
  return {
    learning_style_update: data.learning_style_update || "",
    weakness_update: data.weakness_update || "",
    strength_update: data.strength_update || "",
    next_recommended_action: data.next_recommended_action || "",
    student_note: data.student_note || "",
  };
}

// ---------- apply memory ----------
export function applyMemoryUpdate(
  profile: { learning_style: string; strengths: string[]; weaknesses: string[] },
  update: MemoryUpdate
): { learning_style: string; strengths: string[]; weaknesses: string[]; next_recommended_action: string } {
  const add = (list: string[], raw: string) => {
    const items = raw
      .split(/[,;\n]/)
      .map((s) => s.replace(/^[-•*\d.\s]+/, "").trim())
      .filter((s) => s && s.length > 2 && !/^none$/i.test(s));
    return [...new Set([...list, ...items])].slice(0, 12);
  };
  return {
    learning_style: update.learning_style_update && update.learning_style_update !== "" ? update.learning_style_update : profile.learning_style,
    strengths: add(profile.strengths, update.strength_update),
    weaknesses: add(profile.weaknesses, update.weakness_update),
    next_recommended_action: update.next_recommended_action || "",
  };
}

// ---------- visual ----------
export async function generateVisual(args: {
  topic: string;
  subject: string;
  brief: string;
  sessionCtx?: SessionContext | null;
  signal?: AbortSignal;
}): Promise<{ html: string; title: string }> {
  const { data } = await llmJsonSig<{ title: string; html: string }>(args.signal, {
    system: domainContextPrefix(args.sessionCtx) + `Design a self-contained HTML visual for a lesson. Only: h1/h2, p, ul/li, table, one <style>, optional inline <svg>. NO scripts, NO <html>/<body>, NO iframes. <60 lines.
Return JSON {"title","html"}.`,
    user: `Topic: ${args.topic} (${args.subject})\nBrief:\n"""${args.brief}"""`,
    temperature: 0.2,
    maxTokens: 2400,
  });
  const html = (data.html || "").replace(/<script[\s\S]*?<\/script>/gi, "").slice(0, 8000);
  return { html, title: data.title || `${args.topic} — Visual Guide` };
}

// ---------- teach-back ----------
export async function gradeTeachBack(args: {
  topic: string;
  transcript: string;
  brief: string;
  sessionCtx?: SessionContext | null;
  signal?: AbortSignal;
}): Promise<{ verdict: string; missed: string[]; next_step: string }> {
  const { data } = await llmJsonSig<{ verdict: string; missed: string[]; next_step: string }>(args.signal, {
    system: domainContextPrefix(args.sessionCtx) + `A student explained the topic (Feynman). Grade against the brief. Return JSON {"verdict": 1-2 sentences, "missed": [2-4 short points], "next_step": one action}.`,
    user: `Topic: ${args.topic}\nGround truth:\n"""${args.brief}"""\n\nStudent:
"""${args.transcript.slice(0, 2500)}"""`,
    maxTokens: 900,
  });
  return {
    verdict: data.verdict || "",
    missed: (data.missed || []).map(String).slice(0, 4),
    next_step: data.next_step || "",
  };
}

// ---------- memory-worthy gate (olig. #1) ----------
// Only fire the memory LLM call when the exchange carries a durable signal.
const WORTHY_PATTERN =
  /\b(i am|i'm|im|i want|i like|i prefer|my goal|struggle|hard for me|don't understand|dont understand|not good at|weak in|learn better|best way|could you|please help|bad day|good day|i got|i scored|test tomorrow|exam|prefer)\b/i;

// ---------- deterministic intent fast-path ----------
// For obvious material requests the classifier LLM is overkill — these keywords
// map deterministically to an intent, so follow-ups resolve instantly with zero
// tokens and no dependence on model availability.
export function resolveIntentFromText(message: string): Intent | null {
  const m = (message || "").toLowerCase().trim();
  if (!m) return null;
  if (/\b(voice quiz|rapid.?fire|hands.?free quiz|speak.*quiz|quiz.*aloud)\b/.test(m)) return "voice_quiz";
  if (/\b(quiz( me)?|test me|question me|take the quiz)\b/.test(m)) return "make_quiz";
  if (/\b(flashcards?|flash cards|cards)\b/.test(m) && /\b(make|show|see|create|build|give|review|practice)\b/.test(m)) return "make_flashcards";
  if (/\b(summar(ize|y)|recap|overview|main points|key points)\b/.test(m)) return "make_summary";
  if (/\b(story|analogy|tell me a story|as a story)\b/.test(m)) return "make_story";
  if (/\b(visual|diagram|picture|chart|infographic|draw|illustrate)\b/.test(m)) return "make_visual";
  if (/\b(show|see|view|open|retrieve|pull up|bring up).*(what i have|my stuff|my materials|my stuff|study pack|everything)\b/.test(m)) return "retrieve_material";
  if (/\b(say.?it.?back|read.*aloud|pronounc|practice saying|pronunciation|read back)\b/.test(m)) return "say_it_back";
  if (/\b(make|create|build).*(study pack|notes|pack|reviewer)\b/.test(m)) return "create_study_pack";
  if (/\b(surprise me|spice it up|make it (harder|tricky|fun))\b/.test(m)) return "make_quiz";
  return resolveNewIntentFromText(message);
}

// Guardrails so flaky model output can't interrupt normal use. Forces teach_topic
// for clear questions unless the message is an explicit material request.
const QUESTION_RE =
  /\b(what|whats|what's|how|why|when|where|who|which|can you|could you|explain|define|describe|tell me|difference between|mean|meaning of|is it|does this|how does|how do|what does|what is)\b/i;
const MATERIAL_INTENTS = new Set<Intent>([
  "create_study_pack", "make_flashcards", "make_quiz", "make_summary", "make_story", "make_visual", "retrieve_material",
  "review_queue", "debate_topic", "make_mnemonic", "voice_quiz",
]);

export function isTeachQuestion(message: string, intent: Intent): boolean {
  const m = (message || "").trim();
  if (!m) return false;
  if (MATERIAL_INTENTS.has(intent)) return false; // explicit request wins
  return QUESTION_RE.test(m.slice(0, 120));
}

export function isMemoryWorthy(message: string, reply: string): boolean {
  const msg = (message || "").slice(0, 400).toLowerCase();
  const rep = (reply || "").slice(0, 400).toLowerCase();
  // a correction / wrong-answer signal that matters
  if (/\b(no,? that's wrong|actually|wait,? that|wrong answer|i thought|but you said|hmm not)\b/i.test(msg)) return true;
  // a stated preference, goal, or self-assessment
  if (WORTHY_PATTERN.test(msg)) return true;
  // tutor inferred a weak area worth recording
  if (/\byou seem|you've been struggling|let's work on|try this\b/i.test(rep)) return true;
  return false;
}