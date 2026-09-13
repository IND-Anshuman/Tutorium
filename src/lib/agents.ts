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

// Thin wrapper so every agent call shares the same AbortSignal plumbing.
function llmJsonSig<T>(signal: AbortSignal | undefined, args: Parameters<typeof llmJson<T>>[0]) {
  return llmJson<T>({ ...args, signal });
}

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
intent ∈ {create_study_pack, teach_topic, make_flashcards, make_quiz, make_summary, make_story, make_visual, retrieve_material, say_it_back, unknown}.
Notes/messy dump -> create_study_pack. Material request -> make_*. "show me what I have" -> retrieve_material. Subject="General" if unclear. Topic: 2-5 words.`,
    user: `${history
      .slice(-3) // intent rarely needs 6 turns; keep context tight
      .map((m) => `${m.role}: ${m.content.slice(0, 120)}`)
      .join("\n")}${history.length ? "\n\n" : ""}Student message: """${message.slice(0, 1200)}"""`,
    maxTokens: 250,
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
    user: `Topic: ${args.topic} (${args.subject})\nSource:\n"""${args.sourceText.slice(0, 4000)}"""`,
    maxTokens: 320,
    temperature: 0.2,
  });
  return { brief: data.brief || "", keyTerms: (data.key_terms || []).map(String).slice(0, 8) };
}

// ---------- study pack (SPLIT, olig. #4) ----------
// Each sub-call is small and isolated; orchestrate saves them incrementally so a
// partial pack survives. All consume the compact brief, not raw notes.

async function packCore(args: { topic: string; subject: string; brief: string; sessionCtx?: SessionContext | null; signal?: AbortSignal }): Promise<{ clean_notes: string; reviewer: string; summary: string }> {
  const { data } = await llmJsonSig<{ clean_notes: string; reviewer: string; summary: string }>(args.signal, {
    system: domainContextPrefix(args.sessionCtx) + `Write a study pack core for the topic. Return JSON {"clean_notes": markdown, "reviewer": concise bullet recap, "summary": 3-4 sentences}.
Accurate, grade-appropriate, no filler.`,
    user: `Topic: ${args.topic} (${args.subject})\nBrief:\n"""${args.brief}"""`,
    maxTokens: 1100,
  });
  return { clean_notes: data.clean_notes || "", reviewer: data.reviewer || "", summary: data.summary || "" };
}

async function packAssess(args: { topic: string; brief: string; sessionCtx?: SessionContext | null; signal?: AbortSignal }): Promise<{ flashcards: Flashcard[]; quiz: QuizItem[] }> {
  const { data } = await llmJsonSig<{ flashcards: Flashcard[]; quiz: QuizItem[] }>(args.signal, {
    system: domainContextPrefix(args.sessionCtx) + `Build assessment tools for the topic. Return JSON {"flashcards":[{"front","back"}] (6), "quiz":[{"question","choices":[4],"answer":"0".."3" (index of correct), "explanation"}] (4)}.
answer MUST be the index string of the correct choice.`,
    user: `Topic: ${args.topic}\nBrief:\n"""${args.brief}"""`,
    maxTokens: 900,
  });
  return {
    flashcards: (data.flashcards || []).map((f) => ({ front: f.front, back: f.back })),
    quiz: (data.quiz || []).map((q) => ({
      question: q.question,
      choices: Array.isArray(q.choices) ? q.choices.map(String) : [],
      answer: String(q.answer),
      explanation: q.explanation || "",
    })),
  };
}

async function packStory(args: { topic: string; brief: string; sessionCtx?: SessionContext | null; signal?: AbortSignal }): Promise<string> {
  const { data } = await llmJsonSig<{ story: string }>(args.signal, {
    system: domainContextPrefix(args.sessionCtx) + `Write a short memorable story/analogy teaching the topic's core idea. Return JSON {"story": 6-10 sentences}. Plain text, no markdown.`,
    user: `Topic: ${args.topic}\nBrief:\n"""${args.brief}"""`,
    maxTokens: 400,
  });
  return data.story || "";
}

export async function createStudyPack(args: {
  topic: string;
  subject: string;
  brief: string;
  sessionCtx?: SessionContext | null;
  signal?: AbortSignal;
}): Promise<StudyPack> {
  // Resilient: each section is best-effort, so a single flaky call can't wipe the pack.
  // (Promise.allSettled would still require touching every branch; explicit catches
  //  keep the successful sections going when one fails.)
  const [core, assess, story] = await Promise.all([
    packCore({ topic: args.topic, subject: args.subject, brief: args.brief, sessionCtx: args.sessionCtx, signal: args.signal }).catch((e) => {
      console.warn("packCore failed:", (e as Error).message);
      return { clean_notes: "", reviewer: "", summary: "" };
    }),
    packAssess({ topic: args.topic, brief: args.brief, sessionCtx: args.sessionCtx, signal: args.signal }).catch((e) => {
      console.warn("packAssess failed:", (e as Error).message);
      return { flashcards: [], quiz: [] };
    }),
    packStory({ topic: args.topic, brief: args.brief, sessionCtx: args.sessionCtx, signal: args.signal }).catch((e) => {
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
export async function createFlashcardsOnly(args: { topic: string; brief: string; sessionCtx?: SessionContext | null; signal?: AbortSignal }): Promise<Flashcard[]> {
  const { flashcards } = await packAssess({ topic: args.topic, brief: args.brief, sessionCtx: args.sessionCtx, signal: args.signal });
  return flashcards;
}

export async function createQuizOnly(args: { topic: string; brief: string; sessionCtx?: SessionContext | null; signal?: AbortSignal }): Promise<QuizItem[]> {
  const { quiz } = await packAssess({ topic: args.topic, brief: args.brief, sessionCtx: args.sessionCtx, signal: args.signal });
  return quiz;
}

// ---------- teaching ----------
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
  const { data } = await llmJsonSig<{ reply: string; key_terms: string[] }>(args.signal, {
    system: domainContextPrefix(args.sessionCtx) + `You are Tutorium, a warm voice-first tutor. The student is listening, not reading: core idea first, short spoken paragraphs, one analogy, invite a follow-up. Address weaknesses if given.
Return JSON {"reply": markdown ~150-220 words, "key_terms": [4-8 terms you used]}.`,
    user: `Topic: ${args.topic} (${args.subject})
Learning style: ${args.profile?.learning_style || "unknown"}; weaknesses: ${(args.profile?.weaknesses || []).join(", ") || "none"}; strengths: ${(args.profile?.strengths || []).join(", ") || "none"}
${args.brief ? `Context:\n"""${args.brief}"""\n` : ""}
Recent conversation:
${args.history.slice(-3).map((m) => `${m.role}: ${m.content.slice(0, 140)}`).join("\n") || "(none)"}

Student: """${args.question.slice(0, 1200)}"""`,
    maxTokens: 900,
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
    maxTokens: 300,
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
    maxTokens: 1200,
    temperature: 0.2,
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
    maxTokens: 500,
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
  if (/\b(quiz( me)?|test me|question me|take the quiz)\b/.test(m)) return "make_quiz";
  if (/\b(flashcards?|flash cards|cards)\b/.test(m) && /\b(make|show|see|create|build|give|review|practice)\b/.test(m)) return "make_flashcards";
  if (/\b(summar(ize|y)|recap|overview|main points|key points)\b/.test(m)) return "make_summary";
  if (/\b(story|analogy|tell me a story|as a story)\b/.test(m)) return "make_story";
  if (/\b(visual|diagram|picture|chart|infographic|draw|illustrate)\b/.test(m)) return "make_visual";
  if (/\b(show|see|view|open|retrieve|pull up|bring up).*(what i have|my stuff|my materials|my stuff|study pack|everything)\b/.test(m)) return "retrieve_material";
  if (/\b(say.?it.?back|read.*aloud|pronounc|practice saying|pronunciation|read back)\b/.test(m)) return "say_it_back";
  if (/\b(make|create|build).*(study pack|notes|pack|reviewer)\b/.test(m)) return "create_study_pack";
  return null;
}

// Guardrails so flaky model output can't interrupt normal use. Forces teach_topic
// for clear questions unless the message is an explicit material request.
const QUESTION_RE =
  /\b(what|whats|what's|how|why|when|where|who|which|can you|could you|explain|define|describe|tell me|difference between|mean|meaning of|is it|does this|how does|how do|what does|what is)\b/i;
const MATERIAL_INTENTS = new Set<Intent>([
  "create_study_pack", "make_flashcards", "make_quiz", "make_summary", "make_story", "make_visual", "retrieve_material",
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