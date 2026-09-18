// docthink — document analysis + study-plan generation for attached documents.
// Map-reduce over chunks when the doc exceeds one comfortable LLM call; every
// stage has a deterministic fallback so a flaky model never bricks the feature.
import { llmJson } from "./llm";
import { extractText } from "unpdf";

export interface DocSection {
  title: string;
  summary: string;
}

export interface DocAnalysis {
  filename: string;
  pageCount: number;
  summary: string;
  keyTerms: string[];
  sections: DocSection[];
  difficulty: string;
  prerequisites: string[];
}

export interface StudyPlanDay {
  day: number;
  focus: string;
  tasks: string[];
  minutes: number;
  drill: string;
}

export interface StudyPlan {
  days: StudyPlanDay[];
}

// ---- extraction (server-side helper shared by the ingest route and direct calls) ----
export async function extractPdfText(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const pdf = await (await import("unpdf")).getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages: string[] = Array.isArray(text) ? text : [String(text)];
  return { pages: totalPages, text: pages.join("\n\n").trim() };
}

// ---- chunking (pure, tested) ----
export function chunkDocument(text: string, targetChars = 3500, overlap = 120): string[] {
  const clean = (text || "").trim();
  if (!clean) return [];
  if (clean.length <= targetChars) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + targetChars, clean.length);
    if (end < clean.length) {
      // never split mid-sentence: back off to the last sentence end
      const slice = clean.slice(start, end);
      const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(".\n"), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
      if (lastStop > targetChars * 0.5) end = start + lastStop + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

// ---- map-reduce analysis ----
const SINGLE_CALL_CHARS = 14_000;

export async function analyzeDocument(args: {
  text: string;
  filename: string;
  pageCount?: number;
  signal?: AbortSignal;
}): Promise<DocAnalysis> {
  const { text, filename, signal } = args;
  const chunks = chunkDocument(text);
  const outlineOrNull = async <T>(p: Promise<T>): Promise<T | null> => {
    try { return await p; } catch { return null; }
  };
  const outlinesRaw =
    chunks.length === 1 && text.length <= SINGLE_CALL_CHARS
      ? [await outlineChunk(text, signal)]
      : await Promise.all(chunks.map((c) => outlineOrNull(outlineChunk(c, signal))));
  const outlines = outlinesRaw.filter((o): o is NonNullable<typeof o> => o !== null && !!o.summary);
  if (!outlines.length) {
    return {
      filename, pageCount: args.pageCount ?? 0,
      summary: "This document could not be summarized automatically.",
      keyTerms: [], sections: [], difficulty: "intermediate", prerequisites: [],
    };
  }

  let summary = "";
  let keyTerms: string[] = [];
  let sections: DocSection[] = [];
  let difficulty = "intermediate";
  let prerequisites: string[] = [];

  if (outlines.length === 1) {
    summary = outlines[0].summary;
    keyTerms = outlines[0].key_terms;
    sections = outlines[0].sections || [];
    difficulty = outlines[0].difficulty || difficulty;
    prerequisites = outlines[0].prerequisites || [];
  } else {
    try {
      const { data } = await llmJson<{
        summary: string; key_terms: string[]; sections: DocSection[]; difficulty: string; prerequisites: string[];
      }>({
        system: `You merge section outlines of one document into a single study analysis. Return JSON {"summary" (<=250 words), "key_terms" (<=15), "sections": [{"title","summary"}], "difficulty" (beginner|intermediate|advanced), "prerequisites": [..]}. No fences.`,
        user: `Document: ${filename}\n\nOutlines:\n${outlines.map((o, i) => `--- part ${i + 1} ---\n${o.summary}`).join("\n")}`,
        maxTokens: 1400,
        temperature: 0.2,
        signal,
      });
      summary = data.summary || outlines.map((o) => o.summary).join("\n\n");
      keyTerms = (data.key_terms || outlines.flatMap((o) => o.key_terms)).map(String).slice(0, 15);
      sections = data.sections || [];
      difficulty = data.difficulty || difficulty;
      prerequisites = (data.prerequisites || []).map(String).slice(0, 8);
    } catch {
      // Deterministic fallback: concat chunk outlines rather than failing the flow.
      summary = outlines.map((o) => o.summary).join("\n\n");
      keyTerms = [...new Set(outlines.flatMap((o) => o.key_terms))].slice(0, 15);
    }
  }

  return {
    filename,
    pageCount: args.pageCount ?? 0,
    summary: summary || "This document could not be summarized automatically.",
    keyTerms,
    sections,
    difficulty,
    prerequisites,
  };
}

async function outlineChunk(chunk: string, signal?: AbortSignal): Promise<{
  summary: string; key_terms: string[]; sections?: DocSection[]; difficulty?: string; prerequisites?: string[];
}> {
  const { data } = await llmJson<{
    summary: string; key_terms: string[]; sections?: DocSection[]; difficulty?: string; prerequisites?: string[];
  }>({
    system: `Outline one part of a study document. Return JSON {"summary" (<=150 words, concrete), "key_terms" (<=10), "sections" if visible, "difficulty" (beginner|intermediate|advanced), "prerequisites" if any}. No fences.`,
    user: `Part:\n"""${chunk}"""`,
    maxTokens: 500,
    temperature: 0.2,
    signal,
  });
  return {
    summary: data.summary || "",
    key_terms: (data.key_terms || []).map(String),
    sections: data.sections,
    difficulty: data.difficulty,
    prerequisites: data.prerequisites,
  };
}

// ---- study plan ----
export async function buildStudyPlan(args: {
  analysis: DocAnalysis;
  days?: number;
  signal?: AbortSignal;
}): Promise<StudyPlan> {
  const dayCount = Math.max(2, Math.min(14, args.days ?? 5));
  try {
    const { data } = await llmJson<{ days: StudyPlanDay[] }>({
      system: `You design a realistic spaced study plan. Return JSON {"days": [{"day":1,"focus":"..","tasks":[".."],"minutes":30,"drill":"quiz|flashcards|say_it_back|teach_back"}]}. Exactly ${dayCount} days, 20-60 minutes each, escalating difficulty, final day is review + self-test.`,
      user: `Document: ${args.analysis.filename}\nSummary: ${args.analysis.summary.slice(0, 1500)}\nKey terms: ${args.analysis.keyTerms.join(", ")}`,
      maxTokens: 1200,
      temperature: 0.4,
      signal: args.signal,
    });
    if (data.days?.length) return { days: data.days.slice(0, dayCount) };
  } catch {
    // fall through to skeleton
  }
  // Deterministic skeleton plan (never fails, always sensible)
  const terms = args.analysis.keyTerms;
  const perDay = Math.max(1, Math.ceil(terms.length / dayCount));
  const drills = ["quiz", "flashcards", "say_it_back", "teach_back"];
  return {
    days: Array.from({ length: dayCount }, (_, i) => ({
      day: i + 1,
      focus: i === dayCount - 1
        ? "Full review + self-test"
        : `Core concepts part ${i + 1}: ${(terms.slice(i * perDay, (i + 1) * perDay).join(", ") || "document section " + (i + 1))}`,
      tasks: i === dayCount - 1
        ? ["Re-read the summary", "Run a mixed quiz", "Say the passage back without looking"]
        : ["Read the summary", "Review the key terms", "Explain the focus aloud in your own words"],
      minutes: 30,
      drill: i === dayCount - 1 ? "quiz" : drills[i % drills.length],
    })),
  };
}

// Sub-intent parsing for the document branch.
export function parseDocIntent(message: string): "plan" | "summarize" | "quiz" {
  const m = (message || "").toLowerCase();
  if (/\b(plan|schedule|timetable|routine|day.?by.?day)\b/.test(m)) return "plan";
  if (/\bquiz|test me|question me\b/.test(m)) return "quiz";
  return "summarize";
}