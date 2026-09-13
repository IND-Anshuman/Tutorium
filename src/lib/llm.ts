// OpenAI-compatible LLM client — provider fully configurable via env:
//   TUTORIUM_LLM_BASE_URL      (any OpenAI-compatible /v1 endpoint)
//   TUTORIUM_LLM_API_KEY       (defaults to FEATHERLESS_API_KEY)
//   TUTORIUM_LLM_MODEL         (defaults to zai-org/GLM-5.3-Flash)
//   TUTORIUM_LLM_FALLBACK_MODEL
// So switching providers (Featherless → Token Factory / OpenRouter / Groq / etc.)
// is purely an .env change.
//
// Latency design:
//  - Two timeouts: PRIMARY (fast — give up + fall back quickly) and FALLBACK (patient).
//  - Empty LLM response is non-retryable (the model is up but confused; a retry
//    burns another 20s for the same answer), so it goes straight to fallback.
//  - AbortSignal is plumbed through so the route's Cancel button can interrupt
//    mid-call (not just between calls).
//  - JSON extraction is tolerant + retryable JSON parses against the same fallback chain.

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRuntime {
  provider: string;
  model: string;
  fallback: boolean;
}

export class LlmError extends Error {}

const BASE_URL = (process.env.TUTORIUM_LLM_BASE_URL || "https://api.featherless.ai/v1").replace(/\/$/, "");
const LLM_PROVIDER =
  (() => {
    try {
      const host = new URL(BASE_URL).hostname || "";
      const parts = host.split(".");
      const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
      return label === "api" || !label ? (parts[0] || "openai-compatible") : label;
    } catch {
      return "openai-compatible";
    }
  })();
const PRIMARY_MODEL =
  process.env.TUTORIUM_LLM_MODEL || process.env.FEATHERLESS_MODEL || "zai-org/GLM-5.3-Flash";
const FALLBACK_MODEL =
  process.env.TUTORIUM_LLM_FALLBACK_MODEL || "Qwen/Qwen2.5-7B-Instruct";
const API_KEY = process.env.TUTORIUM_LLM_API_KEY || process.env.FEATHERLESS_API_KEY || "";
const PRIMARY_TIMEOUT_MS = Number(process.env.TUTORIUM_LLM_PRIMARY_TIMEOUT_MS || 22_000);
const FALLBACK_TIMEOUT_MS = Number(process.env.TUTORIUM_LLM_FALLBACK_TIMEOUT_MS || 35_000);
const RETRY_BACKOFF_MS = Number(process.env.TUTORIUM_LLM_RETRY_BACKOFF_MS || 600);
// Retry only on transient HTTP errors / network errors, NOT on empty responses
// (which would waste another full primary timeout for the same result).
const MAX_RETRIES = 1;

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  // Bridge outer signal into our controller — when the route cancels, we cancel.
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(t);
    if (signal) signal.removeEventListener("abort", onAbort);
  });
}

function responseFormat(): Record<string, unknown> {
  return { response_format: { type: "json_object" } };
}

// Tolerant JSON extraction: strip fences, find outermost object/array.
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    const as = candidate.indexOf("[");
    const ae = candidate.lastIndexOf("]");
    if (as !== -1 && ae > as) return candidate.slice(as, ae + 1);
    throw new LlmError("no JSON object found in LLM output");
  }
  return candidate.slice(start, end + 1);
}

class EmptyResponseError extends Error {
  constructor() { super("empty LLM response"); this.name = "EmptyResponseError"; }
}
class AbortedError extends Error {
  constructor() { super("aborted"); this.name = "AbortError"; }
}

async function callOnce(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      `${BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: `${system}\n\nRespond with ONLY a valid JSON object. No markdown fences, no commentary before or after.` },
            { role: "user", content: user },
          ],
          temperature,
          max_tokens: maxTokens,
          ...responseFormat(),
        }),
      },
      timeoutMs,
      signal
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        throw new LlmError(`Featherless auth ${res.status}: ${text.slice(0, 160)}`);
      }
      throw new LlmError(`Featherless ${res.status}: ${text.slice(0, 300)}`);
    }
    const payload = await res.json();
    const content: string = payload.choices?.[0]?.message?.content || "";
    if (!content) throw new EmptyResponseError();
    return content;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new AbortedError();
    throw e;
  }
}

// Try to parse; if it fails, retry the *parse* once (transient JSON quirks — e.g.
// a stray quote mid-string — sometimes succeed with the same payload).
function safeParse<T>(raw: string): T {
  try {
    return JSON.parse(extractJson(raw)) as T;
  } catch (e1) {
    try {
      return JSON.parse(extractJson(raw)) as T;
    } catch (e2) {
      throw e1; // surface original
    }
  }
}

export async function llmJson<T>(args: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<{ data: T; runtime: LlmRuntime }> {
  if (!API_KEY || API_KEY === "placeholder") {
    throw new LlmError("No LLM API key set (TUTORIUM_LLM_API_KEY or FEATHERLESS_API_KEY) — run `npm run env:sync`");
  }

  const maxTokens = args.maxTokens ?? 2000;
  const temperature = args.temperature ?? 0.3;
  let lastErr: Error | null = null;
  let emptyRetried = false;

  // Primary model — fast fail on transient errors, single retry; empty response
  // is non-retryable and immediately drops to fallback.
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (args.signal?.aborted) throw new AbortedError();
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    try {
      const content = await callOnce(PRIMARY_MODEL, args.system, args.user, maxTokens, temperature, PRIMARY_TIMEOUT_MS, args.signal);
      return { data: safeParse<T>(content), runtime: { provider: LLM_PROVIDER, model: PRIMARY_MODEL, fallback: false } };
    } catch (e) {
      const err = e as Error;
      lastErr = err;
      if (err.name === "AbortError") throw err;
      // auth errors are not retryable
      if (err instanceof LlmError && /auth|401|403/.test(err.message)) break;
      // empty LLM response: skip the rest of the primary retries, drop to fallback
      if (err instanceof EmptyResponseError) {
        if (!emptyRetried) { emptyRetried = true; continue; }
        break;
      }
    }
  }

  // Fallback model — patient timeout, single attempt.
  try {
    if (args.signal?.aborted) throw new AbortedError();
    console.warn(`primary ${PRIMARY_MODEL} failed, falling back to ${FALLBACK_MODEL}:`, lastErr?.message);
    const content = await callOnce(FALLBACK_MODEL, args.system, args.user, maxTokens, temperature, FALLBACK_TIMEOUT_MS, args.signal);
    return { data: safeParse<T>(content), runtime: { provider: LLM_PROVIDER, model: FALLBACK_MODEL, fallback: true } };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    lastErr = e as Error;
  }

  throw new LlmError(`LLM failed after retries (${PRIMARY_MODEL} + ${FALLBACK_MODEL}): ${lastErr?.message}`);
}

export function llmConfigured() {
  return Boolean(API_KEY && API_KEY !== "placeholder");
}

export function llmRuntimeLabel() {
  return llmConfigured() ? LLM_PROVIDER : "not-configured";
}