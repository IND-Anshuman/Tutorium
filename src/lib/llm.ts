// OpenAI-compatible LLM client — provider fully configurable via env:
//   TUTORIUM_LLM_BASE_URL      (any OpenAI-compatible /v1 endpoint)
//   TUTORIUM_LLM_API_KEY       (defaults to FEATHERLESS_API_KEY)
//   TUTORIUM_LLM_MODEL         (defaults to zai-org/GLM-5.3-Flash)
//   TUTORIUM_LLM_FALLBACK_MODEL
// So switching providers (Featherless → Token Factory / OpenRouter / Groq / etc.)
// is purely an .env change. Retry with backoff + tolerant JSON extraction.

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
      // "api.tokfactory.ai" -> "tokfactory", "openrouter.ai" -> "openrouter"
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
const REQUEST_TIMEOUT_MS = Number(process.env.TUTORIUM_LLM_TIMEOUT_MS || 45_000);
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 800;

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(t));
}

function responseFormat(): Record<string, unknown> {
  // Ask the provider for strict JSON when it's supported; harmless otherwise.
  return { response_format: { type: "json_object" } };
}

// Tolerant JSON extraction: strip fences, find outermost object, repair common
// truncation/quote escapes the way a demo needs so a single bad character
// doesn't kill the turn.
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let candidate = (fenced ? fenced[1] : text).trim();

  // Strip prose the model sometimes prepends/appends ("Here is your JSON: ...")
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    // Some models emit a JSON array instead — try that.
    const as = candidate.indexOf("[");
    const ae = candidate.lastIndexOf("]");
    if (as !== -1 && ae > as) return candidate.slice(as, ae + 1);
    throw new LlmError("no JSON object found in LLM output");
  }
  return candidate.slice(start, end + 1);
}

async function callOnce(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
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
    REQUEST_TIMEOUT_MS
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // 401/403 = key problem; retrying won't help.
    if (res.status === 401 || res.status === 403) {
      throw new LlmError(`Featherless auth ${res.status}: ${text.slice(0, 160)}`);
    }
    throw new LlmError(`Featherless ${res.status}: ${text.slice(0, 300)}`);
  }
  const payload = await res.json();
  const content: string = payload.choices?.[0]?.message?.content || "";
  if (!content) throw new LlmError("empty LLM response");
  return content;
}

export async function llmJson<T>(args: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ data: T; runtime: LlmRuntime }> {
  if (!API_KEY || API_KEY === "placeholder") {
    throw new LlmError("No LLM API key set (TUTORIUM_LLM_API_KEY or FEATHERLESS_API_KEY) — run `npm run env:sync`");
  }

  const maxTokens = args.maxTokens ?? 2000;
  const temperature = args.temperature ?? 0.3;
  let lastErr: Error | null = null;

  // primary model, with retry/backoff
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * 2 ** (attempt - 1)));
    try {
      const content = await callOnce(PRIMARY_MODEL, args.system, args.user, maxTokens, temperature);
      const data = JSON.parse(extractJson(content)) as T;
      return { data, runtime: { provider: LLM_PROVIDER, model: PRIMARY_MODEL, fallback: false } };
    } catch (e) {
      lastErr = e as Error;
      // don't retry auth errors
      if (e instanceof LlmError && /auth|401|403/.test(e.message)) break;
    }
  }

  // fallback model, single attempt, best effort
  try {
    console.warn(`primary ${PRIMARY_MODEL} failed, falling back to ${FALLBACK_MODEL}:`, lastErr?.message);
    const content = await callOnce(FALLBACK_MODEL, args.system, args.user, maxTokens, temperature);
    const data = JSON.parse(extractJson(content)) as T;
    return { data, runtime: { provider: LLM_PROVIDER, model: FALLBACK_MODEL, fallback: true } };
  } catch (e) {
    lastErr = e as Error;
  }

  throw new LlmError(`LLM failed after retries (${PRIMARY_MODEL} + ${FALLBACK_MODEL}): ${lastErr?.message}`);
}

export function llmConfigured() {
  return Boolean(API_KEY && API_KEY !== "placeholder");
}

// Human/provider label for surfacing in API responses + the health check.
export function llmRuntimeLabel() {
  return llmConfigured() ? LLM_PROVIDER : "not-configured";
}