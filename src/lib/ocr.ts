// Vision-language OCR client — runs against the SAME OpenAI-compatible
// endpoint as the LLM (`TUTORIUM_LLM_BASE_URL/chat/completions`), just with
// a vision model id (e.g. `Qwen/Qwen3-VL-30B-A3B-Instruct`) and an
// image-bearing message.
//
// Why a VLM and not a dedicated OCR engine:
//   - PaddleOCR / Tesseract / EasyOCR all have platform quirks on Windows
//     (CPU inference bugs, missing models, missing native deps). Spinning up
//     a local OCR engine is heavy and fragile.
//   - The existing LLM auth + base URL + timeout plumbing is already battle-
//     tested. A VLM drops in as a one-route fallback for scanned PDFs.
//   - You're already paying Featherless for inference; one more model on the
//     same bill is cheaper than a third vendor.
//
// Trade-offs:
//   - Cost is per-image-tokens, not per-page-flat. We cap pages + DPI to keep
//     spend predictable (see MAX_OCR_PAGES, MAX_OCR_PIXELS).
//   - VLMs are not perfect OCR — printed text is great, dense handwriting
//     drifts. The returned text is consumed by the same `docthink` pipeline
//     as `unpdf` output, which already tolerates noisy text.
//
// Latency design (mirrors llm.ts):
//   - Single timeout (no fallback model — most providers don't ship a second
//     vision model, and OCR is best-effort: if it fails the route surfaces
//     a friendly 422 and the user can fall back to text-PDFs).
//   - AbortSignal bridges through so the route can cancel mid-call.

const BASE_URL = (process.env.TUTORIUM_LLM_BASE_URL || "https://api.featherless.ai/v1").replace(/\/$/, "");
const OCR_MODEL = process.env.TUTORIUM_OCR_MODEL || "Qwen/Qwen3-VL-30B-A3B-Instruct";
// Default to the LLM key so a fresh .env.local "just works" — override only
// if you want OCR billed to a separate account.
const OCR_API_KEY = process.env.TUTORIUM_OCR_API_KEY || process.env.TUTORIUM_LLM_API_KEY || process.env.FEATHERLESS_API_KEY || "";
const OCR_TIMEOUT_MS = Number(process.env.TUTORIUM_OCR_TIMEOUT_MS || 90_000);

// Cost guardrails. Anything bigger than this and we either refuse (file too
// large for the route) or skip the OCR fallback (return 422 with a friendly
// hint to split the document).
export const MAX_OCR_PAGES = 3;
export const MAX_OCR_PIXELS = 1500; // longest side, px
// Rough ceiling on the data URL we POST. ~5MB keeps the request under most
// provider limits and well below Cloud Run's body limit (we've already
// gated the route at 30MB before this is called).
const MAX_OCR_BYTES = 5 * 1024 * 1024;

export class OcrError extends Error {}

export interface OcrResult {
  text: string;
  pages: number;
  model: string;
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
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

export function ocrConfigured(): boolean {
  return Boolean(OCR_API_KEY && OCR_API_KEY !== "placeholder");
}

export function ocrModelLabel(): string {
  return ocrConfigured() ? OCR_MODEL : "not-configured";
}

// `pngPages` is an array of PNG-encoded page images (already rasterized by
// the route via pymupdf/Pillow — but in Node land we'd use sharp / a future
// native rasterizer). For now the route rasterizes via a Python child if
// needed; this client just takes the rendered bytes.
export async function ocrImages(
  pngPages: Buffer[],
  opts: { signal?: AbortSignal } = {}
): Promise<OcrResult> {
  if (!ocrConfigured()) {
    throw new OcrError(
      "OCR not configured: set TUTORIUM_OCR_API_KEY (or TUTORIUM_LLM_API_KEY) and TUTORIUM_OCR_MODEL."
    );
  }
  if (pngPages.length === 0) {
    throw new OcrError("ocrImages: no pages provided");
  }
  if (pngPages.length > MAX_OCR_PAGES) {
    throw new OcrError(
      `OCR is capped at ${MAX_OCR_PAGES} pages per request — your document has ${pngPages.length}. ` +
        `For longer scans, split the PDF or use a text PDF.`
    );
  }

  // Build the message content: text prompt + N image_url entries.
  // Most VLMs handle multiple images in one message; we send them in order.
  const content: any[] = [
    {
      type: "text",
      text:
        "You are an OCR engine. Transcribe every word of text visible in the " +
        "supplied page images, in reading order. Preserve headings, lists, and " +
        "paragraph breaks. Output ONLY the transcribed text — no commentary, no " +
        "markdown fences, no preamble. If a page is blank, output a single blank line.",
    },
  ];
  for (const buf of pngPages) {
    if (buf.length > MAX_OCR_BYTES) {
      throw new OcrError(
        `OCR page exceeds ${MAX_OCR_BYTES / 1024 / 1024}MB after rasterization — ` +
          "try a lower DPI or split the document."
      );
    }
    const b64 = buf.toString("base64");
    content.push({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${b64}` },
    });
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OCR_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OCR_MODEL,
          messages: [{ role: "user", content }],
          temperature: 0, // deterministic OCR
          max_tokens: 4096,
          // NOTE: deliberately no `response_format: json_object` — OCR output
          // is free text, not JSON. Forcing json_object makes some providers
          // add preamble to coerce shape, which corrupts the text.
        }),
      },
      OCR_TIMEOUT_MS,
      opts.signal
    );
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    throw new OcrError(`OCR request failed: ${e?.message || e}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OcrError(`OCR provider ${res.status}: ${body.slice(0, 300)}`);
  }

  const payload = await res.json();
  const text: string = payload.choices?.[0]?.message?.content || "";
  if (!text.trim()) {
    throw new OcrError("OCR provider returned empty text — the pages may be blank or unreadable");
  }
  return { text: text.trim(), pages: pngPages.length, model: OCR_MODEL };
}
