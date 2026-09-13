// Compact + persist a running session context. The LLM-free merge helper does
// the deterministic bookkeeping (caps + dedup + merge) so a flaky primary model
// can't blow up the context shape.
import { llmJson } from "./llm";
import { getSessionContext, setSessionContext, type SessionContext, defaultContext } from "./db";

export type { SessionContext };

const MAX_KEY_TERMS = 12;
const MAX_WEAK_AREAS = 6;
const MAX_SHORT_NOTES = 8;

function uniqPush(existing: string[], incoming: string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of [...existing, ...(incoming || [])]) {
    const v = (x || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}

export function mergeIntoContext(
  prev: SessionContext,
  next: {
    summary?: string;
    level?: string;
    new_terms?: string[];
    new_weak?: string[];
    new_notes?: string[];
  }
): SessionContext {
  return {
    summary: (next.summary || "").trim() || prev.summary,
    level: (next.level || "").trim() || prev.level || "unknown",
    key_terms: uniqPush(prev.key_terms || [], next.new_terms || [], MAX_KEY_TERMS),
    weak_areas: uniqPush(prev.weak_areas || [], next.new_weak || [], MAX_WEAK_AREAS),
    short_notes: uniqPush(prev.short_notes || [], next.new_notes || [], MAX_SHORT_NOTES),
    updated_at: new Date().toISOString(),
  };
}

export async function compactSessionContext(
  sessionId: string,
  recentMessages: Array<{ role: string; content: string }>
): Promise<SessionContext> {
  const prev = getSessionContext(sessionId) ?? defaultContext();
  const recent = recentMessages
    .slice(-6)
    .map((m) => `${m.role}: ${(m.content || "").slice(0, 220)}`)
    .join("\n");

  // LLM summarizer produces the new fields; we apply the deterministic merge.
  const { data } = await llmJson<{
    summary: string;
    level: string;
    new_terms: string[];
    new_weak: string[];
    new_notes: string[];
  }>({
    system: `You compact a tutor's running session context. Merge the new exchange into the existing one. Output JSON {"summary","level","new_terms","new_weak","new_notes"}. summary<=140 words. level ∈ {unknown,beginner,intermediate,advanced}.`,
    user: `Previous summary:\n${prev.summary || "(none yet)"}\n\nRecent exchange:\n${recent || "(empty)"}\n\nReturn merged context.`,
    maxTokens: 400,
  });

  const merged = mergeIntoContext(prev, data);
  setSessionContext(sessionId, merged);
  return merged;
}

// ---- in-process debounce map ----
// `scheduleCompaction` runs compaction 1500ms after the last call per session.
// At most one in-flight at a time. Per-process; fine for a single-server demo.
const timers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 1500;

export function scheduleCompaction(
  sessionId: string,
  recentMessages: Array<{ role: string; content: string }>
) {
  const prev = timers.get(sessionId);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    timers.delete(sessionId);
    compactSessionContext(sessionId, recentMessages).catch((e) => {
      console.warn("compaction failed:", (e as Error).message);
    });
  }, DEBOUNCE_MS);
  timers.set(sessionId, t);
}

// Test-only helper: clear pending timers.
export function _resetCompactorForTests() {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
}