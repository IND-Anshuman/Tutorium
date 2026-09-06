// Featherless LLM client — OpenAI-compatible chat completions, Bearer auth.
// Same shape as PADAYON's fireworks.ts but pointed at the user's Featherless key.
// Every agent goes through here so the provider is swappable in ONE place.

const BASE_URL = (process.env.TUTORIUM_LLM_BASE_URL || "https://api.featherless.ai/v1").replace(/\/$/, "");
const MODEL = process.env.TUTORIUM_LLM_MODEL || "Qwen/Qwen3-32B";
const API_KEY = process.env.FEATHERLESS_API_KEY || "";
const REQUEST_TIMEOUT_MS = 90_000;

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRuntime {
  provider: "featherless";
  model: string;
  fallback: boolean;
}

export class LlmError extends Error {}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function extractJson(text: string): string {
  // Strip markdown fences and grab the outermost JSON object.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new LlmError("no JSON object found in LLM output");
  }
  return candidate.slice(start, end + 1);
}

export async function llmJson<T>(args: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ data: T; runtime: LlmRuntime }> {
  const key = API_KEY;
  if (!key || key === "placeholder") throw new LlmError("FEATHERLESS_API_KEY not set — run `npm run env:sync`");

  const res = await fetchWithTimeout(
    `${BASE_URL}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: `${args.system}\n\nRespond with ONLY a valid JSON object. No markdown fences, no commentary before or after.` },
          { role: "user", content: args.user },
        ],
        temperature: args.temperature ?? 0.3,
        max_tokens: args.maxTokens ?? 2000,
      }),
    },
    REQUEST_TIMEOUT_MS
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LlmError(`Featherless ${res.status}: ${text.slice(0, 300)}`);
  }

  const payload = await res.json();
  const content: string = payload.choices?.[0]?.message?.content || "";
  if (!content) throw new LlmError("empty LLM response");
  const runtime: LlmRuntime = {
    provider: "featherless",
    model: payload.model || MODEL,
    fallback: false,
  };
  return { data: JSON.parse(extractJson(content)) as T, runtime };
}

export function llmConfigured() {
  return Boolean(API_KEY && API_KEY !== "placeholder");
}