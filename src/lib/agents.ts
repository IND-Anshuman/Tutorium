// Agent pipeline — the PADAYON orchestrator pattern, tightened for a voice-first tutor.
// All LLM access goes through llm.ts; all persistence through db.ts.

import { llmJson } from "./llm";
import {
  Classification,
  StudyPack,
  Flashcard,
  QuizItem,
  MemoryUpdate,
  ChatMessage,
} from "./types";

// ---------- classifier ----------
export async function classifyMessage(message: string, history: ChatMessage[]): Promise<Classification> {
  const { data } = await llmJson<Classification>({
    system: `You classify student messages for a voice-first tutor.
Return JSON: {"subject": string, "subcategory": string, "topic": string, "intent": string, "confidence": number}
intent must be exactly one of:
- "create_study_pack": messy notes/dump pasted or spoken → organize into study materials
- "teach_topic": student wants an explanation
- "make_flashcards" / "make_quiz" / "make_summary" / "make_story" / "make_visual": material requests
- "retrieve_material": asking to see previously created material
- "say_it_back": student wants to read/explain aloud for pronunciation/fluency practice
- "unknown": anything else
Use "General" for subject when unclear. Keep topic short (2-5 words).`,
    user: `History (last 6 turns):\n${history
      .slice(-6)
      .map((m) => `${m.role}: ${m.content.slice(0, 160)}`)
      .join("\n") || "(none)"}\n\nStudent message: """${message.slice(0, 1200)}"""`,
    maxTokens: 400,
  });
  return {
    subject: data.subject || "General",
    subcategory: data.subcategory || "General",
    topic: data.topic || "General",
    intent: (data.intent || "unknown") as Classification["intent"],
    confidence: typeof data.confidence === "number" ? data.confidence : 0.7,
  };
}

// ---------- study pack ----------
export async function createStudyPack(args: {
  topic: string;
  subject: string;
  sourceText: string;
  gradeLevel?: string;
}): Promise<StudyPack> {
  const { data } = await llmJson<{ clean_notes: string; reviewer: string; flashcards: Flashcard[]; quiz: QuizItem[]; summary: string; story?: string }>({
    system: `You create a study pack for a student on ONE topic from their messy source notes.
Return JSON: {"clean_notes": markdown string, "reviewer": markdown string, "flashcards": [{"front","back"}] (6-10), "quiz": [{"question","choices":[4 strings],"answer":"0"|"1"|"2"|"3" (index of correct choice),"explanation"}] (4-6), "summary": 3-4 sentences, "story": a short memorable story/analogy that teaches the core idea (6-10 sentences)}.
Rules: accurate, grade-appropriate, no filler; quiz answer MUST be the index string of the correct choice.`,
    user: `Topic: ${args.topic}\nSubject: ${args.subject}\nGrade level: ${args.gradeLevel || "high school"}\n\nMessy source notes from the student:\n"""${args.sourceText.slice(0, 6000)}"""`,
    maxTokens: 3500,
  });

  const quiz: QuizItem[] = (data.quiz || []).map((q) => ({
    question: q.question,
    choices: Array.isArray(q.choices) ? q.choices.map(String) : [],
    answer: String(q.answer),
    explanation: q.explanation || "",
  }));

  return {
    clean_notes: data.clean_notes || "",
    reviewer: data.reviewer || "",
    flashcards: (data.flashcards || []).map((f) => ({ front: f.front, back: f.back })),
    quiz,
    summary: data.summary || "",
    story: data.story || "",
  };
}

// ---------- teaching ----------
export async function teachTopic(args: {
  topic: string;
  subject: string;
  question: string;
  history: ChatMessage[];
  profile?: { learning_style: string; weaknesses: string[]; strengths: string[] } | null;
  sourceText?: string;
}): Promise<{ reply: string; keyTerms: string[] }> {
  const { data } = await llmJson<{ reply: string; key_terms: string[] }>({
    system: `You are Tutorium, a warm voice-first tutor. The student may be listening, not reading — so:
- start with the core idea in one sentence
- explain in short spoken-style paragraphs
- use a concrete analogy
- end by inviting a follow-up
- if the student has weaknesses, address them; if they prefer a style, use it
Return JSON: {"reply": string (markdown, ~180-280 words), "key_terms": [4-8 important terms you used]}`,
    user: `Topic: ${args.topic} (Subject: ${args.subject})
Student profile: style=${args.profile?.learning_style || "unknown"}; weaknesses=${(args.profile?.weaknesses || []).join(", ") || "none"}; strengths=${(args.profile?.strengths || []).join(", ") || "none"}
${args.sourceText ? `Source notes context:\n"""${args.sourceText.slice(0, 3000)}"""\n` : ""}
Recent conversation:
${args.history.slice(-6).map((m) => `${m.role}: ${m.content.slice(0, 200)}`).join("\n")}

Student asks: """${args.question.slice(0, 1200)}"""`,
    maxTokens: 1200,
  });
  return { reply: data.reply || "", keyTerms: (data.key_terms || []).map(String).slice(0, 8) };
}

// ---------- memory ----------
export async function updateMemory(args: {
  message: string;
  reply: string;
  profile: { learning_style: string; strengths: string[]; weaknesses: string[] };
}): Promise<MemoryUpdate> {
  const { data } = await llmJson<MemoryUpdate>({
    system: `You update a learner profile from one exchange.
Return JSON: {"learning_style_update": string (or "" to keep), "strength_update": string (or ""), "weakness_update": string (or ""), "next_recommended_action": string, "student_note": one-sentence memory worth keeping about this student}`,
    user: `Current profile: style=${args.profile.learning_style}; strengths=${args.profile.strengths.join(", ") || "none"}; weaknesses=${args.profile.weaknesses.join(", ") || "none"}
Student said: """${args.message.slice(0, 800)}"""
Tutor replied: """${args.reply.slice(0, 800)}"""`,
    maxTokens: 500,
  });
  return {
    learning_style_update: data.learning_style_update || "",
    weakness_update: data.weakness_update || "",
    strength_update: data.strength_update || "",
    next_recommended_action: data.next_recommended_action || "",
    student_note: data.student_note || "",
  };
}

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

// ---------- visual designer (produces real HTML, not a stub) ----------
export async function generateVisual(args: {
  topic: string;
  subject: string;
  sourceText: string;
}): Promise<{ html: string; title: string }> {
  const { data } = await llmJson<{ title: string; html: string }>({
    system: `You design an engaging self-contained HTML visual for a lesson so a student can understand it at a glance.
Generate a SINGLE clean HTML snippet using ONLY these inline-safe pieces:
- Semantic elements: h1/h2, p, ul/li, table
- One <style> block with a dark-on-light palette you choose
- Optional inline <svg> for a simple diagram
NO external CSS/JS, NO script tags, NO <html>/<body>/<head> wrapper, NO iframes. Keep it under ~60 lines.
Return JSON: {"title": string, "html": string}`,
    user: `Topic: ${args.topic} (Subject: ${args.subject})
Source material:
"""${String(args.sourceText).slice(0, 3000)}"""`,
    maxTokens: 1600,
    temperature: 0.2,
  });
  const html = (data.html || "").replace(/<script[\s\S]*?<\/script>/gi, "").slice(0, 8000);
  return { html, title: data.title || `${args.topic} — Visual Guide` };
}

// ---------- teach-back grader (Feynman mode) ----------
export async function gradeTeachBack(args: {
  topic: string;
  transcript: string;
  sourceText: string;
}): Promise<{ verdict: string; missed: string[]; next_step: string }> {
  const { data } = await llmJson<{ verdict: string; missed: string[]; next_step: string }>({
    system: `A student tried to explain a topic in their own words (Feynman technique). Grade the explanation against the source material.
Return JSON: {"verdict": 1-2 sentence assessment, "missed": [2-4 key points they skipped or got wrong, phrased as short points], "next_step": one concrete action for the student}`,
    user: `Topic: ${args.topic}
Source material (ground truth):
"""${args.sourceText.slice(0, 4000)}"""

Student's spoken explanation (transcript):
"""${args.transcript.slice(0, 3000)}"""`,
    maxTokens: 700,
  });
  return {
    verdict: data.verdict || "",
    missed: (data.missed || []).map(String).slice(0, 4),
    next_step: data.next_step || "",
  };
}