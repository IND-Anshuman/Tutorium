// On-demand summarization of freshly supplied text (pasted or attached document).
// Separate from the study-pack brief: this produces a user-facing summary whose
// length the learner controls, and doubles as the Say-It-Back passage source.
import { llmJson } from "./llm";

export type SummaryLength = "quick" | "standard" | "deep";

const LENGTH_TOKENS: Record<SummaryLength, number> = { quick: 500, standard: 900, deep: 1800 };
const LENGTH_WORDS: Record<SummaryLength, string> = {
  quick: "3-4 sentences",
  standard: "1-2 short paragraphs",
  deep: "4-5 paragraphs with section headers",
};

export function parseSummaryLength(message: string): SummaryLength {
  const m = (message || "").toLowerCase();
  if (/\bquick|brief|short\b/.test(m)) return "quick";
  if (/\bdeep|detailed|thorough|extensive\b/.test(m)) return "deep";
  return "standard";
}

export async function summarizeText(args: {
  text: string;
  length: SummaryLength;
  subject?: string;
  signal?: AbortSignal;
}): Promise<{ summary: string; keyTerms: string[] }> {
  const { data } = await llmJson<{ summary: string; key_terms: string[] }>({
    system: `You are a study tutor producing a ${args.length} summary a student can revise from.
Return JSON {"summary": ${LENGTH_WORDS[args.length]}, "key_terms": [6-12 terms a student must remember]}. No markdown fences.`,
    user: `${args.subject ? `Subject: ${args.subject}\n` : ""}Text to summarize:\n"""${args.text}"""`,
    maxTokens: LENGTH_TOKENS[args.length],
    temperature: 0.2,
    signal: args.signal,
  });
  return { summary: data.summary || "", keyTerms: (data.key_terms || []).map(String).slice(0, 12) };
}

// Heuristic: does this chat message carry a document body worth summarizing
// fresh, rather than replaying a stored summary? Triple-quotes or >400 chars.
export function messageCarriesText(message: string): boolean {
  const m = message || "";
  return m.includes('"""') || m.length > 400;
}

// Strip a leading instruction line so "summarize this: <body>" keeps only the body.
export function extractBody(message: string): string {
  const m = (message || "").trim();
  const fenced = m.match(/"""([\s\S]+)"""/);
  if (fenced) return fenced[1].trim();
  const idx = m.indexOf(":");
  return idx > -1 && idx < 120 ? m.slice(idx + 1).trim() : m;
}